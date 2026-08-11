<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AugmentSlot, CalibrationRects, NormalizedRect } from '../../shared/contracts'
import { api } from './state'

const slots: AugmentSlot[] = ['left', 'center', 'right']
const labels = { left: '左侧标题', center: '中间标题', right: '右侧标题' }
const rects = ref<Partial<CalibrationRects>>({})
const active = computed(() => slots.find((slot) => !rects.value[slot]) ?? null)
const start = ref<{ x: number; y: number } | null>(null)
const draft = ref<NormalizedRect | null>(null)

function point(event: PointerEvent): { x: number; y: number } {
  return { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight }
}
function down(event: PointerEvent) {
  if (!active.value || (event.target as HTMLElement).closest('.calibration-toolbar')) return
  start.value = point(event)
  draft.value = { ...start.value, width: 0, height: 0 }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (!start.value) return
  const end = point(event)
  draft.value = { x: Math.min(start.value.x, end.x), y: Math.min(start.value.y, end.y), width: Math.abs(end.x - start.value.x), height: Math.abs(end.y - start.value.y) }
}
function up() {
  if (active.value && draft.value && draft.value.width > .03 && draft.value.height > .015) rects.value[active.value] = draft.value
  start.value = null
  draft.value = null
}
function style(rect: NormalizedRect) { return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` } }
function reset() { rects.value = {}; draft.value = null; start.value = null }
async function save() { if (!active.value) await api.completeCalibration(rects.value as CalibrationRects) }
</script>

<template>
  <div class="calibration-overlay" @pointerdown="down" @pointermove="move" @pointerup="up">
    <div class="calibration-shade" />
    <div v-for="slot in slots" v-show="rects[slot]" :key="slot" class="calibration-rect complete" :style="style(rects[slot]!)"><span>{{ labels[slot] }}</span></div>
    <div v-if="draft && active" class="calibration-rect" :style="style(draft)"><span>{{ labels[active] }}</span></div>
    <div class="calibration-toolbar"><small>OCR CALIBRATION</small><h2>{{ active ? `框选${labels[active]}区域` : '三个区域已完成' }}</h2><p>只框住海克斯卡片上方的中文标题。按左、中、右依次拖动。</p><div class="calibration-progress"><i v-for="slot in slots" :key="slot" :class="{ done: rects[slot] }" /></div><div><button class="ghost" @click.stop="reset">重新开始</button><button class="ghost" @click.stop="api.cancelCalibration()">取消</button><button class="primary" :disabled="!!active" @click.stop="save">保存校准</button></div></div>
  </div>
</template>
