<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChampionSummary } from '../../shared/contracts'
import LogoMark from './logo-mark.vue'
import { describeMatchStatus } from '../../shared/match-status'
import { api, useRuntime } from './state'
import { matchesChampionSearch } from '../../shared/champion-search'

type Page = 'live' | 'ranking' | 'updates' | 'settings' | 'diagnostics'
const { state, isPreview, bridgeError } = useRuntime()
const page = ref<Page>('live')
const search = ref('')
const rankingSort = ref<'tier' | 'winRate'>('tier')
const selectedChampionId = ref<number | null>(null)
const apiKey = ref('')
const toast = ref('')
const busy = ref(false)
const keyBusy = ref(false)
const keyFeedback = ref<{ kind: 'idle' | 'progress' | 'success' | 'error'; message: string }>({ kind: 'idle', message: '' })
const calibrationBusy = ref(false)
const lcuBusy = ref(false)
const updateBusy = ref(false)
const installArmed = ref(false)
const pageVisible = ref(!document.hidden)
const windowFocused = ref(document.hasFocus())
const recordingHotkey = ref(false)
const hotkeyFeedback = ref('')
const matchContextPresent = computed(() => state.value.snapshot.matchStage !== 'none')
const matchStatus = computed(() => describeMatchStatus(state.value.snapshot, state.value.lcu.connected))
const retainedMatch = computed(() => matchStatus.value.retained)
const updateInstallBlocked = computed(() => matchContextPresent.value)
const updatePercent = computed(() => Math.max(0, Math.min(100, state.value.update.percent ?? 0)))

const current = computed(() => state.value.candidates.find((item) => item.isCurrent) ?? null)
const bench = computed(() => state.value.candidates.filter((item) => !item.isCurrent))
const recognizedChampionId = computed(() => state.value.snapshot.currentChampionId)
const recognizedChampionMissingData = computed(() => recognizedChampionId.value != null && !current.value)
const heroStyle = computed(() => current.value?.splashUrl ? { backgroundImage: `url(${current.value.splashUrl})` } : {})
const statusLabel = computed(() => matchStatus.value.label)

const ranking = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = state.value.champions.filter((item) => matchesChampionSearch(item, query))
  return [...rows].sort((a, b) => {
    if (rankingSort.value === 'winRate') return (b.winRate ?? -1) - (a.winRate ?? -1)
    return (a.tier ?? 99) - (b.tier ?? 99) || (b.winRate ?? -1) - (a.winRate ?? -1)
  })
})

function winRate(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function tier(value: number | null): string {
  return value == null ? '—' : `T${value}`
}

function tierLabel(value: number | null): string {
  return value == null ? '暂无数据' : ['顶尖', '强势', '均衡', '偏弱', '挑战'][value - 1] ?? `第 ${value} 档`
}

function bytes(value: number | null): string {
  if (value == null) return '—'
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
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
    toast.value = result.message
    if (result.ok) apiKey.value = ''
  } catch (error) {
    const message = error instanceof Error ? error.message : 'API Key 验证失败，请稍后重试'
    keyFeedback.value = { kind: 'error', message }
    toast.value = message
  } finally {
    keyBusy.value = false
  }
}

async function clearKey(): Promise<void> {
  try {
    await api.clearApiKey()
    apiKey.value = ''
    keyFeedback.value = { kind: 'idle', message: '已清除本机保存的 API Key' }
  } catch (error) {
    keyFeedback.value = { kind: 'error', message: error instanceof Error ? error.message : '清除失败' }
  }
}

async function refresh(): Promise<void> {
  busy.value = true
  try {
    const result = await api.refreshData()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '数据刷新失败'
  } finally {
    busy.value = false
  }
}

async function checkUpdate(): Promise<void> {
  if (updateBusy.value) return
  updateBusy.value = true
  installArmed.value = false
  try {
    const result = await api.checkForUpdates()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '检查更新失败'
  } finally {
    updateBusy.value = false
  }
}

async function downloadUpdate(): Promise<void> {
  if (updateBusy.value) return
  updateBusy.value = true
  try {
    const result = await api.downloadUpdate()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '下载更新失败'
  } finally {
    updateBusy.value = false
  }
}

async function installUpdate(): Promise<void> {
  if (!installArmed.value) {
    installArmed.value = true
    return
  }
  installArmed.value = false
  try {
    const result = await api.installUpdate()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '安装更新失败'
  }
}

async function openReleasePage(): Promise<void> {
  try {
    const result = await api.openReleasePage()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '打开官方下载页失败'
  }
}

async function triggerOcr(): Promise<void> {
  try {
    const result = await api.triggerOcr()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : 'OCR 识别失败'
  }
}

async function clearDiagnostics(): Promise<void> {
  try {
    const result = await api.clearDiagnosticScreenshots()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '清除诊断截图失败'
  }
}

async function startCalibration(): Promise<void> {
  if (calibrationBusy.value) return
  calibrationBusy.value = true
  toast.value = '正在隐藏主窗口并捕获目标显示器…'
  try {
    await api.startCalibration()
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : ''
    toast.value = /get sources|captur|屏幕捕获|目标显示器/i.test(rawMessage)
      ? '无法截取目标显示器，请允许 HexBridge 使用屏幕录制后重试'
      : '无法启动校准，主窗口已恢复，请稍后重试'
  } finally {
    calibrationBusy.value = false
  }
}

async function retryLcu(): Promise<void> {
  if (lcuBusy.value) return
  lcuBusy.value = true
  toast.value = '正在重新检测 LeagueClientUx、lockfile 和客户端日志…'
  try {
    const result = await api.retryLcuConnection()
    toast.value = result.message
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '重新检测客户端失败'
  } finally {
    lcuBusy.value = false
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
  toast.value = result.message
}

watch(() => state.value.update.status, (value) => {
  if (value !== 'downloaded') installArmed.value = false
})
const visibilityChanged = (): void => { pageVisible.value = !document.hidden }
const focusChanged = (): void => { windowFocused.value = document.hasFocus() }
onMounted(() => {
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('focus', focusChanged)
  window.addEventListener('blur', focusChanged)
  window.addEventListener('keydown', recordHotkey, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('focus', focusChanged)
  window.removeEventListener('blur', focusChanged)
  window.removeEventListener('keydown', recordHotkey, true)
})

const championAlt = (champion: ChampionSummary | null) => champion ? `${champion.name}头像` : ''
</script>

<template>
  <div class="app-shell" :class="{ 'animations-paused': !pageVisible || !windowFocused }" :data-performance="state.diagnostics.activeVisualMode">
    <header class="titlebar">
      <div class="title-brand"><LogoMark /><span>HexBridge</span><small>{{ state.update.currentVersion }}</small></div>
      <div class="drag-region" />
      <div class="title-actions">
        <button aria-label="最小化" @click="api.windowAction('minimize')">—</button>
        <button aria-label="最大化" @click="api.windowAction('maximize')">□</button>
        <button aria-label="关闭" @click="api.windowAction('close')">×</button>
      </div>
    </header>

    <aside class="sidebar">
      <div class="side-logo"><LogoMark /></div>
      <nav>
        <button :class="{ active: page === 'live' }" @click="page = 'live'"><span>◈</span>实时助手</button>
        <button :class="{ active: page === 'ranking' }" @click="page = 'ranking'"><span>⌁</span>英雄榜</button>
        <button :class="{ active: page === 'updates' }" @click="page = 'updates'"><span>↟</span>更新</button>
        <button :class="{ active: page === 'settings' }" @click="page = 'settings'"><span>◇</span>设置</button>
        <button :class="{ active: page === 'diagnostics' }" @click="page = 'diagnostics'"><span>···</span>诊断</button>
      </nav>
    </aside>

    <main class="stage">
      <div v-if="bridgeError" class="bridge-error" role="alert">
        安全桥接初始化失败，实时数据与操作已停用。请重新安装 HexBridge 或检查本地启动日志。
      </div>
      <button
        v-if="['available', 'downloading', 'downloaded', 'error'].includes(state.update.status) && state.update.availableVersion"
        class="update-banner"
        @click="page = 'updates'"
      >
        <span>{{ state.update.status === 'downloaded' ? '更新已下载' : `HexBridge v${state.update.availableVersion} 可用` }}</span>
        <small>{{ state.update.status === 'downloading' ? `${updatePercent.toFixed(0)}%` : '查看更新 →' }}</small>
      </button>
      <section v-if="page === 'live'" class="live-page">
        <div class="hero-backdrop" :style="heroStyle" />
        <div class="hero-scrim" />
        <div class="page-content live-content">
          <div class="eyebrow-row">
            <span class="eyebrow"><i />{{ statusLabel }}</span>
            <span class="data-version" :class="{ stale: state.api.status === 'stale' }">
              {{ state.api.status === 'stale' ? '数据已过期 · ' : '数据 ' }}{{ state.api.dataVersion || '未就绪' }}
            </span>
          </div>

          <div class="current-hero" v-if="current">
            <img :src="current.iconUrl" :alt="championAlt(current)" />
            <div class="hero-name"><small>当前英雄</small><h1>{{ current.name }}</h1><p>{{ current.title || '海克斯大乱斗' }}</p></div>
            <div class="hero-metrics">
              <div><small>强度</small><b class="tier-value">{{ tier(current.tier) }}</b></div>
              <div><small>胜率</small><b>{{ winRate(current.winRate) }}</b></div>
            </div>
            <span v-if="current.isBest" class="best-badge">首选</span>
          </div>
          <div v-else class="empty-hero">
            <div class="connection-stage" aria-hidden="true">
              <div class="connection-ring ring-one" />
              <div class="connection-ring ring-two" />
              <div class="connection-path"><i /><i /><i /></div>
              <LogoMark />
            </div>
            <div class="empty-copy">
              <small>{{ recognizedChampionMissingData ? 'CHAMPION DETECTED' : state.lcu.connected ? 'LCU CONNECTED' : 'SEARCHING FOR LCU' }}</small>
              <h2>{{ recognizedChampionMissingData ? `已识别英雄 #${recognizedChampionId}` : state.lcu.connected ? '等待选择英雄' : '英雄联盟客户端未启动或未发现' }}</h2>
              <p>{{ recognizedChampionMissingData ? 'LCU 读取正常，但英雄数据目录尚未就绪或缺少该英雄；请刷新数据。' : state.lcu.connected ? '进入海克斯大乱斗选人阶段后会自动显示英雄。' : '启动 WeGame 与英雄联盟后，HexBridge 会在后台自动连接。' }}</p>
              <button v-if="!state.lcu.connected" class="ghost reconnect-button" :disabled="lcuBusy" @click="retryLcu">
                {{ lcuBusy ? '正在检测…' : '立即重新检测' }}
              </button>
            </div>
          </div>

          <div class="bench-head"><div><small>AVAILABLE</small><h2>备战席</h2></div><span>{{ bench.length }} 位可选英雄</span></div>
          <TransitionGroup name="reorder" tag="div" class="bench-grid">
            <article v-for="item in bench" :key="item.id" :class="['bench-card', { best: item.isBest }]">
              <img :src="item.iconUrl" :alt="championAlt(item)" />
              <div class="bench-info"><b>{{ item.name }}</b><small>{{ item.title || '可选英雄' }}</small></div>
              <div class="bench-stats"><b>{{ tier(item.tier) }}</b><span>{{ winRate(item.winRate) }}</span></div>
              <div v-if="item.isBest" class="best-strip">首选 · 较当前 {{ item.winRateDelta != null && item.winRateDelta >= 0 ? '+' : '' }}{{ item.winRateDelta == null ? '—' : (item.winRateDelta * 100).toFixed(1) + '%' }}</div>
            </article>
          </TransitionGroup>
          <p class="choice-note">推荐仅作数据参考。换英雄与选择均由你在游戏中完成。</p>
        </div>
      </section>

      <section v-else-if="page === 'ranking'" class="page-content standard-page">
        <div class="page-heading"><div><small>版本 {{ state.api.gamePatch || '—' }}</small><h1>英雄榜</h1><p>海克斯大乱斗英雄强度与胜率快照</p></div><button class="ghost" :disabled="busy" @click="refresh">刷新数据</button></div>
        <div class="toolbar"><label class="search"><span>⌕</span><input v-model="search" placeholder="搜索英雄名、称号或别名（如 VN）" /></label><div class="segmented"><button v-for="sort in (['tier','winRate'] as const)" :key="sort" :class="{ active: rankingSort === sort }" @click="rankingSort = sort">{{ sort === 'tier' ? '强度' : '胜率' }}</button></div></div>
        <div class="ranking-list">
          <article v-for="(item, index) in ranking" :key="item.id" :class="['tier-row', `tier-${item.tier || 0}`, { selected: selectedChampionId === item.id }]" :style="{ '--tier-level': String(item.tier || 0) }" tabindex="0" @click="selectedChampionId = item.id" @focus="selectedChampionId = item.id">
            <span class="rank-index">{{ String(index + 1).padStart(2, '0') }}</span><img :src="item.iconUrl" :alt="championAlt(item)" /><div class="rank-name"><b>{{ item.name }}</b><small>{{ item.title || '海克斯大乱斗英雄' }}</small></div><div class="tier-band"><small>强度</small><b>{{ tierLabel(item.tier) }}</b></div><div class="rank-wr"><small>胜率</small><b>{{ winRate(item.winRate) }}</b></div>
          </article>
        </div>
      </section>

      <section v-else-if="page === 'updates'" class="page-content standard-page update-page">
        <div class="page-heading"><div><small>HEXBRIDGE UPDATE</small><h1>软件更新</h1><p>像桌面工具一样独立管理检查、下载和安装，不会静默更新。</p></div></div>
        <article class="update-surface">
          <header><div><small>当前版本</small><h2>v{{ state.update.currentVersion }}</h2></div><span :class="['connection-pill', state.update.status]">{{ state.update.status }}</span></header>
          <div class="update-summary"><div><small>可用版本</small><b>{{ state.update.availableVersion ? `v${state.update.availableVersion}` : '已是最新或尚未检查' }}</b></div><p aria-live="polite">{{ state.update.message }}<small v-if="state.update.errorCode" class="update-code">诊断码：{{ state.update.errorCode }}</small></p></div>
          <div v-if="state.update.status === 'downloading' || state.update.status === 'downloaded'" class="update-progress"><div><i :style="{ width: `${updatePercent}%` }" /></div><small>{{ updatePercent.toFixed(0) }}% · {{ bytes(state.update.transferred) }} / {{ bytes(state.update.total) }}<template v-if="state.update.bytesPerSecond"> · {{ bytes(state.update.bytesPerSecond) }}/s</template></small></div>
          <p v-if="state.update.releaseNotes" class="update-notes">{{ state.update.releaseNotes }}</p>
          <div class="update-actions"><button class="ghost" :disabled="updateBusy || ['checking','downloading','installing'].includes(state.update.status)" @click="checkUpdate">{{ state.update.status === 'checking' ? '检查中…' : '检查更新' }}</button><button v-if="state.update.status === 'error'" class="ghost" @click="openReleasePage">打开官方下载页</button><button v-if="state.update.status === 'available' || (state.update.status === 'error' && state.update.availableVersion)" class="primary" :disabled="updateBusy" @click="downloadUpdate">确认下载</button><button v-if="state.update.status === 'downloaded' && !installArmed" class="primary" :disabled="updateInstallBlocked" @click="installUpdate">{{ updateInstallBlocked ? '当前流程结束后安装' : '重启并安装' }}</button><template v-if="state.update.status === 'downloaded' && installArmed"><span class="install-warning">应用将立即退出。确定安装？</span><button class="primary" :disabled="updateInstallBlocked" @click="installUpdate">确认重启安装</button><button class="ghost" @click="installArmed = false">取消</button></template></div>
          <small>不会静默更新、下载或安装。Windows 发布物尚未商业代码签名；下载仍会校验 SHA-512，安装前由你二次确认。</small>
        </article>
      </section>

      <section v-else-if="page === 'settings'" class="page-content standard-page settings-page">
        <div class="page-heading"><div><small>PREFERENCES</small><h1>设置</h1><p>本地、安全、按你的游戏环境运行</p></div></div>
        <div class="settings-grid">
          <article class="settings-card wide"><header><div><h3>数据服务</h3><p>Key 使用 Windows safeStorage 加密，仅由主进程访问。HEAD 验证不消耗 data credits。</p></div><span :class="['connection-pill', state.api.status]">{{ state.api.configured ? state.api.status : '未配置' }}</span></header><div class="key-row"><input v-model="apiKey" type="password" autocomplete="off" placeholder="hx_live_••••••••" @keyup.enter="validateKey" /><button class="primary" :disabled="keyBusy || !apiKey.trim()" :aria-busy="keyBusy" @click="validateKey">{{ keyBusy ? '正在验证…' : '验证并保存' }}</button><button class="ghost" :disabled="keyBusy" @click="clearKey">清除</button></div><p v-if="keyFeedback.message" :class="['inline-feedback', keyFeedback.kind]" aria-live="polite">{{ keyFeedback.message }}</p><small>申请地址：data.dtodo.cn/developer.html</small></article>
          <article class="settings-card"><h3>目标显示器</h3><p>默认自动选择主显示器；只有三张卡片位置不准时才需要校准。</p><select :value="state.settings.displayId" @change="updateSettings({ displayId: ($event.target as HTMLSelectElement).value })"><option value="">自动选择主显示器</option><option v-for="display in state.displays" :key="display.id" :value="display.id">{{ display.label }} · {{ display.width }}×{{ display.height }}</option></select><button class="ghost full" :disabled="calibrationBusy" @click="startCalibration">{{ calibrationBusy ? '正在准备校准…' : '框选三张完整海克斯卡片' }}</button><small class="calibration-entry-hint">停在三卡界面后依次框住整张左、中、右卡片，标题区域会自动提取。</small></article>
          <article class="settings-card"><h3>识别快捷键</h3><p>点击录制后按下新的全局组合键；冲突或无效时会保留原快捷键。</p><div class="hotkey-row"><kbd :class="{ unavailable: !state.settings.hotkey }">{{ state.settings.hotkey || '未注册' }}</kbd><button class="ghost" :class="{ recording: recordingHotkey }" @click="recordingHotkey = !recordingHotkey">{{ recordingHotkey ? '请按快捷键…' : '录制新快捷键' }}</button></div><small :class="{ 'hotkey-error': !state.settings.hotkey }">{{ hotkeyFeedback || (state.settings.hotkey ? '推荐使用 F8 或 Ctrl+Shift+字母；Esc 取消。' : '快捷键未注册或已被其他程序占用，请录制一个新快捷键。') }}</small></article>
          <article class="settings-card wide switches"><label><div><b>自动 OCR（实验）</b><small>默认关闭；开启后每 2 秒低分辨率门控，命中后才识别</small></div><input type="checkbox" :checked="state.settings.autoOcr" @change="updateSettings({ autoOcr: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>选人浮窗</b><small>选人及游戏客户端交接期显示，进入对局后隐藏</small></div><input type="checkbox" :checked="state.settings.showChampionPanel" @change="updateSettings({ showChampionPanel: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>海克斯浮窗</b><small>三张全部可靠识别后自动出现</small></div><input type="checkbox" :checked="state.settings.showAugmentOverlay" @change="updateSettings({ showAugmentOverlay: ($event.target as HTMLInputElement).checked })" /></label></article>
        </div>
      </section>

      <section v-else class="page-content standard-page diagnostics-page">
        <div class="page-heading"><div><small>SYSTEM HEALTH</small><h1>诊断</h1><p>日志会自动过滤 LCU token、API Key 与账号标识。</p></div><div class="page-actions"><button class="ghost" @click="clearDiagnostics">清除截图</button><button class="ghost" @click="triggerOcr">{{ state.settings.hotkey ? `${state.settings.hotkey} 立即识别` : '手动立即识别' }}</button></div></div>
        <div class="health-grid"><article><span :class="['health-icon', state.lcu.connected || retainedMatch ? 'ok' : 'warn']">●</span><div><small>LCU</small><b>{{ state.lcu.connected ? '只读连接正常' : retainedMatch ? '游戏客户端接管中' : '等待客户端' }}</b><p>{{ retainedMatch ? 'LCU 连接已交接，本局英雄与 OCR 上下文仍保留' : (state.lcu.lastError || `发现来源：${state.lcu.source || '—'}`) }}</p></div></article><article><span :class="['health-icon', state.api.status === 'ready' ? 'ok' : 'warn']">●</span><div><small>DATA API</small><b>{{ state.api.status }}</b><p>{{ state.api.lastError || `数据版本 ${state.api.dataVersion || '—'}` }}</p></div></article><article><span :class="['health-icon', state.diagnostics.ocrReady ? 'ok' : 'warn']">●</span><div><small>OCR</small><b>{{ state.diagnostics.ocrReady ? '模型已就绪' : '模型未就绪' }}</b><p>{{ state.diagnostics.ocrLastError || `上次 ${state.diagnostics.ocrLastDurationMs ?? '—'}ms` }}</p></div></article></div>
        <div class="log-panel"><header><b>本地日志</b><span>{{ state.diagnostics.logLines.length }} 行</span></header><pre>{{ state.diagnostics.logLines.join('\n') || '暂无日志' }}</pre></div>
        <p class="choice-note">诊断截图仅在手动识别时保存，最多保留 60 张裁切图。</p>
        <div v-if="isPreview" class="preview-banner">浏览器视觉预览模式 · Electron 中将显示实时数据</div>
      </section>
    </main>
    <Transition name="toast"><div v-if="toast" class="toast" @click="toast = ''">{{ toast }}</div></Transition>
  </div>
</template>
