import type {
  ChampSelectSnapshot,
  GameflowPhase,
  MatchContextStage,
} from '../../shared/contracts.js'

const positiveInteger = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

const queueIdFromSession = (session: any): number | null =>
  positiveInteger(
    session?.gameData?.queue?.id ??
      session?.gameData?.queueId ??
      session?.queue?.id ??
      session?.queueId ??
      session?.gameClient?.queueId,
  )

const queueIdFromLobby = (lobby: any): number | null =>
  positiveInteger(lobby?.gameConfig?.queueId ?? lobby?.queueId)

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
  const currentChampionId =
    positiveInteger(input.currentChampionId) ??
    positiveInteger(localMember?.championId) ??
    positiveInteger(localMember?.championPickIntent)

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
    modeActive: queueId === 2400,
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

interface ConfirmedMatchContext {
  queueId: number
  currentChampionId: number
  lastMatchPhaseAt: number
  enteredGame: boolean
  stage: Exclude<MatchContextStage, 'none'>
  generation: number
  matchIdentity: string | null
}

export type LcuEndpointObservationStatus = 'ok' | 'empty' | 'error' | 'skipped'

export interface MatchContextEvidence {
  destructive: boolean
  champSelectSession: LcuEndpointObservationStatus
  currentChampion?: LcuEndpointObservationStatus
  matchIdentity: string | null
}

const DEFAULT_EVIDENCE: MatchContextEvidence = {
  destructive: true,
  champSelectSession: 'ok',
  currentChampion: 'ok',
  matchIdentity: null,
}

export type MatchContextDecision =
  | 'none'
  | 'confirmed'
  | 'retained-match-phase'
  | 'retained-outgoing-champ-select'
  | 'retained-partial-observation'
  | 'retained-unknown-phase'
  | 'retained-transport-handoff'
  | 'confirmed-game-active'
  | 'cleared-terminal-phase'
  | 'cleared-queue-change'
  | 'cleared-new-champ-select'
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

  apply(
    next: ChampSelectSnapshot,
    now = next.updatedAt,
    evidence: MatchContextEvidence = DEFAULT_EVIDENCE,
  ): ChampSelectSnapshot {
    const hasPositiveChampSelectEvidence =
      next.phase === 'ChampSelect' &&
      next.queueId === 2400 &&
      next.currentChampionId != null &&
      (evidence.champSelectSession === 'ok' || evidence.currentChampion === 'ok')

    if (!evidence.destructive && !hasPositiveChampSelectEvidence) {
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

    if (evidence.destructive && CLEAR_CONTEXT_PHASES.has(next.phase)) {
      this.confirmed = null
      this.lastDecision = 'cleared-terminal-phase'
      return this.withoutContext(next)
    }

    if (
      evidence.destructive &&
      next.queueId != null &&
      this.confirmed &&
      next.queueId !== this.confirmed.queueId
    ) {
      this.confirmed = null
      this.lastDecision = 'cleared-queue-change'
    }

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
      if (!conflictingHero && (sameIdentity || sessionMissing || sameHeroWithoutIdentity)) {
        const elapsed = now - this.confirmed.lastMatchPhaseAt
        const leaseMs = this.confirmed.enteredGame
          ? MATCH_CONTEXT_MAX_STALE_MS
          : MATCH_CONTEXT_NONE_GRACE_MS
        if (elapsed > leaseMs) {
          this.confirmed = null
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
      this.lastDecision = 'cleared-new-champ-select'
    }

    if (next.queueId === 2400 && next.currentChampionId != null) {
      const existing = this.confirmed
      const enteredGame = existing?.enteredGame === true || isEnteredGamePhase(next.phase)
      const stage = stageForPhase(next.phase, existing?.stage ?? 'selecting')
      this.confirmed = {
        queueId: next.queueId,
        currentChampionId: next.currentChampionId,
        lastMatchPhaseAt: now,
        enteredGame,
        stage,
        generation: existing?.generation ?? ++this.generation,
        matchIdentity: evidence.matchIdentity ?? existing?.matchIdentity ?? null,
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
      this.lastDecision = 'expired'
      return this.withoutContext(next)
    }

    if (next.queueId != null && next.queueId !== this.confirmed.queueId) {
      this.confirmed = null
      this.lastDecision = 'cleared-queue-change'
      return this.withoutContext(next)
    }
    if (isTransientNone && this.confirmed.stage === 'selecting') {
      // The CN client can return an empty/404 phase while LeagueClientUx is
      // still reachable but already handing control to the game process.
      this.confirmed.stage = 'launching'
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
      this.lastDecision = 'expired'
      return this.discardTransportContext(previous, now)
    }
    if (this.confirmed.stage === 'selecting') this.confirmed.stage = 'launching'
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
  ): ChampSelectSnapshot {
    if (
      !this.confirmed ||
      this.confirmed.stage !== 'launching' ||
      this.confirmed.generation !== expectedGeneration ||
      this.confirmed.currentChampionId !== expectedChampionId
    ) {
      return previous
    }
    this.confirmed.enteredGame = true
    this.confirmed.stage = 'active'
    this.confirmed.lastMatchPhaseAt = now
    this.lastDecision = 'confirmed-game-active'
    return this.withContext({
      ...previous,
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
      modeActive: (next.queueId ?? this.confirmed.queueId) === 2400,
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
    this.lastDecision = 'none'
  }

  getLastDecision(): MatchContextDecision {
    return this.lastDecision
  }

  private retainPartialObservation(next: ChampSelectSnapshot, now: number): ChampSelectSnapshot {
    if (!this.confirmed) return this.withoutContext(next)
    const elapsed = now - this.confirmed.lastMatchPhaseAt
    const leaseMs = this.confirmed.enteredGame
      ? MATCH_CONTEXT_MAX_STALE_MS
      : MATCH_CONTEXT_NONE_GRACE_MS
    if (elapsed > leaseMs) {
      this.confirmed = null
      this.lastDecision = 'expired'
      return this.withoutContext(next)
    }

    if (next.phase === 'GameStart' || next.phase === 'InProgress' || next.phase === 'Reconnect') {
      this.confirmed.lastMatchPhaseAt = now
      this.confirmed.stage = stageForPhase(next.phase, this.confirmed.stage)
      this.confirmed.enteredGame = true
    } else if (this.confirmed.stage === 'selecting') {
      this.confirmed.stage = 'launching'
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
}

function isEnteredGamePhase(phase: GameflowPhase): boolean {
  return ['GameStart', 'InProgress', 'Reconnect'].includes(phase)
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
