<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { AugmentOverlayViewState } from '../../shared/contracts'
import { nextAugmentAnimationState } from '../../shared/augment-animation'

const view = ref<AugmentOverlayViewState>({ slots: [], layout: [], message: '' })
const unsubscribe = window.hexbridgeOverlay?.onChanged((next) => { view.value = next }) ?? (() => undefined)
onBeforeUnmount(unsubscribe)
const slotAnimationCycle = ref(0)
const slotAnimationBySlot = ref<Record<string, number>>({})
const slotSignatures = new Map<string, string>()
watch(
  () => view.value.slots.map((slot) => ({ slot: slot.slot, augmentId: slot.augmentId })),
  (slots) => {
    const animation = nextAugmentAnimationState(slotSignatures, slotAnimationCycle.value, slots)
    slotSignatures.clear()
    animation.signatures.forEach((signature, slot) => slotSignatures.set(slot, signature))
    slotAnimationCycle.value = animation.cycle
    slotAnimationBySlot.value = animation.changedBySlot
  },
  { immediate: true, deep: true },
)
const slotStyle = (slot: 'left' | 'center' | 'right') => {
  const placement = view.value.layout.find((item) => item.slot === slot)
  return placement ? { left: `${placement.left * 100}%`, width: `${placement.width * 100}%` } : {}
}
const pickRate = (value: number | null): string =>
  value == null ? '暂无数据' : `${(value * 100).toFixed(1)}%`
const rankLabel = (position: number | null, tied: boolean): string =>
  position == null ? '—' : tied ? '并列' : String(position)
const reason = (value: string): string => value || '暂无可靠推荐依据'
const displayPickRate = (slot: AugmentOverlayViewState['slots'][number]): number | null =>
  slot.recommendationSource === 'tencent101' ? slot.globalPickRate : slot.pickRate
const pickRateLabel = (slot: AugmentOverlayViewState['slots'][number]): string =>
  slot.recommendationSource === 'tencent101' ? '全局选取率' : '该英雄选取率'
const sourceLabel = (slot: AugmentOverlayViewState['slots'][number]): string =>
  `${slot.recommendationSource === 'tencent101' ? '腾讯数据站' : 'data.dtodo'}${slot.statisticsDate ? ` · ${slot.statisticsDate}` : ''}`
const slotKey = (slot: AugmentOverlayViewState['slots'][number]): string =>
  `${slot.slot}-${slot.augmentId ?? 'unknown'}`
</script>

<template>
  <div class="augment-overlay-window" data-performance="eco" aria-live="polite">
    <div v-for="slot in view.slots" :key="slotKey(slot)" class="augment-overlay-slot" :style="slotStyle(slot.slot)">
        <article
          :class="[{ unknown: !slot.augmentId }, { 'overlay-card-refresh': slotAnimationBySlot[slot.slot] === slotAnimationCycle }]"
        >
          <span class="overlay-rank"><b>{{ rankLabel(slot.position, slot.tied) }}</b><small>推荐</small></span>
          <span class="overlay-pick-rate"><b>{{ pickRate(displayPickRate(slot)) }}</b><small>{{ pickRateLabel(slot) }}</small><em v-if="slot.recommendationSource === 'tencent101'">全局胜率 {{ pickRate(slot.globalWinRate) }}</em></span>
          <div class="overlay-copy">
            <b>{{ slot.name || '未识别' }}</b>
            <small>{{ slot.augmentId ? reason(slot.reason) : '等待可靠结果' }}</small>
            <em>{{ sourceLabel(slot) }}</em>
          </div>
        </article>
    </div>
  </div>
</template>
