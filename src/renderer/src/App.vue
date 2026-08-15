<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ApiConnectionState, ChampionRecommendationView, ChampionSummary, OpponentFormSummary, RankedAugmentSlot, RecommendationDataState, RuntimeDiagnostics, ScoutPlayerDetails } from '../../shared/contracts'
import LogoMark from './logo-mark.vue'
import { describeMatchStatus } from '../../shared/match-status'
import { api, useRuntime } from './state'
import { matchesChampionSearch } from '../../shared/champion-search'
import { describeUpdateAction, shouldShowUpdateAction } from '../../shared/update-presentation'

type Page = 'live' | 'ranking' | 'settings' | 'diagnostics'
const { state, isPreview, bridgeError } = useRuntime()
const page = ref<Page>('live')
const search = ref('')
const rankingSort = ref<'tier' | 'winRate'>('tier')
const selectedChampionId = ref<number | null>(null)
const championRecommendation = ref<ChampionRecommendationView | null>(null)
const championRecommendationBusy = ref(false)
const championRecommendationMessage = ref('选择英雄后查看推荐海克斯')
const championRecommendationSort = ref<'recommendation' | 'globalPick' | 'globalWin'>('recommendation')
const championRecommendationRarity = ref<'all' | '白银' | '黄金' | '棱彩'>('all')
let championRecommendationSequence = 0
const apiKey = ref('')
const toast = ref('')
const toastIsError = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
const busy = ref(false)
const keyBusy = ref(false)
const apiKeyEditing = ref(false)
const keyFeedback = ref<{ kind: 'idle' | 'progress' | 'success' | 'error'; message: string }>({ kind: 'idle', message: '' })
const calibrationBusy = ref(false)
const updateBusy = ref(false)
const pageVisible = ref(!document.hidden)
const windowFocused = ref(document.hasFocus())
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const reducedMotion = ref(reducedMotionQuery.matches)
const lobbyBackgroundUrl = ref('')
let unsubscribeLobbyBackground: (() => void) | null = null
const recordingHotkey = ref(false)
const hotkeyFeedback = ref('')
const scoutDetails = ref<ScoutPlayerDetails | null>(null)
const scoutDetailsBusy = ref(false)
const scoutDetailsMessage = ref('')
const scoutDetailsDialog = ref<HTMLElement | null>(null)
const scoutDetailsCloseButton = ref<HTMLButtonElement | null>(null)
let scoutDetailsTrigger: HTMLElement | null = null
let scoutDetailsSequence = 0
const matchStatus = computed(() => describeMatchStatus(state.value.snapshot, state.value.lcu.connected))
const retainedMatch = computed(() => matchStatus.value.retained)
const updateBlocked = computed(() => state.value.snapshot.matchStage !== 'none')
const updateActionVisible = computed(() => shouldShowUpdateAction(state.value.update))
const updateActionLabel = computed(() => describeUpdateAction(state.value.update, updateBlocked.value))

const apiStatusText: Record<ApiConnectionState['status'], string> = {
  missing: '未配置',
  ready: '连接正常',
  stale: '使用缓存数据',
  unauthorized: '密钥无效',
  limited: '请求受限',
  offline: '网络离线',
  error: '服务异常',
}

const apiVisualStatus = computed<ApiConnectionState['status']>(() =>
  state.value.api.configured ? state.value.api.status : 'missing',
)
const apiKeyFormVisible = computed(() =>
  apiKeyEditing.value || !state.value.api.configured || state.value.api.status === 'unauthorized',
)
const apiStatusDetail = computed(() => {
  if (state.value.api.lastError && state.value.api.status !== 'ready') return state.value.api.lastError
  if (state.value.api.status === 'ready') return `数据版本 ${state.value.api.dataVersion || '已同步'}`
  if (state.value.api.status === 'stale') return '本地缓存仍可使用'
  if (state.value.api.status === 'limited') return '请求受限，稍后自动恢复'
  if (state.value.api.status === 'offline') return '离线状态，本地缓存仍可使用'
  if (state.value.api.status === 'unauthorized') return '请重新填写有效密钥'
  if (state.value.api.status === 'error') return '数据服务暂不可用'
  return state.value.settings.recommendationDataSource === 'tencent101'
    ? '填写密钥后启用出装等 data.dtodo 独立数据'
    : '填写密钥后启用 data.dtodo 英雄、海克斯与出装数据'
})

const manualOcrCodeText: Record<RuntimeDiagnostics['manualOcrCode'], string> = {
  IDLE: '尚未识别',
  RUNNING: '正在识别',
  MATCHED: '识别完成',
  NOT_ELIGIBLE: '当前阶段不可识别',
  NO_CHAMPION: '尚未识别当前英雄',
  NO_CATALOG: '海克斯目录尚未就绪',
  BUSY: '已有识别任务运行中',
  CONTEXT_ENDED: '本局上下文已结束',
  CONTEXT_SWITCHED: '当前英雄已发生变化',
  NOT_DETECTED: '未检测到三卡界面',
  UNRELIABLE: '识别结果不够可靠',
  SCAN_ERROR: '截图或识别失败',
  UNEXPECTED_ERROR: '发生未预期错误',
}

function dismissToast(): void {
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = null
  toast.value = ''
  toastIsError.value = false
}

function showToast(message: string, error = false, durationMs = error ? 8_000 : 4_500): void {
  dismissToast()
  toast.value = message
  toastIsError.value = error
  toastTimer = setTimeout(dismissToast, durationMs)
}

const current = computed(() => state.value.candidates.find((item) => item.isCurrent) ?? null)
const bench = computed(() => state.value.candidates.filter((item) => !item.isCurrent))
const recognizedChampionId = computed(() => state.value.snapshot.currentChampionId)
const recognizedChampionMissingData = computed(() => recognizedChampionId.value != null && !current.value)
const heroStyle = computed(() => current.value?.splashUrl ? { backgroundImage: `url(${current.value.splashUrl})` } : {})
const statusLabel = computed(() => matchStatus.value.label)
const augmentAssistantVisible = computed(() =>
  state.value.overlay.visible || ['launching', 'active'].includes(state.value.snapshot.matchStage),
)
const opponentAssistantVisible = computed(() =>
  state.value.settings.opponentScouting && state.value.snapshot.matchStage !== 'none',
)
const selecting = computed(() => state.value.snapshot.matchStage === 'selecting')

const ranking = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = state.value.champions.filter((item) => matchesChampionSearch(item, query))
  return [...rows].sort((a, b) => {
    if (rankingSort.value === 'winRate') return (b.winRate ?? -1) - (a.winRate ?? -1)
    return (a.tier ?? 99) - (b.tier ?? 99) || (b.winRate ?? -1) - (a.winRate ?? -1)
  })
})

const recommendationSourceName = computed(() =>
  state.value.settings.recommendationDataSource === 'tencent101'
    ? '腾讯英雄联盟数据站'
    : 'data.dtodo',
)

const recommendationStatusText: Record<RecommendationDataState['status'], string> = {
  loading: '加载中',
  ready: '数据就绪',
  stale: '使用旧缓存',
  missing: '等待配置',
  unauthorized: '授权无效',
  limited: '请求受限',
  offline: '离线缓存',
  error: '来源不可用',
}

const sortedChampionRecommendationCards = computed(() => {
  const cards = [...(championRecommendation.value?.cards ?? [])].filter((card) =>
    championRecommendationRarity.value === 'all' || card.rarityName === championRecommendationRarity.value,
  )
  if (championRecommendationSort.value === 'globalPick') {
    return cards.sort((a, b) => (b.globalPickRate ?? -1) - (a.globalPickRate ?? -1))
  }
  if (championRecommendationSort.value === 'globalWin') {
    return cards.sort((a, b) => (b.globalWinRate ?? -1) - (a.globalWinRate ?? -1))
  }
  return cards.sort((a, b) =>
    (a.recommendationRank ?? Number.POSITIVE_INFINITY) -
    (b.recommendationRank ?? Number.POSITIVE_INFINITY),
  )
})

function winRate(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function championStrengthLabel(): string {
  return state.value.recommendation.source === 'tencent101' ? '腾讯排名' : 'Tier'
}

function championStrengthValue(value: number | null): string {
  return state.value.recommendation.source === 'tencent101'
    ? value == null ? '—' : `#${value}`
    : tier(value)
}

function championWinRateLabel(): string {
  return state.value.recommendation.source === 'tencent101' ? '腾讯榜胜率' : '胜率'
}

function tier(value: number | null): string {
  return value == null ? '—' : `T${value}`
}

function augmentPickRate(value: number | null): string {
  return value == null ? '暂无数据' : `${(value * 100).toFixed(1)}%`
}

function globalRank(rank: number | null, change: number | null): string {
  if (rank == null) return '暂无数据'
  if (change == null || change === 0) return `#${rank} · 持平`
  return `#${rank} · ${change > 0 ? '上升' : '下降'} ${Math.abs(change)}`
}

function augmentStatsScope(slot: RankedAugmentSlot): string {
  const source = slot.statsSource === 'tencent'
    ? '腾讯快照'
    : slot.statsSource === 'iesdev'
      ? 'iesdev'
      : slot.statsSource === 'aramgg-client-upload'
        ? '匿名汇总'
        : '来源未标注'
  const region = slot.statsRegion === 'CN'
    ? '国服'
    : slot.statsRegion === 'WORLD'
      ? '跨服'
      : '范围未标注'
  return `${source} · ${region}`
}

function opponentChampion(opponent: OpponentFormSummary): ChampionSummary | null {
  return opponent.championId == null
    ? null
    : state.value.champions.find((champion) => champion.id === opponent.championId) ?? null
}

function championById(championId: number | null): ChampionSummary | null {
  return championId == null
    ? null
    : state.value.champions.find((champion) => champion.id === championId) ?? null
}

function opponentStreak(value: number): string {
  if (value > 0) return `连胜 ${value}`
  if (value < 0) return `连败 ${Math.abs(value)}`
  return '—'
}

function manualOcrTime(value: number | null): string {
  return value == null ? '尚未触发' : new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}

function slotLabel(position: number | null, tied: boolean): string {
  return position == null ? '—' : tied ? '并列' : String(position)
}

function augmentReason(value: string): string {
  return state.value.recommendation.stale
    ? `数据已过期 · ${value}`
    : value
}

function slotPickRate(slot: RankedAugmentSlot): number | null {
  return slot.recommendationSource === 'tencent101' ? slot.globalPickRate : slot.pickRate
}

function slotPickRateLabel(slot: RankedAugmentSlot): string {
  return slot.recommendationSource === 'tencent101' ? '全局选取率' : '该英雄选取率'
}

async function selectRankingChampion(championId: number): Promise<void> {
  selectedChampionId.value = championId
  championRecommendation.value = null
  championRecommendationBusy.value = true
  championRecommendationMessage.value = '正在读取当前来源的英雄推荐…'
  const sequence = ++championRecommendationSequence
  const source = state.value.settings.recommendationDataSource
  const snapshotId = state.value.recommendation.snapshotId
  const dataVersion = state.value.recommendation.dataVersion
  const statisticsDate = state.value.recommendation.statisticsDate
  try {
    const result = await api.getChampionRecommendation(championId)
    if (
      sequence !== championRecommendationSequence ||
      source !== state.value.settings.recommendationDataSource ||
      snapshotId !== state.value.recommendation.snapshotId ||
      dataVersion !== state.value.recommendation.dataVersion ||
      statisticsDate !== state.value.recommendation.statisticsDate ||
      (result.detail != null && (
        result.detail.source !== source ||
        result.detail.snapshotId !== snapshotId ||
        result.detail.dataVersion !== dataVersion ||
        result.detail.statisticsDate !== statisticsDate
      ))
    ) return
    championRecommendation.value = result.detail
    championRecommendationMessage.value = result.message
  } catch (error) {
    if (sequence !== championRecommendationSequence) return
    championRecommendationMessage.value = error instanceof Error ? error.message : '英雄推荐读取失败'
  } finally {
    if (sequence === championRecommendationSequence) championRecommendationBusy.value = false
  }
}

async function updateSettings(patch: Parameters<typeof api.updateSettings>[0]): Promise<void> {
  await api.updateSettings(patch)
}

async function validateKey(): Promise<void> {
  if (keyBusy.value) return
  keyBusy.value = true
  keyFeedback.value = { kind: 'progress', message: '正在验证 Key，不消耗 data credits…' }
  try {
    const result = await api.validateAndSaveApiKey(apiKey.value)
    keyFeedback.value = { kind: result.ok ? 'success' : 'error', message: result.message }
    showToast(result.message, !result.ok)
    if (result.ok) {
      apiKey.value = ''
      apiKeyEditing.value = false
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'API Key 验证失败，请稍后重试'
    keyFeedback.value = { kind: 'error', message }
    showToast(message, true)
  } finally {
    keyBusy.value = false
  }
}

async function clearKey(): Promise<void> {
  try {
    await api.clearApiKey()
    apiKey.value = ''
    apiKeyEditing.value = false
    keyFeedback.value = { kind: 'idle', message: '已清除本机保存的 API Key' }
  } catch (error) {
    keyFeedback.value = { kind: 'error', message: error instanceof Error ? error.message : '清除失败' }
  }
}

function editApiKey(): void {
  apiKeyEditing.value = true
  keyFeedback.value = { kind: 'idle', message: '' }
}

function cancelApiKeyEdit(): void {
  apiKeyEditing.value = false
  apiKey.value = ''
  keyFeedback.value = { kind: 'idle', message: '' }
}

async function refresh(): Promise<void> {
  busy.value = true
  try {
    const result = await api.refreshData()
    showToast(result.message, !result.ok)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '数据刷新失败', true)
  } finally {
    busy.value = false
  }
}

function navigate(nextPage: Page): void {
  if (page.value === nextPage) return
  page.value = nextPage
}

function replaceLobbyBackground(frame: import('../../shared/contracts').LobbyBackgroundFrame | null): void {
  if (lobbyBackgroundUrl.value) URL.revokeObjectURL(lobbyBackgroundUrl.value)
  lobbyBackgroundUrl.value = ''
  if (!frame || frame.mimeType !== 'image/jpeg' || frame.bytes.byteLength > 500_000) return
  const bytes = new Uint8Array(frame.bytes)
  const blob = new Blob([bytes.slice().buffer], { type: frame.mimeType })
  lobbyBackgroundUrl.value = URL.createObjectURL(blob)
}

function syncLobbyBackgroundPresentation(): void {
  void window.hexbridgeLobbyBackground?.setPresentation({
    livePageVisible: page.value === 'live' && pageVisible.value,
    reducedMotion: reducedMotion.value,
  }).catch(() => undefined)
}

async function applyUpdate(): Promise<void> {
  if (updateBusy.value) return
  updateBusy.value = true
  try {
    const result = await api.applyUpdate()
    if (!result.ok) showToast(result.message, true)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '更新失败，请稍后重试', true)
  } finally {
    updateBusy.value = false
  }
}

async function openDeveloperPage(): Promise<void> {
  try {
    const result = await api.openDeveloperPage()
    showToast(result.message, !result.ok)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '无法打开 API Key 申请页面', true)
  }
}

async function dismissReleaseHighlights(): Promise<void> {
  try {
    await api.dismissReleaseHighlights()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '暂时无法关闭版本说明', true)
  }
}

async function triggerOcr(): Promise<void> {
  try {
    const result = await api.triggerOcr()
    showToast(result.message, !result.ok)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'OCR 识别失败', true)
  }
}

async function retryOpponentScout(): Promise<void> {
  try {
    const result = await api.retryOpponentScout()
    showToast(result.message, !result.ok)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '队伍近期状态查询失败', true)
  }
}

async function openScoutDetails(player: OpponentFormSummary, event?: Event): Promise<void> {
  if (!player.opaqueKey || state.value.opponentScout.matchGeneration == null || scoutDetailsBusy.value) return
  scoutDetailsTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const sequence = ++scoutDetailsSequence
  scoutDetailsBusy.value = true
  scoutDetailsMessage.value = '正在读取本机缓存明细…'
  await nextTick()
  scoutDetailsCloseButton.value?.focus()
  try {
    const result = await api.getScoutPlayerDetails(
      player.opaqueKey,
      state.value.opponentScout.matchGeneration,
    )
    if (sequence !== scoutDetailsSequence) return
    if (!result.ok || !result.details) {
      showToast(result.message, true)
      closeScoutDetails()
      return
    }
    scoutDetails.value = result.details
    scoutDetailsMessage.value = result.message
  } catch (error) {
    if (sequence !== scoutDetailsSequence) return
    const message = error instanceof Error ? error.message : '近期明细已过期'
    showToast(message, true)
    closeScoutDetails()
  } finally {
    if (sequence === scoutDetailsSequence) scoutDetailsBusy.value = false
  }
}

function closeScoutDetails(): void {
  const trigger = scoutDetailsTrigger
  scoutDetailsTrigger = null
  scoutDetailsSequence += 1
  scoutDetails.value = null
  scoutDetailsBusy.value = false
  scoutDetailsMessage.value = ''
  void nextTick(() => {
    if (trigger?.isConnected) trigger.focus()
  })
}

function handleScoutDialogKey(event: KeyboardEvent): void {
  const dialogOpen = scoutDetails.value != null || scoutDetailsBusy.value
  if (!dialogOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeScoutDetails()
    return
  }
  if (event.key !== 'Tab') return
  const dialog = scoutDetailsDialog.value
  if (!dialog) return
  const focusable = [...dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )]
  if (!focusable.length) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === dialog || active === first || !dialog.contains(active))) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && (active === dialog || active === last || !dialog.contains(active))) {
    event.preventDefault()
    first?.focus()
  }
}

async function clearDiagnostics(): Promise<void> {
  try {
    const result = await api.clearDiagnosticScreenshots()
    showToast(result.message, !result.ok)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '清除诊断截图失败', true)
  }
}

async function startCalibration(): Promise<void> {
  if (calibrationBusy.value) return
  calibrationBusy.value = true
  showToast('正在隐藏主窗口并捕获目标显示器…', false, 8_000)
  try {
    await api.startCalibration()
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : ''
    showToast(
      /get sources|captur|屏幕捕获|目标显示器/i.test(rawMessage)
        ? '无法截取目标显示器，请允许 HexBridge 使用屏幕录制后重试'
        : '无法启动校准，主窗口已恢复，请稍后重试',
      true,
    )
  } finally {
    calibrationBusy.value = false
  }
}

async function recordHotkey(event: KeyboardEvent): Promise<void> {
  if (!recordingHotkey.value || event.repeat) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') {
    recordingHotkey.value = false
    hotkeyFeedback.value = '已取消录制'
    return
  }
  const key = /^F(?:[1-9]|1[0-2])$/i.test(event.key)
    ? event.key.toUpperCase()
    : event.code.startsWith('Key')
      ? event.code.slice(3)
      : event.code.startsWith('Digit')
        ? event.code.slice(5)
        : ''
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
  const candidate = [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key]
    .filter(Boolean)
    .join('+')
  recordingHotkey.value = false
  const result = await api.setOcrHotkey(candidate)
  hotkeyFeedback.value = result.message
  showToast(result.message, !result.ok)
}

const visibilityChanged = (): void => { pageVisible.value = !document.hidden }
const focusChanged = (): void => { windowFocused.value = document.hasFocus() }
const reducedMotionChanged = (event: MediaQueryListEvent): void => { reducedMotion.value = event.matches }
onMounted(() => {
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('focus', focusChanged)
  window.addEventListener('blur', focusChanged)
  window.addEventListener('keydown', recordHotkey, true)
  window.addEventListener('keydown', handleScoutDialogKey)
  reducedMotionQuery.addEventListener('change', reducedMotionChanged)
  unsubscribeLobbyBackground = window.hexbridgeLobbyBackground?.onChanged(replaceLobbyBackground) ?? null
  syncLobbyBackgroundPresentation()
})
onBeforeUnmount(() => {
  dismissToast()
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('focus', focusChanged)
  window.removeEventListener('blur', focusChanged)
  window.removeEventListener('keydown', recordHotkey, true)
  window.removeEventListener('keydown', handleScoutDialogKey)
  reducedMotionQuery.removeEventListener('change', reducedMotionChanged)
  unsubscribeLobbyBackground?.()
  unsubscribeLobbyBackground = null
  void window.hexbridgeLobbyBackground?.setPresentation({ livePageVisible: false, reducedMotion: true }).catch(() => undefined)
  replaceLobbyBackground(null)
})

watch([page, pageVisible, reducedMotion], syncLobbyBackgroundPresentation)

watch(
  () => [
    state.value.settings.recommendationDataSource,
    state.value.recommendation.snapshotId,
    state.value.recommendation.dataVersion,
    state.value.recommendation.statisticsDate,
  ],
  () => {
    championRecommendationSequence += 1
    championRecommendation.value = null
    championRecommendationBusy.value = false
    championRecommendationRarity.value = 'all'
    championRecommendationMessage.value = '推荐来源已变化，请重新选择英雄'
  },
)

watch(
  () => [
    state.value.opponentScout.matchGeneration,
    state.value.opponentScout.sampledAt,
    state.value.snapshot.matchStage,
    state.value.settings.opponentScouting,
    state.value.lcu.connected,
    state.value.lcu.lastConnectedAt,
  ],
  () => closeScoutDetails(),
)

const championAlt = (champion: ChampionSummary | null) => champion ? `${champion.name}头像` : ''
</script>

<template>
  <div class="app-shell" :class="{ 'animations-paused': !pageVisible || !windowFocused }" :data-performance="state.diagnostics.activeVisualMode">
    <header class="titlebar">
      <div class="title-brand"><LogoMark /><span>HexBridge</span></div>
      <div class="drag-region" />
      <button
        v-if="updateActionVisible"
        class="title-update-action"
        :disabled="updateBusy || updateBlocked || ['downloading', 'installing'].includes(state.update.status)"
        :aria-busy="updateBusy || ['downloading', 'installing'].includes(state.update.status)"
        @click="applyUpdate"
      >
        <span aria-hidden="true">↓</span>{{ updateActionLabel }}
      </button>
      <div class="title-actions">
        <button aria-label="最小化" @click="api.windowAction('minimize')">—</button>
        <button aria-label="最大化" @click="api.windowAction('maximize')">□</button>
        <button aria-label="关闭" @click="api.windowAction('close')">×</button>
      </div>
    </header>

    <aside class="sidebar">
      <div class="side-logo"><LogoMark /></div>
      <nav>
        <button :class="{ active: page === 'live' }" @click="navigate('live')"><span>◈</span>实时助手</button>
        <button :class="{ active: page === 'ranking' }" @click="navigate('ranking')"><span>⌁</span>英雄榜</button>
        <button :class="{ active: page === 'settings' }" @click="navigate('settings')"><span>◇</span>设置</button>
        <button :class="{ active: page === 'diagnostics' }" @click="navigate('diagnostics')"><span>···</span>诊断</button>
      </nav>
    </aside>

    <main class="stage">
      <div v-if="bridgeError" class="bridge-error" role="alert">
        安全桥接初始化失败，实时数据与操作已停用。请重新安装 HexBridge 或检查本地启动日志。
      </div>
      <Transition name="page-flow" mode="out-in">
        <section v-if="page === 'live'" :key="'live'" class="live-page">
          <div
            v-if="lobbyBackgroundUrl && !current"
            class="lobby-background"
            :style="{ backgroundImage: `url(${lobbyBackgroundUrl})` }"
            aria-hidden="true"
          />
          <Transition name="hero-backdrop-fade">
            <div :key="current?.id ?? 'empty'" class="hero-backdrop" :style="heroStyle" />
          </Transition>
          <div class="hero-scrim" />
          <div class="live-atmosphere" aria-hidden="true"><i class="aura aura-one" /><i class="aura aura-two" /><span /></div>
          <div class="page-content live-content">
            <div class="eyebrow-row">
              <span class="eyebrow"><i />{{ statusLabel }}</span>
              <span class="data-version" :class="{ stale: state.recommendation.stale }">
                {{ recommendationSourceName }} · {{ state.recommendation.statisticsDate || state.recommendation.dataVersion || '未就绪' }}<template v-if="state.recommendation.stale"> · 缓存</template>
              </span>
            </div>

            <Transition name="hero-presence" mode="out-in">
              <div v-if="current" :key="current.id" class="hero-presence">
                <div class="current-hero">
                  <img :src="current.iconUrl" :alt="championAlt(current)" />
                  <div class="hero-name"><small>当前英雄</small><h1>{{ current.name }}</h1><p>{{ current.title || '海克斯大乱斗' }}</p></div>
                  <div class="hero-metrics">
                    <div><small>{{ championStrengthLabel() }}</small><b class="tier-value">{{ championStrengthValue(current.tier) }}</b></div>
                    <div><small>{{ championWinRateLabel() }}</small><b>{{ winRate(current.winRate) }}</b></div>
                  </div>
                  <span v-if="current.isBest" class="best-badge">首选</span>
                </div>
                <section class="current-recommendation" aria-live="polite">
                  <header>
                    <div><small>当前英雄 · {{ recommendationSourceName }}</small><h2>推荐海克斯</h2></div>
                    <span>{{ state.currentRecommendation?.statisticsDate || state.recommendation.statisticsDate || state.recommendation.dataVersion || '数据未就绪' }}<template v-if="state.currentRecommendation?.stale || state.recommendation.stale"> · 旧缓存</template></span>
                  </header>
                  <div v-if="state.currentRecommendation?.cards.length" class="current-recommendation-grid">
                    <article v-for="card in state.currentRecommendation.cards.slice(0, 3)" :key="card.augmentId">
                      <img v-if="card.iconUrl" :src="card.iconUrl" :alt="card.name" />
                      <span v-else class="augment-icon" aria-hidden="true">◇</span>
                      <div><small>{{ card.rarityName || '海克斯强化' }}</small><b>{{ card.name }}</b><p>{{ card.reason }}</p></div>
                      <dl v-if="state.currentRecommendation.source === 'tencent101'">
                        <div><dt>全局选取率</dt><dd>{{ augmentPickRate(card.globalPickRate) }}</dd></div>
                        <div><dt>全局胜率</dt><dd>{{ augmentPickRate(card.globalWinRate) }}</dd></div>
                      </dl>
                      <dl v-else><div><dt>该英雄选取率</dt><dd>{{ augmentPickRate(card.championPickRate) }}</dd></div></dl>
                    </article>
                  </div>
                  <p v-else>{{ state.recommendation.status === 'loading' ? '当前推荐来源正在加载。' : (state.recommendation.lastError || '当前来源暂无该英雄的推荐海克斯。') }}</p>
                  <footer v-if="state.currentRecommendation?.source === 'tencent101'">英雄专属顺序来自 lowest_rank_runes；选取率与胜率是腾讯全局统计，不是该英雄专属统计。</footer>
                </section>
                <section class="build-recommendation" aria-live="polite">
                  <header>
                    <div><small>当前英雄</small><h2>大乱斗出装参考</h2></div>
                    <span v-if="state.currentBuild">{{ state.currentBuild.label }} · iesdev · {{ state.currentBuild.patch || state.api.gamePatch || '补丁未标注' }}</span>
                  </header>
                  <div v-if="state.currentBuild" class="build-groups">
                    <div><small>出门装</small><div v-if="state.currentBuild.startingItems.length" class="build-items"><span v-for="item in state.currentBuild.startingItems" :key="`start-${item.id}`" :title="item.name"><img :src="item.iconUrl" :alt="item.name" /><b>{{ item.name }}</b></span></div><p v-else class="build-empty">暂无数据</p></div>
                    <div><small>核心装</small><div v-if="state.currentBuild.coreItems.length" class="build-items"><span v-for="item in state.currentBuild.coreItems" :key="`core-${item.id}`" :title="item.name"><img :src="item.iconUrl" :alt="item.name" /><b>{{ item.name }}</b></span></div><p v-else class="build-empty">暂无数据</p></div>
                    <div><small>情境装备</small><div v-if="state.currentBuild.situationalItems.length" class="build-items compact"><span v-for="item in state.currentBuild.situationalItems" :key="`situational-${item.id}`" :title="item.name"><img :src="item.iconUrl" :alt="item.name" /><b>{{ item.name }}</b></span></div><p v-else class="build-empty">暂无数据</p></div>
                  </div>
                  <p v-else>{{ !state.api.configured ? '出装仍需单独配置 data.dtodo API Key；不影响当前推荐来源的英雄与海克斯数据。' : '暂无该英雄的出装数据；英雄详情就绪后会自动显示。' }}</p>
                </section>
              </div>
              <div v-else :key="'empty'" class="empty-hero">
                <div class="connection-stage" aria-hidden="true">
                  <div class="connection-ring ring-one" />
                  <div class="connection-ring ring-two" />
                  <div class="connection-path"><i /><i /><i /></div>
                  <LogoMark />
                </div>
                <div class="empty-copy">
                  <small>{{ recognizedChampionMissingData ? '已识别英雄' : state.lcu.connected ? '客户端已连接' : '正在检测客户端' }}</small>
                  <h2>{{ recognizedChampionMissingData ? `已识别英雄 #${recognizedChampionId}` : state.lcu.connected ? '等待选择英雄' : '英雄联盟客户端未启动或未发现' }}</h2>
                  <p v-if="recognizedChampionMissingData || state.lcu.connected">{{ recognizedChampionMissingData ? 'LCU 读取正常，但英雄数据目录尚未就绪或缺少该英雄；请刷新数据。' : '进入海克斯大乱斗选人阶段后会自动显示英雄。' }}</p>
                </div>
              </div>
            </Transition>

            <Transition name="assistant-reveal">
              <section v-if="opponentAssistantVisible" class="opponent-scout" aria-live="polite">
                <header>
                  <div><small>默认关闭 · 本地实验</small><h2>队友与对手近期状态</h2><p>只在客户端明确公开身份时，汇总最近 20 场可用 LoL 对局；至少 12 场才给出分档，评分不代表官方段位。</p></div>
                  <button class="ghost" :disabled="state.opponentScout.status === 'loading'" @click="retryOpponentScout">
                    {{ state.opponentScout.status === 'loading' ? '读取中…' : '重新读取' }}
                  </button>
                </header>
                <p :class="['opponent-scout-message', `state-${state.opponentScout.status}`]">{{ state.opponentScout.message }}</p>
                <div v-if="state.opponentScout.allies.length || state.opponentScout.opponents.length" class="scout-groups">
                  <section
                    v-for="group in [
                      { key: 'ally', label: '队友', expected: 4, players: state.opponentScout.allies },
                      { key: 'opponent', label: '对手', expected: 5, players: state.opponentScout.opponents },
                    ]"
                    :key="group.key"
                    class="scout-group"
                  >
                    <h3>{{ group.label }} <small>{{ group.players.length }}/{{ group.expected }}</small></h3>
                    <div v-if="group.players.length" class="opponent-grid">
                      <button
                        v-for="player in group.players"
                        :key="`${group.key}-${player.slot}`"
                        type="button"
                        :disabled="!player.opaqueKey"
                        :class="[`tier-${player.tier || 'unknown'}`, { unavailable: player.status === 'unavailable' }]"
                        :aria-label="`${group.label} ${player.slot} ${opponentChampion(player)?.name || '英雄未知'}，${player.opaqueKey ? '查看近期明细' : '暂无明细'}`"
                        @click="openScoutDetails(player, $event)"
                      >
                        <div class="opponent-identity">
                          <img v-if="opponentChampion(player)?.iconUrl" :src="opponentChampion(player)?.iconUrl" :alt="opponentChampion(player)?.name || ''" />
                          <span v-else aria-hidden="true">◇</span>
                          <div><small>{{ group.label }} {{ player.slot }}</small><b>{{ opponentChampion(player)?.name || (player.championId ? `英雄 #${player.championId}` : '身份已公开') }}</b></div>
                        </div>
                        <div v-if="player.status === 'ready'" class="opponent-rating">
                          <span>{{ player.tier || '样本不足' }}</span><b>{{ player.rating ?? '—' }}</b><small>/ 100</small>
                        </div>
                        <div v-else class="opponent-rating"><span>暂无数据</span><b>—</b></div>
                        <dl>
                          <div><dt>胜率</dt><dd>{{ winRate(player.winRate) }}</dd></div>
                          <div><dt>KDA</dt><dd>{{ player.kda == null ? '—' : player.kda.toFixed(2) }}</dd></div>
                          <div><dt>连续战绩</dt><dd>{{ opponentStreak(player.streak) }}</dd></div>
                          <div><dt>样本</dt><dd>{{ player.sampleSize }} 场</dd></div>
                        </dl>
                        <small class="scout-detail-hint">{{ player.opaqueKey ? '点击查看近期明细' : '暂无可用明细' }}</small>
                      </button>
                    </div>
                    <p v-else class="scout-group-empty">该分组身份未完整公开，本轮不查询。</p>
                  </section>
                </div>
                <p class="opponent-privacy">不上传、不落盘、不向界面暴露 PUUID 或原始战绩；身份隐藏时保持不可用。</p>
              </section>
            </Transition>

            <Transition name="assistant-reveal">
              <section v-if="augmentAssistantVisible" class="augment-assistant" aria-live="polite">
                <header>
                  <div><small>实时推荐 · {{ recommendationSourceName }}</small><h2>海克斯推荐</h2><p v-if="state.recommendation.source === 'tencent101'">腾讯英雄推荐顺序优先；选取率与胜率均为全局统计，不是该英雄专属统计。{{ state.recommendation.statisticsDate || '统计日期未就绪' }}<template v-if="state.recommendation.stale"> · 旧缓存</template></p><p v-else>优先采用上游提供的英雄专属推荐顺序；该英雄选取率仅作参考。{{ state.api.gamePatch || '补丁未标注' }} · {{ state.recommendation.dataVersion || '数据未就绪' }}<template v-if="state.recommendation.stale"> · 已过期</template></p></div>
                  <button class="ghost" :disabled="state.diagnostics.ocrBusy" @click="triggerOcr">
                    {{ state.diagnostics.ocrBusy ? '识别中…' : (state.settings.hotkey ? `${state.settings.hotkey} 立即识别` : '手动立即识别') }}
                  </button>
                </header>
                <p :class="['manual-ocr-state', state.diagnostics.manualOcrStatus]">{{ state.diagnostics.manualOcrMessage }}</p>
                <TransitionGroup v-if="state.overlay.slots.length" name="augment-card" tag="div" class="augment-live-grid" appear>
                  <article v-for="slot in state.overlay.slots" :key="slot.slot" :class="[`place-${slot.position ?? 0}`, { tied: slot.tied, unknown: !slot.augmentId }]">
                    <span class="place">{{ slotLabel(slot.position, slot.tied) }}</span>
                    <img v-if="slot.iconUrl" :src="slot.iconUrl" alt="" />
                    <span v-else class="augment-icon" aria-hidden="true">◇</span>
                    <div class="augment-card-copy"><small>{{ slot.rarityName || '海克斯强化' }}</small><b>{{ slot.name || '未识别' }}</b><p>{{ slot.augmentId ? augmentReason(slot.reason) : '该位置尚未可靠识别' }}</p></div>
                    <div class="augment-pick-rate" :title="slot.recommendationSource === 'tencent101' ? `腾讯英雄联盟数据站 · 全局统计 · ${slot.statisticsDate || '日期未标注'}` : `data.dtodo 单英雄详情 · ${augmentStatsScope(slot)} · ${state.api.gamePatch || state.api.dataVersion || '版本未标注'}`"><small>{{ slotPickRateLabel(slot) }}<template v-if="slot.recommendationSource === 'dtodo'"> · {{ augmentStatsScope(slot) }}</template></small><b>{{ augmentPickRate(slotPickRate(slot)) }}</b><em v-if="slot.recommendationSource === 'tencent101'">全局胜率 {{ augmentPickRate(slot.globalWinRate) }}</em></div>
                  </article>
                </TransitionGroup>
                <div v-else class="augment-waiting">
                  <span>◇</span><div><b>等待三张海克斯</b><p>停在三卡界面后按 {{ state.settings.hotkey || '主窗口按钮' }}，识别完成后将在此排序。</p></div>
                </div>
              </section>
            </Transition>

            <template v-if="selecting">
              <div class="bench-head"><div><small>可用英雄</small><h2>备战席</h2></div><span>{{ bench.length }} 位可选英雄</span></div>
              <TransitionGroup name="reorder" tag="div" class="bench-grid">
                <article v-for="item in bench" :key="item.id" :class="['bench-card', { best: item.isBest }]">
                  <img :src="item.iconUrl" :alt="championAlt(item)" />
                  <div class="bench-info"><b>{{ item.name }}</b><small>{{ item.title || '可选英雄' }}</small></div>
                  <div class="bench-stats"><b>{{ championStrengthValue(item.tier) }}</b><span>{{ winRate(item.winRate) }}</span></div>
                  <div v-if="item.isBest" class="best-strip">首选 · 较当前 {{ item.winRateDelta != null && item.winRateDelta >= 0 ? '+' : '' }}{{ item.winRateDelta == null ? '—' : (item.winRateDelta * 100).toFixed(1) + '%' }}</div>
                </article>
              </TransitionGroup>
              <p class="choice-note">推荐仅作数据参考。换英雄与选择均由你在游戏中完成。</p>
            </template>
          </div>
        </section>

        <section v-else-if="page === 'ranking'" :key="'ranking'" class="page-content standard-page">
          <div class="page-heading"><div><small>{{ recommendationSourceName }} · {{ state.recommendation.statisticsDate || state.recommendation.dataVersion || '数据未就绪' }}</small><h1>英雄榜</h1><p>浏览当前推荐来源的英雄数据；英雄详情不会改变实时助手当前英雄。</p></div><button class="ghost" :disabled="busy" @click="refresh">刷新数据</button></div>
          <div class="toolbar"><label class="search"><span>⌕</span><input v-model="search" placeholder="搜索英雄名、称号或别名（如 VN）" /></label><div class="segmented"><button v-for="sort in (['tier','winRate'] as const)" :key="sort" :class="{ active: rankingSort === sort }" @click="rankingSort = sort">{{ sort === 'tier' ? championStrengthLabel() : '胜率' }}</button></div></div>
          <aside v-if="selectedChampionId" class="champion-recommendation-detail" aria-live="polite">
            <header><div><small>{{ recommendationSourceName }}</small><h2>{{ championById(selectedChampionId)?.name || `英雄 #${selectedChampionId}` }} · 推荐海克斯</h2><p>{{ championRecommendation?.statisticsDate || state.recommendation.statisticsDate || '统计日期未就绪' }}<template v-if="championRecommendation?.stale"> · 旧缓存</template></p></div><div class="champion-detail-controls"><div class="segmented"><button v-for="rarity in (['all','白银','黄金','棱彩'] as const)" :key="rarity" :class="{ active: championRecommendationRarity === rarity }" @click="championRecommendationRarity = rarity">{{ rarity === 'all' ? '全部品质' : rarity }}</button></div><div class="segmented"><button v-for="sort in (['recommendation','globalPick','globalWin'] as const)" :key="sort" :disabled="state.recommendation.source !== 'tencent101' && sort !== 'recommendation'" :class="{ active: championRecommendationSort === sort }" @click="championRecommendationSort = sort">{{ sort === 'recommendation' ? '推荐序' : sort === 'globalPick' ? '全局选取率' : '全局胜率' }}</button></div></div></header>
            <p v-if="championRecommendationBusy">正在读取当前来源的英雄推荐…</p>
            <div v-else-if="sortedChampionRecommendationCards.length" class="champion-augment-cards">
              <article v-for="card in sortedChampionRecommendationCards" :key="card.augmentId">
                <img :src="card.iconUrl" :alt="card.name" /><div><small>{{ card.rarityName || '海克斯强化' }} · {{ card.reason }}</small><b>{{ card.name }}</b><p>{{ card.description || '暂无描述' }}</p></div><dl v-if="championRecommendation?.source === 'tencent101'"><div><dt>全局选取率</dt><dd>{{ augmentPickRate(card.globalPickRate) }}</dd></div><div><dt>全局胜率</dt><dd>{{ augmentPickRate(card.globalWinRate) }}</dd></div><div><dt>全局选取排名</dt><dd>{{ globalRank(card.globalPickRank, card.globalPickRankChange) }}</dd></div><div><dt>全局胜率排名</dt><dd>{{ globalRank(card.globalWinRank, card.globalWinRankChange) }}</dd></div></dl><dl v-else><div><dt>该英雄选取率</dt><dd>{{ augmentPickRate(card.championPickRate) }}</dd></div></dl>
              </article>
            </div>
            <p v-else>{{ championRecommendation?.cards.length ? '当前品质筛选下暂无推荐海克斯。' : championRecommendationMessage }}</p>
          </aside>
          <div class="ranking-list">
            <article v-for="(item, index) in ranking" :key="item.id" :class="['tier-row', `tier-${item.tier || 0}`, { selected: selectedChampionId === item.id }]" :style="{ '--tier-level': String(item.tier || 0) }" role="button" tabindex="0" :aria-label="`查看 ${item.name} 的推荐海克斯`" @click="selectRankingChampion(item.id)" @keydown.enter.prevent="selectRankingChampion(item.id)" @keydown.space.prevent="selectRankingChampion(item.id)">
              <span class="rank-index">{{ String(index + 1).padStart(2, '0') }}</span><img :src="item.iconUrl" :alt="championAlt(item)" /><div class="rank-name"><b>{{ item.name }}</b><small>{{ item.title || '海克斯大乱斗英雄' }}</small></div><div class="rank-tier"><small>{{ championStrengthLabel() }}</small><b>{{ championStrengthValue(item.tier) }}</b></div><div class="rank-wr"><small>{{ championWinRateLabel() }}</small><b>{{ winRate(item.winRate) }}</b></div>
            </article>
          </div>
        </section>

        <section v-else-if="page === 'settings'" :key="'settings'" class="page-content standard-page settings-page">
          <div class="page-heading"><div><small>本地偏好</small><h1>设置</h1></div></div>
          <div class="settings-grid">
            <article class="settings-card wide recommendation-source-card">
              <h3>英雄与海克斯推荐来源</h3>
              <p>来源切换会立即撤销上一来源的英雄、排名与三卡结果；不会改变独立的 data.dtodo 出装模块。</p>
              <div class="recommendation-source-options" role="radiogroup" aria-label="英雄与海克斯推荐来源">
                <label :class="{ selected: state.settings.recommendationDataSource === 'dtodo' }"><input type="radio" name="recommendation-source" value="dtodo" :checked="state.settings.recommendationDataSource === 'dtodo'" @change="updateSettings({ recommendationDataSource: 'dtodo' })" /><span><b>data.dtodo</b><small>默认来源，需要个人 API Key；提供英雄专属排名、选取率与独立出装数据。</small></span></label>
                <label :class="{ selected: state.settings.recommendationDataSource === 'tencent101' }"><input type="radio" name="recommendation-source" value="tencent101" :checked="state.settings.recommendationDataSource === 'tencent101'" @change="updateSettings({ recommendationDataSource: 'tencent101' })" /><span><b>腾讯英雄联盟数据站</b><small>无需 dtodo Key；使用腾讯 101 官网当前未文档化 Web 统计接口，可能变化，并会向腾讯服务发起低频请求。全局指标不会冒充英雄专属指标。</small></span></label>
              </div>
              <p class="recommendation-source-state">当前：{{ recommendationSourceName }} · {{ recommendationStatusText[state.recommendation.status] }} · {{ state.recommendation.statisticsDate || state.recommendation.dataVersion || '尚未同步' }}<template v-if="state.recommendation.lastError"> · {{ state.recommendation.lastError }}</template></p>
            </article>
            <article :class="['settings-card', 'wide', 'api-service-card', `state-${apiVisualStatus}`]">
              <header class="api-service-header">
                <div class="api-service-identity">
                  <span class="api-service-mark" aria-hidden="true"><i /></span>
                  <div><small>DATA API</small><h3>数据服务</h3></div>
                </div>
                <div id="api-service-status" :class="['api-health-badge', apiVisualStatus]" role="status" aria-live="polite">
                  <span class="api-health-dot" aria-hidden="true" />
                  <div><small>API KEY</small><b>{{ state.api.configured ? apiStatusText[state.api.status] : '等待配置' }}</b></div>
                </div>
              </header>
              <p class="api-status-detail">{{ apiStatusDetail }}<template v-if="state.settings.recommendationDataSource === 'tencent101'">；该 Key 仍仅用于出装等 data.dtodo 独立数据。</template></p>
              <div v-if="apiKeyFormVisible" class="api-key-editor">
                <label for="api-key-input">API Key</label>
                <div class="key-row">
                  <input id="api-key-input" v-model="apiKey" type="password" autocomplete="off" placeholder="hx_live_••••••••" aria-describedby="api-service-status api-key-feedback" @keyup.enter="validateKey" />
                  <button class="primary" :disabled="keyBusy || !apiKey.trim()" :aria-busy="keyBusy" @click="validateKey">{{ keyBusy ? '正在验证…' : '验证并保存' }}</button>
                  <button v-if="state.api.configured && state.api.status !== 'unauthorized'" class="ghost" :disabled="keyBusy" @click="cancelApiKeyEdit">取消</button>
                </div>
                <p v-if="keyFeedback.message" id="api-key-feedback" :class="['inline-feedback', keyFeedback.kind]" aria-live="polite">{{ keyFeedback.message }}</p>
                <span v-else id="api-key-feedback" class="api-key-hint">密钥仅由主进程读取，并使用 Windows safeStorage 加密保存。</span>
              </div>
              <div v-else class="api-service-actions">
                <button class="primary" @click="editApiKey">更换 Key</button>
                <button v-if="['stale','limited','offline','error'].includes(state.api.status)" class="ghost" :disabled="busy" @click="refresh">{{ busy ? '刷新中…' : '刷新数据' }}</button>
                <button class="ghost" @click="clearKey">清除</button>
              </div>
              <button class="api-key-apply" @click="openDeveloperPage">申请 API Key <span aria-hidden="true">↗</span></button>
            </article>
            <article class="settings-card"><h3>目标显示器</h3><p>三卡位置不准时再校准。</p><select :value="state.settings.displayId" @change="updateSettings({ displayId: ($event.target as HTMLSelectElement).value })"><option value="">自动选择主显示器</option><option v-for="display in state.displays" :key="display.id" :value="display.id">{{ display.label }} · {{ display.width }}×{{ display.height }}</option></select><button class="ghost full" :disabled="calibrationBusy" @click="startCalibration">{{ calibrationBusy ? '正在准备校准…' : '框选三张完整海克斯卡片' }}</button><small class="calibration-entry-hint">依次框住左、中、右整张卡片。</small></article>
            <article class="settings-card"><h3>识别快捷键</h3><div class="hotkey-row"><kbd :class="{ unavailable: !state.settings.hotkey }">{{ state.settings.hotkey || '未注册' }}</kbd><button class="ghost" :class="{ recording: recordingHotkey }" @click="recordingHotkey = !recordingHotkey">{{ recordingHotkey ? '请按快捷键…' : '录制新快捷键' }}</button></div><small :class="{ 'hotkey-error': !state.settings.hotkey }">{{ hotkeyFeedback || (state.settings.hotkey ? 'Esc 取消录制。' : '快捷键不可用，请重新录制。') }}</small></article>
            <article class="settings-card wide switches"><label><div><b>自动 OCR（实验）</b><small>只在海克斯对局且游戏或主窗口可见时低频识别</small></div><input type="checkbox" :checked="state.settings.autoOcr" @change="updateSettings({ autoOcr: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>等待页客户端背景（实验）</b><small>默认关闭。仅大厅、匹配与接受对局阶段低频截取已绑定客户端窗口；画面只在内存中模糊处理。</small></div><input type="checkbox" :checked="state.settings.lobbyBackground" @change="updateSettings({ lobbyBackground: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>选人浮窗</b><small>选人期间跟随英雄联盟客户端，进入对局后隐藏</small></div><input type="checkbox" :checked="state.settings.showChampionPanel" @change="updateSettings({ showChampionPanel: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>三卡上方推荐</b><small>识别成功后显示点击穿透小窗，选卡或切屏时自动隐藏</small></div><input type="checkbox" :checked="state.settings.showInGameRecommendations" @change="updateSettings({ showInGameRecommendations: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>队友与对手近期状态（本地实验）</b><small>默认关闭。仅身份明确公开时读取本机 LCU；近期样本不限定队列，可能违反 Riot 分发政策，不上传、不持久化。</small></div><input type="checkbox" :checked="state.settings.opponentScouting" @change="updateSettings({ opponentScouting: ($event.target as HTMLInputElement).checked })" /></label></article>
          </div>
        </section>

        <section v-else :key="'diagnostics'" class="page-content standard-page diagnostics-page">
          <div class="page-heading"><div><small>系统状态</small><h1>诊断</h1><p>日志会自动过滤 LCU token、API Key 与账号标识。</p></div><div class="page-actions"><button class="ghost" @click="clearDiagnostics">清除截图</button><button class="ghost" @click="triggerOcr">{{ state.settings.hotkey ? `${state.settings.hotkey} 立即识别` : '手动立即识别' }}</button></div></div>
          <div class="health-grid"><article><span :class="['health-icon', state.lcu.connected || retainedMatch ? 'ok' : 'warn']">●</span><div><small>LCU</small><b>{{ state.lcu.connected ? '只读连接正常' : retainedMatch ? '游戏客户端接管中' : '等待客户端' }}</b><p>{{ retainedMatch ? 'LCU 连接已交接，本局英雄与 OCR 上下文仍保留' : (state.lcu.lastError || `发现来源：${state.lcu.source || '—'}`) }}</p></div></article><article><span :class="['health-icon', ['ready','stale'].includes(state.recommendation.status) ? 'ok' : 'warn']">●</span><div><small>推荐来源</small><b>{{ recommendationSourceName }} · {{ recommendationStatusText[state.recommendation.status] }}</b><p>{{ state.recommendation.lastError || `统计日期 ${state.recommendation.statisticsDate || state.recommendation.dataVersion || '—'}` }}</p></div></article><article><span :class="['health-icon', state.api.status === 'ready' ? 'ok' : 'warn']">●</span><div><small>DTDODO / 出装</small><b>{{ apiStatusText[state.api.status] }}</b><p>{{ state.api.lastError || `数据版本 ${state.api.dataVersion || '—'}` }}</p></div></article><article><span :class="['health-icon', state.diagnostics.ocrReady ? 'ok' : 'warn']">●</span><div><small>OCR</small><b>{{ state.diagnostics.ocrReady ? '模型已就绪' : '模型未就绪' }}</b><p>{{ state.diagnostics.manualOcrStatus === 'idle' ? (state.diagnostics.ocrLastError || `上次 ${state.diagnostics.ocrLastDurationMs ?? '—'}ms`) : `${state.diagnostics.manualOcrMessage} · ${manualOcrCodeText[state.diagnostics.manualOcrCode]} · ${manualOcrTime(state.diagnostics.manualOcrTriggeredAt)}` }}</p></div></article></div>
          <div class="log-panel"><header><b>本地日志</b><span>{{ state.diagnostics.logLines.length }} 行</span></header><pre>{{ state.diagnostics.logLines.join('\n') || '暂无日志' }}</pre></div>
          <p class="choice-note">诊断截图仅在手动识别时保存，最多保留 60 张裁切图。</p>
          <div v-if="isPreview" class="preview-banner">浏览器视觉预览模式 · Electron 中将显示实时数据</div>
        </section>
      </Transition>
    </main>
    <Transition name="release-highlights">
      <div v-if="scoutDetails || scoutDetailsBusy" class="scout-details-backdrop" role="presentation" @click.self="closeScoutDetails">
        <section ref="scoutDetailsDialog" class="scout-details-dialog" role="dialog" aria-modal="true" aria-labelledby="scout-details-title" tabindex="-1">
          <header>
            <div>
              <small>{{ scoutDetails?.relation === 'ally' ? '队友' : '对手' }} {{ scoutDetails?.slot || '' }} · 本机缓存</small>
              <h2 id="scout-details-title">{{ championById(scoutDetails?.championId ?? null)?.name || '近期对局明细' }}</h2>
            </div>
            <button ref="scoutDetailsCloseButton" class="ghost" type="button" aria-label="关闭近期明细" @click="closeScoutDetails">关闭</button>
          </header>
          <p v-if="scoutDetailsBusy">{{ scoutDetailsMessage }}</p>
          <div v-else-if="scoutDetails?.matches.length" class="scout-match-list">
            <article v-for="(match, index) in scoutDetails.matches" :key="index" :class="{ win: match.win, loss: !match.win }">
              <img v-if="championById(match.championId)?.iconUrl" :src="championById(match.championId)?.iconUrl" :alt="championById(match.championId)?.name || ''" />
              <span v-else class="scout-match-icon" aria-hidden="true">◇</span>
              <div><b>{{ match.win ? '胜利' : '失败' }}</b><small>{{ championById(match.championId)?.name || '英雄未知' }}</small></div>
              <strong>{{ match.kills }} / {{ match.deaths }} / {{ match.assists }}</strong>
              <small>{{ match.durationMinutes }} 分钟</small>
            </article>
          </div>
          <p v-else>{{ scoutDetailsMessage || '暂无可用明细' }}</p>
          <footer>仅显示英雄、胜负、K/D/A 和时长；不显示玩家名、PUUID、对局 ID 或原始载荷。</footer>
        </section>
      </div>
    </Transition>
    <Transition name="release-highlights">
      <div
        v-if="state.releaseHighlights"
        class="release-highlights-backdrop"
        role="presentation"
        @click.self="dismissReleaseHighlights"
      >
        <section class="release-highlights-dialog" role="dialog" aria-modal="true" aria-labelledby="release-highlights-title">
          <small>刚刚更新</small>
          <h2 id="release-highlights-title">已更新至 v{{ state.releaseHighlights.version }}</h2>
          <p>从 v{{ state.releaseHighlights.previousVersion }} 升级</p>
          <ul><li v-for="item in state.releaseHighlights.items" :key="item">{{ item }}</li></ul>
          <button class="primary" @click="dismissReleaseHighlights">知道了</button>
        </section>
      </div>
    </Transition>
    <Transition name="toast"><div v-if="toast" :class="['toast', { error: toastIsError }]" :role="toastIsError ? 'alert' : 'status'" @click="dismissToast">{{ toast }}</div></Transition>
  </div>
</template>
