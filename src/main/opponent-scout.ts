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

type IdentityVisibilityPolicy = 'champ-select' | 'active-game'

export type OpponentIdentityDecisionReason =
  | 'ready'
  | 'current-summoner-unavailable'
  | 'self-team-ambiguous'
  | 'opponent-team-incomplete'
  | 'opponent-identity-invalid'
  | 'opponent-visibility-rejected'

export interface OpponentIdentityDecision {
  identities: OpponentIdentity[]
  reason: OpponentIdentityDecisionReason
  source: IdentityVisibilityPolicy
  selfMatches: number
  opponentCount: number
  validIdentityCount: number
  visibilityCounts: Record<'visible' | 'empty' | 'missing' | 'hidden' | 'other', number>
}

const visibilityBucket = (
  value: unknown,
): keyof OpponentIdentityDecision['visibilityCounts'] => {
  if (value === undefined || value === null) return 'missing'
  if (typeof value !== 'string') return 'other'
  const normalized = value.trim().toUpperCase()
  if (normalized === 'VISIBLE') return 'visible'
  if (normalized === 'HIDDEN') return 'hidden'
  if (!normalized) return 'empty'
  return 'other'
}

const visibleIdentity = (
  player: any,
  policy: IdentityVisibilityPolicy,
): OpponentIdentity | null => {
  if (!isPuuid(player?.puuid)) return null
  const rawVisibility = player?.nameVisibilityType
  const markerAbsent = rawVisibility === undefined || rawVisibility === null
  const visibility = typeof rawVisibility === 'string'
    ? rawVisibility.trim().toUpperCase()
    : markerAbsent
      ? null
      : 'INVALID'
  if (policy === 'champ-select') {
    // Tencent/Riot champ-select payloads use both VISIBLE and an explicit
    // empty string for identities the client is allowed to show. A missing
    // marker is still rejected before the game starts.
    if (visibility !== 'VISIBLE' && visibility !== '') return null
  } else if (visibility !== null && visibility !== 'VISIBLE') {
    // Active gameflow commonly omits the field. If it is present, however,
    // only explicit VISIBLE is accepted; blank/unknown/hidden markers fail
    // closed instead of being silently treated as public.
    return null
  }
  // Once the match is active, gameflow often omits nameVisibilityType
  // entirely. At that point the scoreboard already exposes participants, so
  // accept a complete team only when the marker is absent or explicitly
  // VISIBLE.
  return {
    puuid: player.puuid,
    championId: positiveInteger(
      player?.championId ?? player?.championPickIntent ?? player?.champion?.id,
    ),
  }
}

const inspectTeam = (
  players: any[],
  policy: IdentityVisibilityPolicy,
): Pick<OpponentIdentityDecision, 'identities' | 'reason' | 'opponentCount' | 'validIdentityCount' | 'visibilityCounts'> => {
  const visibilityCounts = { visible: 0, empty: 0, missing: 0, hidden: 0, other: 0 }
  for (const player of players) visibilityCounts[visibilityBucket(player?.nameVisibilityType)] += 1
  const visibilityRejected = players.some((player) => {
    const visibility = visibilityBucket(player?.nameVisibilityType)
    return policy === 'champ-select'
      ? visibility === 'missing' || visibility === 'hidden' || visibility === 'other'
      : visibility === 'empty' || visibility === 'hidden' || visibility === 'other'
  })
  if (visibilityRejected) {
    return {
      identities: [], reason: 'opponent-visibility-rejected', opponentCount: players.length,
      validIdentityCount: 0, visibilityCounts,
    }
  }
  if (players.length !== 5) {
    return {
      identities: [], reason: 'opponent-team-incomplete', opponentCount: players.length,
      validIdentityCount: 0, visibilityCounts,
    }
  }
  const seen = new Set<string>()
  const result: OpponentIdentity[] = []
  for (const player of players) {
    if (!isPuuid(player?.puuid)) {
      const rawPuuid = player?.puuid
      const identityStillLoading = rawPuuid === undefined || rawPuuid === null || rawPuuid === ''
      return {
        identities: [],
        reason: identityStillLoading ? 'opponent-team-incomplete' : 'opponent-identity-invalid',
        opponentCount: players.length,
        validIdentityCount: result.length,
        visibilityCounts,
      }
    }
    const identity = visibleIdentity(player, policy)
    if (!identity) {
      const visibility = visibilityBucket(player?.nameVisibilityType)
      return {
        identities: [],
        reason: visibility === 'hidden' || visibility === 'empty' || visibility === 'other' || (
          policy === 'champ-select' && visibility === 'missing'
        )
          ? 'opponent-visibility-rejected'
          : 'opponent-identity-invalid',
        opponentCount: players.length,
        validIdentityCount: result.length,
        visibilityCounts,
      }
    }
    if (seen.has(identity.puuid)) {
      return {
        identities: [], reason: 'opponent-identity-invalid', opponentCount: players.length,
        validIdentityCount: result.length, visibilityCounts,
      }
    }
    seen.add(identity.puuid)
    result.push(identity)
  }
  return {
    identities: result, reason: 'ready', opponentCount: players.length,
    validIdentityCount: result.length, visibilityCounts,
  }
}

/**
 * Extracts opponents only when the local player can be placed on one of two
 * explicit teams. Hidden/obfuscated identities and spectator-like payloads
 * fail closed. PUUIDs stay inside Main and are never part of RuntimeState.
 */
export function inspectVisibleOpponentIdentities(input: {
  currentSummoner: unknown
  gameflowSession: unknown
  champSelectSession: unknown
  matchStage: MatchContextStage
}): OpponentIdentityDecision {
  const currentPuuid = (input.currentSummoner as any)?.puuid
  const source: IdentityVisibilityPolicy = input.matchStage === 'active' ? 'active-game' : 'champ-select'
  const emptyDecision = (
    reason: OpponentIdentityDecisionReason,
    selfMatches = 0,
  ): OpponentIdentityDecision => ({
    identities: [], reason, source, selfMatches, opponentCount: 0, validIdentityCount: 0,
    visibilityCounts: { visible: 0, empty: 0, missing: 0, hidden: 0, other: 0 },
  })
  if (!isPuuid(currentPuuid)) return emptyDecision('current-summoner-unavailable')

  if (input.matchStage === 'active') {
    const gameData = (input.gameflowSession as any)?.gameData
    const teamOne = Array.isArray(gameData?.teamOne) ? gameData.teamOne : []
    const teamTwo = Array.isArray(gameData?.teamTwo) ? gameData.teamTwo : []
    const teamOneSelfCount = teamOne.filter((player: any) => player?.puuid === currentPuuid).length
    const teamTwoSelfCount = teamTwo.filter((player: any) => player?.puuid === currentPuuid).length
    const selfMatches = teamOneSelfCount + teamTwoSelfCount
    if (selfMatches === 0 && (teamOne.length < 5 || teamTwo.length < 5)) {
      return emptyDecision('opponent-team-incomplete')
    }
    if (selfMatches !== 1) return emptyDecision('self-team-ambiguous', selfMatches)
    const team = inspectTeam(teamOneSelfCount === 1 ? teamTwo : teamOne, 'active-game')
    return { ...team, source, selfMatches }
  }

  const session = input.champSelectSession as any
  const myTeam = Array.isArray(session?.myTeam) ? session.myTeam : []
  const theirTeam = Array.isArray(session?.theirTeam) ? session.theirTeam : []
  const myTeamSelfCount = myTeam.filter((player: any) => player?.puuid === currentPuuid).length
  const theirTeamSelfCount = theirTeam.filter((player: any) => player?.puuid === currentPuuid).length
  const selfMatches = myTeamSelfCount + theirTeamSelfCount
  if (myTeam.length === 0 || theirTeam.length < 5) {
    return emptyDecision('opponent-team-incomplete', selfMatches)
  }
  if (myTeamSelfCount !== 1 || theirTeamSelfCount !== 0) {
    return emptyDecision('self-team-ambiguous', selfMatches)
  }
  const team = inspectTeam(theirTeam, 'champ-select')
  return { ...team, source, selfMatches }
}

export function extractVisibleOpponentIdentities(input: {
  currentSummoner: unknown
  gameflowSession: unknown
  champSelectSession: unknown
  matchStage: MatchContextStage
}): OpponentIdentity[] {
  return inspectVisibleOpponentIdentities(input).identities
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
  if (!participants.length) return null
  const explicitPuuidValues = identities.flatMap((entry: any) => {
    const value = entry?.player?.puuid ?? entry?.puuid
    return value === undefined || value === null ? [] : [value]
  })
  if (explicitPuuidValues.some((value: unknown) => !isPuuid(value))) return null
  const identitiesWithPuuid = identities.filter((entry: any) =>
    isPuuid(entry?.player?.puuid ?? entry?.puuid),
  )
  if (!identitiesWithPuuid.length) return participants.length === 1 ? participants[0] : null
  const targetIdentities = identitiesWithPuuid.filter((entry: any) => {
    const puuid = entry?.player?.puuid ?? entry?.puuid
    return puuid === targetPuuid
  })
  if (targetIdentities.length !== 1) return null
  const identity = targetIdentities[0]
  const participantId = positiveInteger(identity?.participantId)
  if (!participantId) return null
  const identityMappings = identitiesWithPuuid.filter((entry: any) =>
    positiveInteger(entry?.participantId) === participantId)
  if (identityMappings.length !== 1) return null
  const matchingParticipants = participants.filter((participant: any) =>
    positiveInteger(participant?.participantId) === participantId)
  return matchingParticipants.length === 1 ? matchingParticipants[0] : null
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
