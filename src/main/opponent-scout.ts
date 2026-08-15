import type {
  MatchContextStage,
  OpponentFormSummary,
  OpponentFormTier,
  OpponentTeamSummary,
  ScoutMatchDetail,
  ScoutRelation,
} from '../shared/contracts.js'

export interface OpponentIdentity {
  puuid: string
  championId: number | null
}

export interface ScoutIdentity extends OpponentIdentity {
  relation: ScoutRelation
  slot: number
}

export interface ScoutRosterGroupObservation {
  status: 'ready' | 'rejected'
  identities: ScoutIdentity[]
}

export interface ScoutRosterObservation {
  allies: ScoutRosterGroupObservation
  opponents: ScoutRosterGroupObservation
  globalAmbiguous: boolean
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

export interface TeamIdentityDecision {
  allies: ScoutIdentity[]
  opponents: ScoutIdentity[]
  allyReason: OpponentIdentityDecisionReason
  opponentReason: OpponentIdentityDecisionReason
  source: IdentityVisibilityPolicy
  selfMatches: number
  allyCount: number
  opponentCount: number
  globalAmbiguous: boolean
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
    championId: [player?.championId, player?.championPickIntent, player?.champion?.id]
      .map(positiveInteger)
      .find((value): value is number => value !== null) ?? null,
  }
}

/**
 * Reconciles a current roster with an already-vetted, generation-local set of
 * private identities. Each team is all-or-nothing and must contain the same
 * identities as the initial scan. The returned PUUID-bearing observation is
 * Main-only; callers must translate it to an explicitly sanitized public DTO.
 */
export function inspectScoutRosterObservation(input: {
  selfPuuid: string
  bindings: ScoutIdentity[]
  gameflowSession: unknown
  champSelectSession: unknown
  matchStage: MatchContextStage
}): ScoutRosterObservation {
  const rejected = (): ScoutRosterGroupObservation => ({ status: 'rejected', identities: [] })
  const rejectAll = (): ScoutRosterObservation => ({
    allies: rejected(), opponents: rejected(), globalAmbiguous: true,
  })
  if (!isPuuid(input.selfPuuid)) return rejectAll()
  const bindingPuuids = input.bindings.map((binding) => binding.puuid)
  const allyBindingCount = input.bindings.filter((binding) => binding.relation === 'ally').length
  const opponentBindingCount = input.bindings.filter((binding) => binding.relation === 'opponent').length
  if (
    !input.bindings.length ||
    bindingPuuids.some((puuid) => !isPuuid(puuid) || puuid === input.selfPuuid) ||
    new Set(bindingPuuids).size !== bindingPuuids.length ||
    (allyBindingCount !== 0 && allyBindingCount !== 4) ||
    (opponentBindingCount !== 0 && opponentBindingCount !== 5)
  ) return rejectAll()

  const active = input.matchStage === 'active'
  const root = active
    ? (input.gameflowSession as any)?.gameData
    : input.champSelectSession as any
  const firstTeam = active
    ? (Array.isArray(root?.teamOne) ? root.teamOne : [])
    : (Array.isArray(root?.myTeam) ? root.myTeam : [])
  const secondTeam = active
    ? (Array.isArray(root?.teamTwo) ? root.teamTwo : [])
    : (Array.isArray(root?.theirTeam) ? root.theirTeam : [])
  if (firstTeam.length > 5 || secondTeam.length > 5) return rejectAll()
  const rawPuuids = [...firstTeam, ...secondTeam]
    .map((player: any) => player?.puuid)
    .filter(isPuuid)
  if (new Set(rawPuuids).size !== rawPuuids.length) return rejectAll()
  const firstSelfCount = firstTeam.filter((player: any) => player?.puuid === input.selfPuuid).length
  const secondSelfCount = secondTeam.filter((player: any) => player?.puuid === input.selfPuuid).length
  if (firstSelfCount + secondSelfCount !== 1) return rejectAll()
  if (!active && (firstSelfCount !== 1 || secondSelfCount !== 0)) return rejectAll()

  const ownTeam = firstSelfCount === 1 ? firstTeam : secondTeam
  const opponentTeam = firstSelfCount === 1 ? secondTeam : firstTeam
  const expectedPuuids = (relation: ScoutRelation): Set<string> => new Set(
    input.bindings
      .filter((binding) => binding.relation === relation)
      .map((binding) => binding.puuid),
  )
  const observe = (
    relation: ScoutRelation,
    players: any[],
    expectedCount: number,
  ): ScoutRosterGroupObservation => {
    const withoutSelf = relation === 'ally'
      ? players.filter((player: any) => player?.puuid !== input.selfPuuid)
      : players
    const expected = expectedPuuids(relation)
    if (expected.size !== expectedCount) return rejected()
    if (players.length !== 5 || withoutSelf.length !== expectedCount) {
      return rejected()
    }
    const visible = withoutSelf.map((player: any) => visibleIdentity(
      player,
      active ? 'active-game' : 'champ-select',
    ))
    if (
      visible.some((identity) => !identity) ||
      visible.some((identity) => !expected.has(identity!.puuid)) ||
      new Set(visible.map((identity) => identity!.puuid)).size !== expected.size
    ) return rejected()
    return {
      status: 'ready',
      identities: visible.map((identity, index) => ({
        ...identity!,
        relation,
        slot: index + 1,
      })),
    }
  }
  return {
    allies: observe('ally', ownTeam, 4),
    opponents: observe('opponent', opponentTeam, 5),
    globalAmbiguous: false,
  }
}

const inspectGroup = (
  players: any[],
  policy: IdentityVisibilityPolicy,
  expectedCount: number,
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
  if (players.length !== expectedCount) {
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

const asScoutIdentities = (
  identities: OpponentIdentity[],
  relation: ScoutRelation,
): ScoutIdentity[] => identities.map((identity, index) => ({
  ...identity,
  relation,
  slot: index + 1,
}))

const groupDecision = (
  players: any[],
  policy: IdentityVisibilityPolicy,
  relation: ScoutRelation,
  expectedCount: number,
): { identities: ScoutIdentity[]; reason: OpponentIdentityDecisionReason } => {
  const inspected = inspectGroup(players, policy, expectedCount)
  return {
    identities: inspected.reason === 'ready'
      ? asScoutIdentities(inspected.identities, relation)
      : [],
    reason: inspected.reason,
  }
}

/**
 * Resolves the local player's four allies and five opponents as two separate
 * privacy groups. Self placement and cross-team duplicate identities are
 * global fail-closed conditions; a visibility failure in one group does not
 * discard the other group when that other group is independently complete.
 */
export function inspectVisibleTeamIdentities(input: {
  currentSummoner: unknown
  gameflowSession: unknown
  champSelectSession: unknown
  matchStage: MatchContextStage
}): TeamIdentityDecision {
  const currentPuuid = (input.currentSummoner as any)?.puuid
  const source: IdentityVisibilityPolicy = input.matchStage === 'active' ? 'active-game' : 'champ-select'
  const empty = (
    reason: OpponentIdentityDecisionReason,
    selfMatches = 0,
    allyCount = 0,
    opponentCount = 0,
    globalAmbiguous = false,
  ): TeamIdentityDecision => ({
    allies: [], opponents: [], allyReason: reason, opponentReason: reason,
    source, selfMatches, allyCount, opponentCount, globalAmbiguous,
  })
  if (!isPuuid(currentPuuid)) return empty('current-summoner-unavailable')

  const session = input.matchStage === 'active'
    ? (input.gameflowSession as any)?.gameData
    : input.champSelectSession as any
  const firstTeam = input.matchStage === 'active'
    ? (Array.isArray(session?.teamOne) ? session.teamOne : [])
    : (Array.isArray(session?.myTeam) ? session.myTeam : [])
  const secondTeam = input.matchStage === 'active'
    ? (Array.isArray(session?.teamTwo) ? session.teamTwo : [])
    : (Array.isArray(session?.theirTeam) ? session.theirTeam : [])
  const firstSelfCount = firstTeam.filter((player: any) => player?.puuid === currentPuuid).length
  const secondSelfCount = secondTeam.filter((player: any) => player?.puuid === currentPuuid).length
  const selfMatches = firstSelfCount + secondSelfCount
  if (firstTeam.length > 5 || secondTeam.length > 5) {
    return empty(
      'opponent-identity-invalid', selfMatches, firstTeam.length, secondTeam.length, true,
    )
  }
  if (selfMatches > 1) {
    return empty('self-team-ambiguous', selfMatches, firstTeam.length, secondTeam.length, true)
  }
  if (selfMatches === 0 && (firstTeam.length !== 5 || secondTeam.length !== 5)) {
    return empty('opponent-team-incomplete', selfMatches, firstTeam.length, secondTeam.length)
  }
  if (
    selfMatches !== 1 ||
    (input.matchStage !== 'active' && (firstSelfCount !== 1 || secondSelfCount !== 0))
  ) {
    return empty('self-team-ambiguous', selfMatches, firstTeam.length, secondTeam.length, true)
  }

  const allValidPuuids = [...firstTeam, ...secondTeam]
    .map((player: any) => player?.puuid)
    .filter(isPuuid)
  if (new Set(allValidPuuids).size !== allValidPuuids.length) {
    return empty('opponent-identity-invalid', selfMatches, firstTeam.length, secondTeam.length, true)
  }

  const ownTeam = firstSelfCount === 1 ? firstTeam : secondTeam
  const opponentTeam = firstSelfCount === 1 ? secondTeam : firstTeam
  const allies = ownTeam.filter((player: any) => player?.puuid !== currentPuuid)
  const allyDecision = groupDecision(allies, source, 'ally', 4)
  const opponentDecision = groupDecision(opponentTeam, source, 'opponent', 5)
  return {
    allies: allyDecision.identities,
    opponents: opponentDecision.identities,
    allyReason: allyDecision.reason,
    opponentReason: opponentDecision.reason,
    source,
    selfMatches,
    allyCount: allies.length,
    opponentCount: opponentTeam.length,
    globalAmbiguous: false,
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
  const decision = inspectVisibleTeamIdentities(input)
  const visibilityCounts = { visible: 0, empty: 0, missing: 0, hidden: 0, other: 0 }
  const sourcePlayers = decision.source === 'active-game'
    ? (() => {
        const gameData = (input.gameflowSession as any)?.gameData
        const teamOne = Array.isArray(gameData?.teamOne) ? gameData.teamOne : []
        const teamTwo = Array.isArray(gameData?.teamTwo) ? gameData.teamTwo : []
        const currentPuuid = (input.currentSummoner as any)?.puuid
        return teamOne.some((player: any) => player?.puuid === currentPuuid) ? teamTwo : teamOne
      })()
    : (Array.isArray((input.champSelectSession as any)?.theirTeam)
        ? (input.champSelectSession as any).theirTeam
        : [])
  for (const player of sourcePlayers) visibilityCounts[visibilityBucket(player?.nameVisibilityType)] += 1
  return {
    identities: decision.opponents.map(({ puuid, championId }) => ({ puuid, championId })),
    reason: decision.opponentReason,
    source: decision.source,
    selfMatches: decision.selfMatches,
    opponentCount: decision.opponentCount,
    validIdentityCount: decision.opponents.length,
    visibilityCounts,
  }
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

type RecentMatchRecord = MatchSample & {
  championId: number | null
  durationMinutes: number
}

export const MAX_SCOUT_MATCHES = 20
export const MIN_SCOUT_RATING_SAMPLES = 12

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
  const identityMappings = identities.filter((entry: any) =>
    positiveInteger(entry?.participantId) === participantId)
  if (identityMappings.length !== 1) return null
  const matchingParticipants = participants.filter((participant: any) =>
    positiveInteger(participant?.participantId) === participantId)
  return matchingParticipants.length === 1 ? matchingParticipants[0] : null
}

const extractRecentMatchRecords = (payload: unknown, targetPuuid?: string): RecentMatchRecord[] => {
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
  const samples: RecentMatchRecord[] = []
  for (const { game } of orderedGames) {
    if (samples.length >= MAX_SCOUT_MATCHES) break
    const duration = finiteNonNegative(game?.gameDuration)
    if (duration == null || duration < 360) continue
    const participant = participantForPlayer(game, targetPuuid)
    const stats = participant?.stats
    const kills = finiteNonNegative(stats?.kills)
    const deaths = finiteNonNegative(stats?.deaths)
    const assists = finiteNonNegative(stats?.assists)
    if (kills == null || deaths == null || assists == null || typeof stats?.win !== 'boolean') continue
    samples.push({
      win: stats.win,
      kills,
      deaths,
      assists,
      championId: positiveInteger(participant?.championId),
      durationMinutes: Math.max(1, Math.round(duration / 60)),
    })
  }
  return samples
}

export function extractRecentMatchSamples(payload: unknown, targetPuuid?: string): MatchSample[] {
  return extractRecentMatchRecords(payload, targetPuuid).map(({ win, kills, deaths, assists }) => ({
    win, kills, deaths, assists,
  }))
}

export function extractRecentMatchDetails(payload: unknown, targetPuuid?: string): ScoutMatchDetail[] {
  return extractRecentMatchRecords(payload, targetPuuid).map((sample) => ({ ...sample }))
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
  relation: ScoutRelation = 'opponent',
  opaqueKey: string | null = null,
): OpponentFormSummary {
  const samples = extractRecentMatchSamples(payload, targetPuuid)
  if (!samples.length) {
    return {
      opaqueKey: null,
      relation,
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
    opaqueKey,
    relation,
    slot,
    championId,
    status: 'ready',
    rating: samples.length >= MIN_SCOUT_RATING_SAMPLES ? computedRating : null,
    // Twelve matches is still only a rough recent-form sample. Smaller samples are
    // still displayed as raw recent form without inventing a tier.
    tier: samples.length >= MIN_SCOUT_RATING_SAMPLES ? classifyOpponentForm(computedRating) : null,
    sampleSize: samples.length,
    wins,
    losses,
    winRate,
    kda,
    streak,
  }
}

/**
 * Combine only the public, already-sanitized player summaries.  The aggregate
 * is deliberately weighted by the number of usable matches rather than by
 * the number of cards, so a player with 12 samples cannot outweigh one with
 * 20 samples simply because both occupy one slot.  A team score is shown only
 * when every visible player has a supported individual rating; otherwise it
 * is explicitly marked partial instead of pretending the missing players are
 * average.
 */
export function summarizeOpponentTeam(
  summaries: readonly OpponentFormSummary[],
): OpponentTeamSummary {
  const usable = summaries.filter((summary) =>
    summary.sampleSize > 0 &&
    summary.winRate != null &&
    summary.kda != null,
  )
  const rated = summaries.filter((summary) => summary.rating != null)
  const sampleSize = usable.reduce((total, summary) => total + summary.sampleSize, 0)
  const wins = usable.reduce((total, summary) =>
    total + summary.wins, 0)
  const winRate = sampleSize > 0 ? wins / sampleSize : null
  const kda = sampleSize > 0
    ? usable.reduce((total, summary) => total + summary.kda! * summary.sampleSize, 0) / sampleSize
    : null
  const ratedWeight = rated.reduce((total, summary) => total + summary.sampleSize, 0)
  const rating = ratedWeight > 0
    ? Math.round(rated.reduce((total, summary) =>
      total + summary.rating! * summary.sampleSize, 0) / ratedWeight)
    : null
  const confidence: OpponentTeamSummary['confidence'] = !summaries.length || !usable.length
    ? 'none'
    : rated.length === summaries.length
      ? 'supported'
      : 'partial'

  return {
    playerCount: summaries.length,
    ratedCount: rated.length,
    sampleSize,
    rating,
    tier: rating == null ? null : classifyOpponentForm(rating),
    winRate,
    kda,
    confidence,
  }
}
