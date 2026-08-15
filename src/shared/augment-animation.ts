export interface AugmentAnimationSlot {
  slot: string
  augmentId: number | null | undefined
}

export interface AugmentAnimationState {
  cycle: number
  signatures: Map<string, string>
  changedBySlot: Record<string, number>
}

/** Compute the slots that changed in one rendered surface update. */
export function nextAugmentAnimationState(
  previousSignatures: ReadonlyMap<string, string>,
  previousCycle: number,
  slots: readonly AugmentAnimationSlot[],
): AugmentAnimationState {
  const cycle = previousCycle + 1
  const signatures = new Map<string, string>()
  const changedBySlot: Record<string, number> = {}
  for (const slot of slots) {
    const signature = String(slot.augmentId ?? 'unknown')
    signatures.set(slot.slot, signature)
    if (previousSignatures.get(slot.slot) !== signature) changedBySlot[slot.slot] = cycle
  }
  return { cycle, signatures, changedBySlot }
}
