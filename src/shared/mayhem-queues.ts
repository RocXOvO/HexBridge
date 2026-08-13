/**
 * Queue identifiers observed for ARAM Mayhem.
 *
 * 2400 is the public/global queue identifier used by the original V1 scope.
 * 3270 was observed end-to-end on the CN/WeGame client, including a custom
 * lobby flowing through ChampSelect and InProgress. Keep the policy in one
 * place so regional queue allocation cannot silently break match retention.
 */
export const ARAM_MAYHEM_QUEUE_IDS = [2400, 3270] as const

export function isAramMayhemQueueId(queueId: number | null): queueId is number {
  return queueId != null &&
    ARAM_MAYHEM_QUEUE_IDS.some((candidate) => candidate === queueId)
}
