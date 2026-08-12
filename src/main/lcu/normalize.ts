import type { ChampSelectSnapshot, GameflowPhase } from '../../shared/contracts.js'

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

export function normalizeChampSelectSnapshot(input: {
  phase: GameflowPhase
  locale?: string
  gameflowSession: unknown
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

  const queueId = queueIdFromSession(input.gameflowSession)
  return {
    phase: input.phase,
    locale: input.locale ?? 'zh_CN',
    queueId,
    modeActive: queueId === 2400,
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
])
export const MATCH_CONTEXT_NONE_GRACE_MS = 30_000

interface ConfirmedMatchContext {
  queueId: number
  currentChampionId: number
  lastMatchPhaseAt: number
  enteredGame: boolean
}

/**
 * LCU gameflow and champ-select endpoints do not transition atomically. Keep
 * the last confirmed queue/champion independently from the emitted snapshot so
 * an outgoing 404 or a brief `None` cannot erase the active match.
 */
export class MatchContextTracker {
  private confirmed: ConfirmedMatchContext | null = null

  apply(next: ChampSelectSnapshot, now = next.updatedAt): ChampSelectSnapshot {
    if (CLEAR_CONTEXT_PHASES.has(next.phase)) {
      this.confirmed = null
      return next
    }

    // A return to champ select after GameStart/InProgress/Reconnect always
    // opens a new match generation, even when a disconnect hid all terminal
    // phases and the queue id remains 2400.
    if (next.phase === 'ChampSelect' && this.confirmed?.enteredGame) {
      this.confirmed = null
    }

    if (next.queueId != null && this.confirmed && next.queueId !== this.confirmed.queueId) {
      this.confirmed = null
    }

    if (next.queueId === 2400 && next.currentChampionId != null) {
      this.confirmed = {
        queueId: next.queueId,
        currentChampionId: next.currentChampionId,
        lastMatchPhaseAt: now,
        enteredGame: ['GameStart', 'InProgress', 'Reconnect'].includes(next.phase),
      }
      return next
    }

    if (!this.confirmed) return next

    const canCarryMatchPhase = MATCH_CONTEXT_PHASES.has(next.phase)
    const canCarryTransientNone =
      next.phase === 'None' && now - this.confirmed.lastMatchPhaseAt <= MATCH_CONTEXT_NONE_GRACE_MS
    if (!canCarryMatchPhase && !canCarryTransientNone) {
      if (next.phase === 'None') this.confirmed = null
      return next
    }

    if (next.queueId != null && next.queueId !== this.confirmed.queueId) return next
    if (canCarryMatchPhase) {
      this.confirmed.lastMatchPhaseAt = now
      if (['GameStart', 'InProgress', 'Reconnect'].includes(next.phase)) {
        this.confirmed.enteredGame = true
      }
    }
    return {
      ...next,
      queueId: next.queueId ?? this.confirmed.queueId,
      modeActive: (next.queueId ?? this.confirmed.queueId) === 2400,
      currentChampionId: next.currentChampionId ?? this.confirmed.currentChampionId,
      // Bench data is champ-select-only and must never leak into game.
      benchChampionIds: next.phase === 'ChampSelect' ? next.benchChampionIds : [],
      benchEnabled: next.phase === 'ChampSelect' ? next.benchEnabled : false,
    }
  }

  reset(): void {
    this.confirmed = null
  }
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
