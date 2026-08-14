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
const pickRate = (value: number | null): string =>
  value == null ? '暂无数据' : `${(value * 100).toFixed(1)}%`
const rankLabel = (position: number | null, tied: boolean): string =>
  position == null ? '—' : tied ? '并列' : String(position)
const reason = (value: string): string => value || '暂无可靠推荐依据'
</script>

<template>
  <div class="augment-overlay-window" data-performance="eco" aria-live="polite">
    <article
      v-for="slot in view.slots"
      :key="slot.slot"
      :class="{ unknown: !slot.augmentId }"
      :style="slotStyle(slot.slot)"
    >
      <span class="overlay-rank"><b>{{ rankLabel(slot.position, slot.tied) }}</b><small>推荐</small></span>
      <span class="overlay-pick-rate"><b>{{ pickRate(slot.pickRate) }}</b><small>该英雄选取率</small></span>
      <div class="overlay-copy">
        <b>{{ slot.name || '未识别' }}</b>
        <small>{{ slot.augmentId ? reason(slot.reason) : '等待可靠结果' }}</small>
      </div>
    </article>
  </div>
</template>
