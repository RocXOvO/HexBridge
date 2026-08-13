import type {
  ChampSelectSnapshot,
  GameflowPhase,
  MatchContextStage,
} from '../../shared/contracts.js'
import { isAramMayhemQueueId } from '../../shared/mayhem-queues.js'

const positiveInteger = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

export const queueIdFromSession = (session: any): number | null =>
  positiveInteger(
    session?.gameData?.queue?.id ??
      session?.gameData?.queueId ??
      session?.queue?.id ??
      session?.queueId ??
      session?.gameClient?.queueId,
  )

export const queueIdFromLobby = (lobby: any): number | null =>
  positiveInteger(lobby?.gameConfig?.queueId ?? lobby?.queueId)

const championIdFromActions = (
  session: any,
  localCellId: number,
): { observed: boolean; championId: number | null } => {
  if (!Number.isInteger(localCellId) || !Array.isArray(session?.actions)) {
    return { observed: false, championId: null }
  }
  // Newer action groups supersede older pick/reroll observations. This is a
  // read-only fallback for regional clients that update `actions` before the
  // current-champion endpoint or myTeam member.
  for (let groupIndex = session.actions.length - 1; groupIndex >= 0; groupIndex -= 1) {
    const group = session.actions[groupIndex]
    if (!Array.isArray(group)) continue
    for (let actionIndex = group.length - 1; actionIndex >= 0; actionIndex -= 1) {
      const action = group[actionIndex]
      if (Number(action?.actorCellId) !== localCellId) continue
      if (String(action?.type ?? '').toLowerCase() !== 'pick') continue
      // A zero on the newest local pick explicitly clears an older action; do
      // not scan backwards and resurrect the previous champion.
      return { observed: true, championId: positiveInteger(action?.championId) }
    }
  }
  return { observed: false, championId: null }
}

export function normalizeChampSelectSnapshot(input: {
  phase: GameflowPhase
  locale?: string
  gameflowSession: unknown
  lobbySession?: unknown
  champSelectSession: any
  currentChampionId: unknown
}): ChampSelectSnapshot {
  const session = input.champSelectSession ?? {}
  const localCellId = Number(session.localPlayerCellId)
  const localMember = Array.isArray(session.myTeam)
    ? session.myTeam.find((member: any) => Number(member?.cellId) === localCellId)
    : null
  const actionChampion = championIdFromActions(session, localCellId)
  const currentChampionId =
    positiveInteger(input.currentChampionId) ??
    positiveInteger(localMember?.championId) ??
    (actionChampion.observed
      ? actionChampion.championId
      : positiveInteger(localMember?.championPickIntent))

  const benchValues = Array.isArray(session.benchChampionIds)
    ? session.benchChampionIds
    : Array.isArray(session.benchChampions)
      ? session.benchChampions.map((entry: any) => entry?.championId)
      : []
  const benchChampionIds = benchValues
    .map(positiveInteger)
    .filter((value: number | null): value is number => value != null)
    .filter((value: number, index: number, values: number[]) => values.indexOf(value) === index)

  const queueId = queueIdFromSession(input.gameflowSession) ?? queueIdFromLobby(input.lobbySession)
  return {
    phase: input.phase,
    locale: input.locale ?? 'zh_CN',
    queueId,
    modeActive: isAramMayhemQueueId(queueId),
    matchStage: 'none',
    matchGeneration: 0,
    currentChampionId,
    benchChampionIds,
    benchEnabled: session.benchEnabled === true || benchChampionIds.length > 0,
    updatedAt: Date.now(),
  }
}

const MATCH_CONTEXT_PHASES = new Set<GameflowPhase>([
  'ChampSelect',
  'GameStart',
  'InProgress',
  'Reconnect',
])
const CLEAR_CONTEXT_PHASES = new Set<GameflowPhase>([
  'Lobby',
  'Matchmaking',
  'ReadyCheck',
  'WaitingForStats',
  'PreEndOfGame',
  'EndOfGame',
  'FailedToLaunch',
  'TerminatedInError',
])
export const MATCH_CONTEXT_NONE_GRACE_MS = 10 * 60 * 1_000
export const MATCH_CONTEXT_MAX_STALE_MS = 12 * 60 * 60 * 1_000
export const MATCH_CONTEXT_TERMINAL_CONFIRM_MS = 15_000
export const INDEPENDENT_GAME_HEARTBEAT_MS = 5_000

interface ConfirmedMatchContext {
  queueId: number
  currentChampionId: number
  lastMatchPhaseAt: number
  enteredGame: boolean
  stage: Exclude<MatchContextStage, 'none'>
  generation: number
  matchIdentity: string | null
  authorityEpoch: number | null
  handoffCommitted: boolean
  independentGameHeartbeatAt: number | null
}

export type LcuEndpointObservationStatus = 'ok' | 'empty' | 'error' | 'skipped'

export interface MatchContextEvidence {
  destructive: boolean
  champSelectSession: LcuEndpointObservationStatus
  currentChampion?: LcuEndpointObservationStatus
  queueSource?: 'gameflow' | 'lobby' | 'none'
  matchIdentity: string | null
  authorityEpoch?: number | null
  champSelectTimerPhase?: string | null
  gameClientRunning?: boolean
}

const DEFAULT_EVIDENCE: MatchContextEvidence = {
  destructive: true,
  champSelectSession: 'ok',
  currentChampion: 'ok',
  queueSource: 'gameflow',
  matchIdentity: null,
  authorityEpoch: 0,
  champSelectTimerPhase: null,
  gameClientRunning: false,
}

export type MatchContextDecision =
  | 'none'
  | 'confirmed'
  | 'retained-match-phase'
  | 'retained-outgoing-champ-select'
  | 'retained-partial-observation'
  | 'retained-unknown-phase'
  | 'retained-transport-handoff'
  | 'retained-untrusted-observation'
  | 'retained-terminal-confirmation'
  | 'confirmed-game-active'
  | 'cleared-terminal-phase'
  | 'cleared-queue-change'
  | 'cleared-new-champ-select'
  | 'cleared-game-process-exit'
  | 'expired'

/**
 * LCU gameflow and champ-select endpoints do not transition atomically. Keep
 * the last confirmed queue/champion independently from the emitted snapshot so
 * an outgoing 404 or a brief `None` cannot erase the active match.
 */
export class MatchContextTracker {
  private confirmed: ConfirmedMatchContext | null = null
  private generation = 0
  private lastDecision: MatchContextDecision = 'none'
  private pendingTerminal: {
    phase: GameflowPhase
    authorityEpoch: number | null
    since: number
  } | null = null

  apply(
    next: ChampSelectSnapshot,
    now = next.updatedAt,
    evidence: MatchContextEvidence = DEFAULT_EVIDENCE,
  ): ChampSelectSnapshot {
    evidence = {
      ...evidence,
      authorityEpoch: evidence.authorityEpoch === undefined
        ? (this.confirmed?.authorityEpoch ?? 0)
        : evidence.authorityEpoch,
    }
    const authorityTrusted = this.isEvidenceAuthorityTrusted(evidence)
    const identityTrusted = this.isEvidenceIdentityTrusted(evidence)
    const observationTrusted = !this.confirmed || authorityTrusted || identityTrusted
    const hasPositiveChampSelectEvidence =
      next.phase === 'ChampSelect' &&
      isAramMayhemQueueId(next.queueId) &&
      next.currentChampionId != null &&
      (evidence.champSelectSession === 'ok' || evidence.currentChampion === 'ok')
    const provesNewChampSelectAfterHandoff = Boolean(
      this.confirmed &&
      hasPositiveChampSelectEvidence &&
      observationTrusted &&
      (this.confirmed.enteredGame || this.confirmed.stage !== 'selecting') &&
      (
        next.currentChampionId !== this.confirmed.currentChampionId ||
        (
          evidence.matchIdentity &&
          this.confirmed.matchIdentity &&
          evidence.matchIdentity !== this.confirmed.matchIdentity
        ) ||
        (this.confirmed.enteredGame && !evidence.matchIdentity)
      ),
    )

    if (this.confirmed && identityTrusted && evidence.authorityEpoch != null) {
      // A rotated transport that proves the same game identity becomes the new
      // authority before any hand-off evidence is reduced.
      this.confirmed.authorityEpoch = evidence.authorityEpoch
    }

    if (
      this.confirmed &&
      observationTrusted &&
      !provesNewChampSelectAfterHandoff &&
      (!hasPositiveChampSelectEvidence || this.confirmed.stage !== 'selecting') &&
      evidence.gameClientRunning === true
    ) {
      return this.confirmTrustedGameClient(next, now)
    }

    if (
      this.confirmed &&
      observationTrusted &&
      !provesNewChampSelectAfterHandoff &&
      (!hasPositiveChampSelectEvidence || this.confirmed.stage !== 'selecting') &&
      isChampSelectHandoffPhase(evidence.champSelectTimerPhase)
    ) {
      return this.commitTrustedHandoff(next, now)
    }

    // A different reachable League client must not replace a retained match,
    // even when it exposes a complete Mayhem champ-select snapshot. It may only
    // take over after proving the same game identity or after the old lease
    // expires.
    if (this.confirmed && !observationTrusted && hasPositiveChampSelectEvidence) {
      return this.retainUntrustedObservation(next, now)
    }

    if (!evidence.destructive && !hasPositiveChampSelectEvidence) {
      if (this.confirmed && !observationTrusted) {
        return this.retainUntrustedObservation(next, now)
      }
      if (this.confirmed) return this.retainPartialObservation(next, now)
      this.lastDecision = 'retained-partial-observation'
      return this.withoutContext({
        ...next,
        queueId: null,
        modeActive: false,
        currentChampionId: null,
        benchChampionIds: [],
        benchEnabled: false,
      })
    }

    // A lobby queue observed while the raw phase is None is launcher UI state,
    // not proof that the already-selected game ended. Only gameflow-sourced
    // queue changes or a complete new ChampSelect can terminate atomically.
    if (
      evidence.destructive &&
      next.queueId != null &&
      this.confirmed &&
      next.queueId !== this.confirmed.queueId
    ) {
      if (!observationTrusted) return this.retainUntrustedObservation(next, now)
      if (!hasPositiveChampSelectEvidence && evidence.queueSource === 'lobby') {
        const samePending = this.pendingTerminal?.authorityEpoch ===
          (evidence.authorityEpoch ?? null)
        if (!samePending) {
          this.pendingTerminal = {
            phase: next.phase,
            authorityEpoch: evidence.authorityEpoch ?? null,
            since: now,
          }
        }
        if (now - (this.pendingTerminal?.since ?? now) <= MATCH_CONTEXT_NONE_GRACE_MS) {
          this.lastDecision = 'retained-terminal-confirmation'
          return this.withContext({
            ...next,
            queueId: null,
            currentChampionId: null,
            benchChampionIds: [],
            benchEnabled: false,
          })
        }
      }
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'cleared-queue-change'
      if (!hasPositiveChampSelectEvidence) return this.withoutContext(next)
      // Continue below: a complete supported ChampSelect establishes the next
      // generation in this same poll without a visible empty state.
    }

    if (evidence.destructive && CLEAR_CONTEXT_PHASES.has(next.phase)) {
      if (this.confirmed && !observationTrusted) {
        return this.retainUntrustedObservation(next, now)
      }
      if (this.confirmed && this.confirmed.stage !== 'active') {
        const leaseMs = this.confirmed.enteredGame
          ? MATCH_CONTEXT_MAX_STALE_MS
          : MATCH_CONTEXT_NONE_GRACE_MS
        if (now - this.confirmed.lastMatchPhaseAt > leaseMs) {
          this.confirmed = null
          this.pendingTerminal = null
          this.lastDecision = 'expired'
          return this.withoutContext({
            ...next,
            queueId: null,
            modeActive: false,
            currentChampionId: null,
            benchChampionIds: [],
            benchEnabled: false,
          })
        }
      }
      if (
        this.confirmed &&
        evidence.gameClientRunning === true &&
        observationTrusted
      ) {
        this.confirmed.enteredGame = true
        this.confirmed.stage = 'active'
        this.confirmed.lastMatchPhaseAt = now
        this.pendingTerminal = null
        this.lastDecision = 'confirmed-game-active'
        return this.withContext({
          ...next,
          queueId: null,
          currentChampionId: null,
          benchChampionIds: [],
          benchEnabled: false,
        })
      }
      const independentGameAlive = Boolean(
        this.confirmed?.independentGameHeartbeatAt != null &&
        now - this.confirmed.independentGameHeartbeatAt <= INDEPENDENT_GAME_HEARTBEAT_MS,
      )
      if (this.confirmed && independentGameAlive) {
        this.confirmed.enteredGame = true
        this.confirmed.stage = 'active'
        this.confirmed.lastMatchPhaseAt = now
        this.lastDecision = 'confirmed-game-active'
        return this.withContext({
          ...next,
          queueId: null,
          currentChampionId: null,
          benchChampionIds: [],
          benchEnabled: false,
        })
      }
      const immediateFailure = next.phase === 'FailedToLaunch' || next.phase === 'TerminatedInError'
      if (this.confirmed && immediateFailure) {
        this.confirmed = null
        this.pendingTerminal = null
        this.lastDecision = 'cleared-terminal-phase'
        return this.withoutContext(next)
      }
      if (this.confirmed && this.confirmed.stage !== 'active') {
        // CN/WeGame can briefly report launcher-side Lobby/WaitingForStats
        // while LeagueClientUx hands the match to the separate game process.
        // It may also do so for one or more polls immediately after the game
        // process appears. A single launcher-side terminal observation is not
        // reliable end-of-match evidence. Keep the selected champion until
        // the transition is stable, and let the game-process heartbeat cancel
        // this pending terminal state while the real game is still running.
        this.confirmed.stage = 'launching'
        this.confirmed.handoffCommitted = true
        const confirmationMs = MATCH_CONTEXT_NONE_GRACE_MS
        const samePending = this.pendingTerminal?.authorityEpoch ===
          (evidence.authorityEpoch ?? null)
        if (!samePending) {
          this.pendingTerminal = {
            phase: next.phase,
            authorityEpoch: evidence.authorityEpoch ?? null,
            since: now,
          }
        }
        if (now - (this.pendingTerminal?.since ?? now) <= confirmationMs) {
          this.lastDecision = 'retained-terminal-confirmation'
          return this.withContext({
            ...next,
            queueId: null,
            currentChampionId: null,
            benchChampionIds: [],
            benchEnabled: false,
          })
        }
      }
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'cleared-terminal-phase'
      return this.withoutContext(next)
    }

    this.pendingTerminal = null

    // LCU endpoints do not transition atomically during the game-client
    // hand-off. A late `ChampSelect` phase can arrive after transport detached
    // while both outgoing champ-select endpoints already return 404. Treat
    // that empty observation as part of the current hand-off. Only a complete
    // queue + champion observation can prove that a new champ select started.
    if (
      next.phase === 'ChampSelect' &&
      this.confirmed &&
      (this.confirmed.enteredGame || this.confirmed.stage !== 'selecting')
    ) {
      const sameIdentity = Boolean(
        evidence.matchIdentity &&
        this.confirmed.matchIdentity &&
        evidence.matchIdentity === this.confirmed.matchIdentity,
      )
      const sessionMissing = evidence.champSelectSession !== 'ok'
      const sameHeroWithoutIdentity =
        !evidence.matchIdentity &&
        this.confirmed.stage === 'launching' &&
        next.currentChampionId === this.confirmed.currentChampionId
      const conflictingHero =
        next.currentChampionId != null &&
        next.currentChampionId !== this.confirmed.currentChampionId
      const incompleteOutgoingObservation =
        !isAramMayhemQueueId(next.queueId) || next.currentChampionId == null
      if (
        !conflictingHero &&
        (sameIdentity || sessionMissing || sameHeroWithoutIdentity || incompleteOutgoingObservation)
      ) {
        const elapsed = now - this.confirmed.lastMatchPhaseAt
        const leaseMs = this.confirmed.enteredGame
          ? MATCH_CONTEXT_MAX_STALE_MS
          : MATCH_CONTEXT_NONE_GRACE_MS
        if (elapsed > leaseMs) {
          this.confirmed = null
          this.pendingTerminal = null
          this.lastDecision = 'expired'
          return this.withoutContext({
            ...next,
            queueId: null,
            modeActive: false,
            currentChampionId: null,
            benchChampionIds: [],
            benchEnabled: false,
          })
        }
        this.lastDecision = 'retained-outgoing-champ-select'
        return this.withContext({
          ...next,
          currentChampionId: null,
          benchChampionIds: [],
          benchEnabled: false,
        })
      }
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'cleared-new-champ-select'
    }

    if (isAramMayhemQueueId(next.queueId) && next.currentChampionId != null) {
      const existing = this.confirmed
      const timerHandoff = isChampSelectHandoffPhase(evidence.champSelectTimerPhase)
      const enteredGame = existing?.enteredGame === true ||
        isEnteredGamePhase(next.phase) || evidence.gameClientRunning === true
      const stage = evidence.gameClientRunning === true
        ? 'active'
        : timerHandoff
          ? 'launching'
          : stageForPhase(next.phase, existing?.stage ?? 'selecting')
      this.confirmed = {
        queueId: next.queueId,
        currentChampionId: next.currentChampionId,
        lastMatchPhaseAt: now,
        enteredGame,
        stage,
        generation: existing?.generation ?? ++this.generation,
        matchIdentity: evidence.matchIdentity ?? existing?.matchIdentity ?? null,
        authorityEpoch: evidence.authorityEpoch ?? existing?.authorityEpoch ?? null,
        handoffCommitted: existing?.handoffCommitted === true || timerHandoff ||
          isEnteredGamePhase(next.phase) || evidence.gameClientRunning === true,
        independentGameHeartbeatAt: existing?.independentGameHeartbeatAt ?? null,
      }
      this.lastDecision = 'confirmed'
      return this.withContext(next)
    }

    if (!this.confirmed) {
      if (this.lastDecision !== 'cleared-new-champ-select' && this.lastDecision !== 'cleared-queue-change') {
        this.lastDecision = 'none'
      }
      return this.withoutContext(next)
    }

    if (!observationTrusted) return this.retainUntrustedObservation(next, now)

    const canCarryMatchPhase = MATCH_CONTEXT_PHASES.has(next.phase)
    const isTransientNone = next.phase === 'None'
    const isUnknownTransition = !canCarryMatchPhase && !isTransientNone
    const elapsed = now - this.confirmed.lastMatchPhaseAt
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    const canCarryTransientNone = isTransientNone && elapsed <= leaseMs
    const canCarryUnknownTransition = isUnknownTransition && elapsed <= leaseMs
    if (!canCarryMatchPhase && !canCarryTransientNone && !canCarryUnknownTransition) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'expired'
      return this.withoutContext(next)
    }

    if (next.queueId != null && next.queueId !== this.confirmed.queueId) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'cleared-queue-change'
      return this.withoutContext(next)
    }
    if (isTransientNone && this.confirmed.stage === 'selecting') {
      // The CN client can return an empty/404 phase while LeagueClientUx is
      // still reachable but already handing control to the game process.
      this.confirmed.stage = 'launching'
      this.confirmed.handoffCommitted = true
    } else if (canCarryMatchPhase) {
      this.confirmed.lastMatchPhaseAt = now
      this.confirmed.stage = stageForPhase(next.phase, this.confirmed.stage)
      if (isEnteredGamePhase(next.phase)) {
        this.confirmed.enteredGame = true
      }
      this.lastDecision = 'retained-match-phase'
    } else if (isUnknownTransition) {
      // Unknown regional hand-off phases must not erase a confirmed match. A
      // named terminal phase or a new queue still clears it above.
      this.confirmed.stage = this.confirmed.stage === 'selecting' ? 'launching' : this.confirmed.stage
      if (this.confirmed.stage === 'launching') this.confirmed.handoffCommitted = true
      this.lastDecision = 'retained-unknown-phase'
    } else {
      this.lastDecision = 'retained-match-phase'
    }
    return this.withContext(next)
  }

  transportDisconnected(previous: ChampSelectSnapshot, now = Date.now()): ChampSelectSnapshot {
    if (!this.confirmed) return this.discardTransportContext(previous, now)
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    if (now - this.confirmed.lastMatchPhaseAt > leaseMs) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'expired'
      return this.discardTransportContext(previous, now)
    }
    if (this.confirmed.stage === 'selecting') this.confirmed.stage = 'launching'
    this.confirmed.handoffCommitted = true
    this.pendingTerminal = null
    this.lastDecision = 'retained-transport-handoff'
    return this.withContext({
      ...previous,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  confirmGameActive(
    previous: ChampSelectSnapshot,
    expectedGeneration: number,
    expectedChampionId: number,
    now = Date.now(),
    source: 'game-process' | 'augment-interface' = 'game-process',
  ): ChampSelectSnapshot {
    if (
      !this.confirmed ||
      (this.confirmed.stage !== 'launching' && this.confirmed.stage !== 'active') ||
      this.confirmed.generation !== expectedGeneration ||
      this.confirmed.currentChampionId !== expectedChampionId
    ) {
      return previous
    }
    this.confirmed.enteredGame = true
    this.confirmed.stage = 'active'
    this.confirmed.handoffCommitted = true
    if (source === 'game-process') this.confirmed.independentGameHeartbeatAt = now
    this.confirmed.lastMatchPhaseAt = now
    this.pendingTerminal = null
    this.lastDecision = 'confirmed-game-active'
    return this.withContext({
      ...previous,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  confirmGameInactive(
    previous: ChampSelectSnapshot,
    expectedGeneration: number,
    expectedChampionId: number,
    now = Date.now(),
  ): ChampSelectSnapshot {
    if (
      !this.confirmed ||
      this.confirmed.stage !== 'active' ||
      this.confirmed.generation !== expectedGeneration ||
      this.confirmed.currentChampionId !== expectedChampionId ||
      this.confirmed.independentGameHeartbeatAt == null ||
      now - this.confirmed.independentGameHeartbeatAt <= INDEPENDENT_GAME_HEARTBEAT_MS
    ) {
      return previous
    }
    this.confirmed = null
    this.pendingTerminal = null
    this.lastDecision = 'cleared-game-process-exit'
    return this.withoutContext({
      ...previous,
      queueId: null,
      modeActive: false,
      currentChampionId: null,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  private withContext(next: ChampSelectSnapshot): ChampSelectSnapshot {
    if (!this.confirmed) return this.withoutContext(next)
    return {
      ...next,
      queueId: next.queueId ?? this.confirmed.queueId,
      modeActive: isAramMayhemQueueId(next.queueId ?? this.confirmed.queueId),
      matchStage: this.confirmed.stage,
      matchGeneration: this.confirmed.generation,
      currentChampionId: next.currentChampionId ?? this.confirmed.currentChampionId,
      // Bench data is champ-select-only and must never leak into game.
      benchChampionIds: next.phase === 'ChampSelect' ? next.benchChampionIds : [],
      benchEnabled: next.phase === 'ChampSelect' ? next.benchEnabled : false,
    }
  }

  private withoutContext(next: ChampSelectSnapshot): ChampSelectSnapshot {
    return {
      ...next,
      matchStage: 'none',
      matchGeneration: this.generation,
    }
  }

  private discardTransportContext(previous: ChampSelectSnapshot, now: number): ChampSelectSnapshot {
    return this.withoutContext({
      ...previous,
      queueId: null,
      modeActive: false,
      currentChampionId: null,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  reset(): void {
    this.confirmed = null
    this.pendingTerminal = null
    this.lastDecision = 'none'
  }

  getLastDecision(): MatchContextDecision {
    return this.lastDecision
  }

  getBinding(): {
    authorityEpoch: number | null
    matchIdentity: string | null
    generation: number
    championId: number
    stage: Exclude<MatchContextStage, 'none'>
  } | null {
    if (!this.confirmed) return null
    return {
      authorityEpoch: this.confirmed.authorityEpoch,
      matchIdentity: this.confirmed.matchIdentity,
      generation: this.confirmed.generation,
      championId: this.confirmed.currentChampionId,
      stage: this.confirmed.stage,
    }
  }

  isAuthorityTrusted(authorityEpoch: number | null): boolean {
    return Boolean(
      this.confirmed &&
      authorityEpoch != null &&
      this.confirmed.authorityEpoch != null &&
      authorityEpoch === this.confirmed.authorityEpoch,
    )
  }

  private retainPartialObservation(next: ChampSelectSnapshot, now: number): ChampSelectSnapshot {
    if (!this.confirmed) return this.withoutContext(next)
    const elapsed = now - this.confirmed.lastMatchPhaseAt
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    if (elapsed > leaseMs) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'expired'
      return this.withoutContext(next)
    }

    if (next.phase === 'GameStart' || next.phase === 'InProgress' || next.phase === 'Reconnect') {
      this.confirmed.lastMatchPhaseAt = now
      this.confirmed.stage = stageForPhase(next.phase, this.confirmed.stage)
      this.confirmed.enteredGame = true
    } else if (this.confirmed.stage === 'selecting') {
      this.confirmed.stage = 'launching'
      this.confirmed.handoffCommitted = true
    }
    this.lastDecision = 'retained-partial-observation'
    return this.withContext({
      ...next,
      queueId: null,
      currentChampionId: null,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  private commitTrustedHandoff(next: ChampSelectSnapshot, now: number): ChampSelectSnapshot {
    if (!this.confirmed) return this.withoutContext(next)
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    if (now - this.confirmed.lastMatchPhaseAt > leaseMs) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'expired'
      return this.withoutContext({
        ...next,
        queueId: null,
        modeActive: false,
        currentChampionId: null,
        benchChampionIds: [],
        benchEnabled: false,
      })
    }
    if (this.confirmed.stage !== 'active') this.confirmed.stage = 'launching'
    this.confirmed.handoffCommitted = true
    this.pendingTerminal = null
    this.lastDecision = 'retained-match-phase'
    return this.withContext({
      ...next,
      queueId: null,
      currentChampionId: null,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  private confirmTrustedGameClient(next: ChampSelectSnapshot, now: number): ChampSelectSnapshot {
    if (!this.confirmed) return this.withoutContext(next)
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    if (now - this.confirmed.lastMatchPhaseAt > leaseMs) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'expired'
      return this.withoutContext({
        ...next,
        queueId: null,
        modeActive: false,
        currentChampionId: null,
        benchChampionIds: [],
        benchEnabled: false,
      })
    }
    this.confirmed.enteredGame = true
    this.confirmed.stage = 'active'
    this.confirmed.handoffCommitted = true
    this.confirmed.lastMatchPhaseAt = now
    this.pendingTerminal = null
    this.lastDecision = 'confirmed-game-active'
    return this.withContext({
      ...next,
      queueId: null,
      currentChampionId: null,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }

  private isEvidenceAuthorityTrusted(evidence: MatchContextEvidence): boolean {
    return Boolean(
      this.confirmed &&
      evidence.authorityEpoch != null &&
      this.confirmed.authorityEpoch != null &&
      evidence.authorityEpoch === this.confirmed.authorityEpoch,
    )
  }

  private isEvidenceIdentityTrusted(evidence: MatchContextEvidence): boolean {
    return Boolean(
      this.confirmed &&
      evidence.matchIdentity &&
      this.confirmed.matchIdentity &&
      evidence.matchIdentity === this.confirmed.matchIdentity,
    )
  }

  private retainUntrustedObservation(next: ChampSelectSnapshot, now: number): ChampSelectSnapshot {
    if (!this.confirmed) return this.withoutContext(next)
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    if (now - this.confirmed.lastMatchPhaseAt > leaseMs) {
      this.confirmed = null
      this.pendingTerminal = null
      this.lastDecision = 'expired'
      return this.withoutContext({
        ...next,
        queueId: null,
        modeActive: false,
        currentChampionId: null,
        benchChampionIds: [],
        benchEnabled: false,
      })
    }
    this.lastDecision = 'retained-untrusted-observation'
    return this.withContext({
      ...next,
      queueId: null,
      currentChampionId: null,
      benchChampionIds: [],
      benchEnabled: false,
      updatedAt: now,
    })
  }
}

function isEnteredGamePhase(phase: GameflowPhase): boolean {
  return ['GameStart', 'InProgress', 'Reconnect'].includes(phase)
}

function isChampSelectHandoffPhase(phase: string | null | undefined): boolean {
  return String(phase ?? '').toUpperCase() === 'GAME_STARTING'
}

function stageForPhase(
  phase: GameflowPhase,
  fallback: Exclude<MatchContextStage, 'none'>,
): Exclude<MatchContextStage, 'none'> {
  if (phase === 'ChampSelect') return 'selecting'
  if (phase === 'GameStart') return 'launching'
  if (phase === 'InProgress' || phase === 'Reconnect') return 'active'
  return fallback
}

/**
 * Champ-select endpoints disappear before the game reaches InProgress. Carry the
 * last confirmed champion and queue through the short game-start transition so
 * champion-specific recommendations remain available in game.
 */
export function carryForwardMatchContext(
  previous: ChampSelectSnapshot,
  next: ChampSelectSnapshot,
): ChampSelectSnapshot {
  const tracker = new MatchContextTracker()
  tracker.apply(previous, previous.updatedAt)
  return tracker.apply(next, next.updatedAt)
}
