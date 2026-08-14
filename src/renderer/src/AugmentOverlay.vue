<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { AugmentOverlayViewState } from '../../shared/contracts'

const view = ref<AugmentOverlayViewState>({ slots: [], layout: [], message: '' })
const unsubscribe = window.hexbridgeOverlay?.onChanged((next) => { view.value = next }) ?? (() => undefined)
onBeforeUnmount(unsubscribe)
const slotStyle = (slot: 'left' | 'center' | 'right') => {
  const placement = view.value.layout.find((item) => item.slot === slot)
  return placement ? { left: `${placement.left * 100}%`, width: `${placement.width * 100}%` } : {}
}
const rankLabel = (position: number | null, tied: boolean): string =>
  tied ? '并列' : position == null ? '—' : String(position)
const reason = (value: string): string => value.replace(/英雄专属/g, '专属').replace(/全局/g, '综合')
</script>

<template>
  <div class="augment-overlay-window" data-performance="eco" aria-live="polite">
    <article
      v-for="slot in view.slots"
      :key="slot.slot"
      :class="[`place-${slot.position ?? 0}`, { tied: slot.tied, unknown: !slot.augmentId }]"
      :style="slotStyle(slot.slot)"
    >
      <span class="overlay-rank">{{ rankLabel(slot.position, slot.tied) }}</span>
      <div class="overlay-copy">
        <b>{{ slot.name || '未识别' }}</b>
        <small>{{ slot.augmentId ? reason(slot.reason) : '等待可靠结果' }}</small>
      </div>
    </article>
  </div>
</template>
