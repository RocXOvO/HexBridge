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

const MATCH_CONTEXT_PHASES = new Set<GameflowPhase>(['GameStart', 'InProgress', 'Reconnect'])

/**
 * Champ-select endpoints disappear before the game reaches InProgress. Carry the
 * last confirmed champion and queue through the short game-start transition so
 * champion-specific recommendations remain available in game.
 */
export function carryForwardMatchContext(
  previous: ChampSelectSnapshot,
  next: ChampSelectSnapshot,
): ChampSelectSnapshot {
  if (!MATCH_CONTEXT_PHASES.has(next.phase)) return next

  const queueId = next.queueId ?? previous.queueId
  return {
    ...next,
    queueId,
    modeActive: queueId === 2400,
    currentChampionId:
      queueId === 2400 ? next.currentChampionId ?? previous.currentChampionId : next.currentChampionId,
  }
}
