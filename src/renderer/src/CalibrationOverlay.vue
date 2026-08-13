<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AugmentSlot, CalibrationContext, CalibrationRects, NormalizedRect } from '../../shared/contracts'
import { looksLikeWholeCard } from '../../shared/ocr-geometry'
import { api } from './state'

const slots: AugmentSlot[] = ['left', 'center', 'right']
const labels = { left: '左侧整张卡片', center: '中间整张卡片', right: '右侧整张卡片' }
const rects = ref<Partial<CalibrationRects>>({})
const context = ref<CalibrationContext | null>(null)
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const verifying = ref(false)
const active = computed(() => slots.find((slot) => !rects.value[slot]) ?? null)
const start = ref<{ x: number; y: number } | null>(null)
const draft = ref<NormalizedRect | null>(null)

function point(event: PointerEvent): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, event.clientX / window.innerWidth)),
    y: Math.max(0, Math.min(1, event.clientY / window.innerHeight)),
  }
}

function down(event: PointerEvent): void {
  if (!active.value || (event.target as HTMLElement).closest('.calibration-toolbar')) return
  start.value = point(event)
  draft.value = { ...start.value, width: 0, height: 0 }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function move(event: PointerEvent): void {
  if (!start.value) return
  const end = point(event)
  draft.value = {
    x: Math.min(start.value.x, end.x),
    y: Math.min(start.value.y, end.y),
    width: Math.abs(end.x - start.value.x),
    height: Math.abs(end.y - start.value.y),
  }
}

function up(): void {
  if (active.value && draft.value && draft.value.width > .08 && draft.value.height > .20) {
    rects.value[active.value] = draft.value
  }
  start.value = null
  draft.value = null
}

function cancelDrag(): void {
  start.value = null
  draft.value = null
}

function style(rect?: NormalizedRect): Record<string, string> {
  if (!rect) return {}
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  }
}

function reset(): void {
  rects.value = {}
  draft.value = null
  start.value = null
}

async function cancel(): Promise<void> {
  await api.cancelCalibration()
}

async function save(): Promise<void> {
  if (active.value || saving.value) return
  const ordered = slots.map((slot) => rects.value[slot] as NormalizedRect)
  const [left, center, right] = ordered
  if (
    !left || !center || !right ||
    !ordered.every(looksLikeWholeCard) ||
    !(left.x < center.x && center.x < right.x)
  ) {
    error.value = '请按左、中、右顺序框住三张完整卡片，不要只框标题。'
    return
  }
  saving.value = true
  try {
    verifying.value = true
    const preview = await api.previewCalibration(rects.value as CalibrationRects)
    verifying.value = false
    if (!preview.ok) {
      error.value = preview.message
      return
    }
    await api.completeCalibration(rects.value as CalibrationRects)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存校准失败'
  } finally {
    verifying.value = false
    saving.value = false
  }
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') void cancel()
}

onMounted(async () => {
  window.addEventListener('keydown', keydown)
  try {
    context.value = await api.getCalibrationContext()
    if (!context.value) throw new Error('校准会话已失效，请返回设置重试')
    if (
      context.value.existing &&
      slots.every((slot) => looksLikeWholeCard(context.value?.existing?.[slot] as NormalizedRect))
    ) {
      rects.value = structuredClone(context.value.existing)
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法加载校准画面'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', keydown))
</script>

<template>
  <div
    class="calibration-overlay"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancelDrag"
    @lostpointercapture="cancelDrag"
  >
    <img
      v-if="context"
      class="calibration-screenshot"
      :src="context.backgroundDataUrl"
      alt="目标显示器截图"
      draggable="false"
    />
    <div class="calibration-vignette" />
    <template v-for="slot in slots" :key="slot">
      <div
        v-if="rects[slot]"
        class="calibration-rect complete"
        :style="style(rects[slot])"
      >
        <span>{{ labels[slot] }}</span>
        <i v-if="looksLikeWholeCard(rects[slot])" class="calibration-title-band">自动识别标题区域</i>
      </div>
    </template>
    <div v-if="draft && active" class="calibration-rect" :style="style(draft)">
      <span>{{ labels[active] }}</span>
    </div>

    <div class="calibration-toolbar" role="dialog" aria-labelledby="calibration-title">
      <small>海克斯整卡校准 · {{ context?.displayLabel || '正在读取显示器' }}</small>
      <h2 id="calibration-title">
        {{ loading ? '正在准备校准画面' : active ? `拖框选中${labels[active]}` : '三个标题区域已完成' }}
      </h2>
      <p>
        框住每张海克斯的整张卡片，HexBridge 会自动提取中部中文标题，不需要你精确瞄准文字。按左、中、右顺序完成；按 Esc 随时退出。
      </p>
      <p v-if="context" class="calibration-meta">
        截图 {{ context.physicalWidth }}×{{ context.physicalHeight }} · 框选会按比例适配 DPI
      </p>
      <p v-if="error" class="calibration-error" role="alert">{{ error }}</p>
      <div class="calibration-progress" aria-label="校准进度">
        <i v-for="slot in slots" :key="slot" :class="{ done: rects[slot] }" />
      </div>
      <div>
        <button class="ghost" :disabled="loading" @click.stop="reset">重新框选</button>
        <button class="ghost" @click.stop="cancel">取消（Esc）</button>
        <button class="primary" :disabled="!!active || loading || saving" @click.stop="save">
          {{ verifying ? '正在验证三张标题…' : saving ? '正在保存…' : '验证并保存' }}
        </button>
      </div>
    </div>
  </div>
</template>
