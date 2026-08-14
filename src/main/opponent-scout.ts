import type {
  MatchContextStage,
  OpponentFormSummary,
  OpponentFormTier,
} from '../shared/contracts.js'

export interface OpponentIdentity {
  puuid: string
  championId: number | null
}

const positiveInteger = (value: unknown): number | null => {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export function isPuuid(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,120}$/.test(value)
}

const visibleIdentity = (player: any): OpponentIdentity | null => {
  if (!isPuuid(player?.puuid)) return null
  const visibility = String(player?.nameVisibilityType ?? '').trim().toUpperCase()
  if (visibility && visibility !== 'VISIBLE') return null
  // A PUUID being present in an internal payload is not evidence that Riot
  // intended the identity to be visible. Only the explicit LCU visibility
  // marker is accepted; public-looking names alone are not enough.
  if (visibility !== 'VISIBLE') return null
  return {
    puuid: player.puuid,
    championId: positiveInteger(
      player?.championId ?? player?.championPickIntent ?? player?.champion?.id,
    ),
  }
}

const uniqueIdentities = (players: any[]): OpponentIdentity[] => {
  const seen = new Set<string>()
  const result: OpponentIdentity[] = []
  for (const player of players) {
    const identity = visibleIdentity(player)
    if (!identity || seen.has(identity.puuid)) continue
    seen.add(identity.puuid)
    result.push(identity)
  }
  return result
}

const completeVisibleTeam = (players: any[]): OpponentIdentity[] => {
  if (players.length !== 5) return []
  const identities = uniqueIdentities(players)
  return identities.length === 5 ? identities : []
}

/**
 * Extracts opponents only when the local player can be placed on one of two
 * explicit teams. Hidden/obfuscated identities and spectator-like payloads
 * fail closed. PUUIDs stay inside Main and are never part of RuntimeState.
 */
export function extractVisibleOpponentIdentities(input: {
  currentSummoner: unknown
  gameflowSession: unknown
  champSelectSession: unknown
  matchStage: MatchContextStage
}): OpponentIdentity[] {
  const currentPuuid = (input.currentSummoner as any)?.puuid
  if (!isPuuid(currentPuuid)) return []

  const gameData = (input.gameflowSession as any)?.gameData
  const teamOne = Array.isArray(gameData?.teamOne) ? gameData.teamOne : []
  const teamTwo = Array.isArray(gameData?.teamTwo) ? gameData.teamTwo : []
  const inTeamOne = teamOne.some((player: any) => player?.puuid === currentPuuid)
  const inTeamTwo = teamTwo.some((player: any) => player?.puuid === currentPuuid)
  const gameflowOpponents = inTeamOne !== inTeamTwo
    ? completeVisibleTeam(inTeamOne ? teamTwo : teamOne)
    : []
  if (input.matchStage === 'active') return gameflowOpponents

  const session = input.champSelectSession as any
  const myTeam = Array.isArray(session?.myTeam) ? session.myTeam : []
  const theirTeam = Array.isArray(session?.theirTeam) ? session.theirTeam : []
  if (myTeam.some((player: any) => player?.puuid === currentPuuid)) {
    const champSelectOpponents = completeVisibleTeam(theirTeam)
    if (champSelectOpponents.length) return champSelectOpponents
  }
  return []
}

type MatchSample = {
  win: boolean
  kills: number
  deaths: number
  assists: number
}

const finiteNonNegative = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

const participantForPlayer = (game: any, targetPuuid?: string): any | null => {
  const participants = Array.isArray(game?.participants) ? game.participants : []
  if (!targetPuuid) return null
  const identities = Array.isArray(game?.participantIdentities)
    ? game.participantIdentities
    : []
  if (!identities.length) return participants.length === 1 ? participants[0] : null
  if (!targetPuuid || !participants.length) return null
  const identity = identities.find((entry: any) => {
    const puuid = entry?.player?.puuid ?? entry?.puuid
    return puuid === targetPuuid
  })
  const participantId = positiveInteger(identity?.participantId)
  if (!participantId) return null
  return participants.find((participant: any) =>
    positiveInteger(participant?.participantId) === participantId) ?? null
}

export function extractRecentMatchSamples(payload: unknown, targetPuuid?: string): MatchSample[] {
  const root = payload as any
  const games = Array.isArray(root?.games?.games)
    ? root.games.games
    : Array.isArray(root?.games)
      ? root.games
      : []
  const orderedGames: Array<{ game: any; index: number }> = games.map(
    (game: any, index: number) => ({ game, index }),
  )
  orderedGames.sort((left, right) => {
    const leftCreated = finiteNonNegative(left.game?.gameCreation)
    const rightCreated = finiteNonNegative(right.game?.gameCreation)
    if (leftCreated != null && rightCreated != null) return rightCreated - leftCreated
    if (leftCreated != null) return -1
    if (rightCreated != null) return 1
    return left.index - right.index
  })
  const samples: MatchSample[] = []
  for (const { game } of orderedGames) {
    if (samples.length >= 10) break
    const duration = finiteNonNegative(game?.gameDuration)
    if (duration == null || duration < 360) continue
    const participant = participantForPlayer(game, targetPuuid)
    const stats = participant?.stats
    const kills = finiteNonNegative(stats?.kills)
    const deaths = finiteNonNegative(stats?.deaths)
    const assists = finiteNonNegative(stats?.assists)
    if (kills == null || deaths == null || assists == null || typeof stats?.win !== 'boolean') continue
    samples.push({ win: stats.win, kills, deaths, assists })
  }
  return samples
}

export function classifyOpponentForm(rating: number): OpponentFormTier {
  if (rating >= 65) return '上等马'
  if (rating < 40) return '下等马'
  return '中等马'
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value))

export function summarizeOpponentHistory(
  payload: unknown,
  slot: number,
  championId: number | null,
  targetPuuid?: string,
): OpponentFormSummary {
  const samples = extractRecentMatchSamples(payload, targetPuuid)
  if (!samples.length) {
    return {
      slot,
      championId,
      status: 'unavailable',
      rating: null,
      tier: null,
      sampleSize: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      kda: null,
      streak: 0,
    }
  }

  const wins = samples.filter((sample) => sample.win).length
  const losses = samples.length - wins
  const winRate = wins / samples.length
  const kills = samples.reduce((sum, sample) => sum + sample.kills, 0)
  const deaths = samples.reduce((sum, sample) => sum + sample.deaths, 0)
  const assists = samples.reduce((sum, sample) => sum + sample.assists, 0)
  const kda = (kills + assists) / Math.max(1, deaths)
  const firstResult = samples[0]?.win
  let streakLength = 0
  for (const sample of samples) {
    if (sample.win !== firstResult) break
    streakLength += 1
  }
  const streak = firstResult ? streakLength : -streakLength
  const computedRating = Math.round(clamp(
    50 +
      (winRate - 0.5) * 70 +
      clamp(kda - 2.5, -2.5, 4) * 6 +
      clamp(streak, -5, 5) * 2,
    0,
    100,
  ))

  return {
    slot,
    championId,
    status: 'ready',
    rating: samples.length >= 8 ? computedRating : null,
    // Eight matches is still only a rough recent-form sample. Smaller samples are
    // still displayed as raw recent form without inventing a tier.
    tier: samples.length >= 8 ? classifyOpponentForm(computedRating) : null,
    sampleSize: samples.length,
    wins,
    losses,
    winRate,
    kda,
    streak,
  }
}
