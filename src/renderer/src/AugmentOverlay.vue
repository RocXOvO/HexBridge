<script setup lang="ts">
import { useRuntime } from './state'
const { state } = useRuntime()
const slotLabel = (position: number | null, tied: boolean) => position == null ? '—' : tied ? '并列' : String(position)
const reason = (value: string) => ['stale', 'limited', 'offline'].includes(state.value.api.status) ? `数据已过期 · ${value}` : value
</script>

<template>
  <div class="augment-overlay" data-performance="eco">
    <Transition name="overlay-on" appear>
      <div v-if="state.overlay.visible" class="augment-slots">
        <article v-for="slot in state.overlay.slots" :key="slot.slot" :class="[`place-${slot.position ?? 0}`, { tied: slot.tied, unknown: !slot.augmentId }]">
          <span class="place">{{ slotLabel(slot.position, slot.tied) }}</span>
          <div><small>{{ slot.rarityName || '海克斯强化' }}</small><b>{{ slot.name || '未识别' }}</b><p>{{ slot.augmentId ? reason(slot.reason) : '未识别，请按 F8 重试' }}</p></div>
        </article>
      </div>
    </Transition>
  </div>
</template>
