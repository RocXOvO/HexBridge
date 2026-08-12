<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChampionSummary } from '../../shared/contracts'
import LogoMark from './logo-mark.vue'
import { api, useRuntime } from './state'

type Page = 'live' | 'ranking' | 'settings' | 'diagnostics'
const { state, isPreview, bridgeError } = useRuntime()
const page = ref<Page>('live')
const search = ref('')
const rankingSort = ref<'tier' | 'winRate' | 'role'>('tier')
const apiKey = ref('')
const toast = ref('')
const busy = ref(false)
const keyBusy = ref(false)
const keyFeedback = ref<{ kind: 'idle' | 'progress' | 'success' | 'error'; message: string }>({ kind: 'idle', message: '' })
const calibrationBusy = ref(false)
const lcuBusy = ref(false)
const gameDirectory = ref(state.value.settings.gameDirectory)
const pageVisible = ref(!document.hidden)

const current = computed(() => state.value.candidates.find((item) => item.isCurrent) ?? null)
const bench = computed(() => state.value.candidates.filter((item) => !item.isCurrent))
const heroStyle = computed(() => current.value?.splashUrl ? { backgroundImage: `url(${current.value.splashUrl})` } : {})
const statusLabel = computed(() => {
  if (!state.value.lcu.connected) return '等待客户端'
  if (!state.value.snapshot.modeActive) return '等待海克斯大乱斗'
  return state.value.snapshot.phase === 'ChampSelect' ? '选人同步中' : state.value.snapshot.phase
})

const ranking = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = state.value.champions.filter((item) =>
    !query || item.name.toLowerCase().includes(query) || item.alias.toLowerCase().includes(query),
  )
  return [...rows].sort((a, b) => {
    if (rankingSort.value === 'winRate') return (b.winRate ?? -1) - (a.winRate ?? -1)
    if (rankingSort.value === 'role') return (a.roles[0] ?? '').localeCompare(b.roles[0] ?? '', 'zh-CN')
    return (a.tier ?? 99) - (b.tier ?? 99) || (b.winRate ?? -1) - (a.winRate ?? -1)
  })
})

function winRate(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function tier(value: number | null): string {
  return value == null ? '—' : `T${value}`
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

async function saveGameDirectory(): Promise<void> {
  try {
    await updateSettings({ gameDirectory: gameDirectory.value.trim() })
    toast.value = '游戏目录已保存，正在重新检测客户端…'
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '游戏目录保存失败'
  }
}

watch(() => state.value.settings.gameDirectory, (value) => { gameDirectory.value = value })
const visibilityChanged = (): void => { pageVisible.value = !document.hidden }
onMounted(() => document.addEventListener('visibilitychange', visibilityChanged))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', visibilityChanged))

const championAlt = (champion: ChampionSummary | null) => champion ? `${champion.name}头像` : ''
</script>

<template>
  <div class="app-shell" :class="{ 'animations-paused': !pageVisible }" :data-performance="state.diagnostics.activeVisualMode">
    <header class="titlebar">
      <div class="title-brand"><LogoMark /><span>HexBridge</span><small>0.1.3</small></div>
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
        <button :class="{ active: page === 'settings' }" @click="page = 'settings'"><span>◇</span>设置</button>
        <button :class="{ active: page === 'diagnostics' }" @click="page = 'diagnostics'"><span>···</span>诊断</button>
      </nav>
      <div class="side-foot">
        <span :class="['status-dot', state.lcu.connected ? 'ok' : '']" />
        <div><b>{{ state.lcu.connected ? 'LCU 已连接' : 'LCU 未连接' }}</b><small>{{ statusLabel }}</small></div>
      </div>
    </aside>

    <main class="stage">
      <div v-if="bridgeError" class="bridge-error" role="alert">
        安全桥接初始化失败，实时数据与操作已停用。请重新安装 HexBridge 或检查本地启动日志。
      </div>
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
            <div class="hero-name"><small>当前英雄</small><h1>{{ current.name }}</h1><p>{{ current.roles.join(' · ') || '未知定位' }}</p></div>
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
              <small>{{ state.lcu.connected ? 'LCU CONNECTED' : 'SEARCHING FOR LCU' }}</small>
              <h2>{{ state.lcu.connected ? '等待选择英雄' : '正在寻找英雄联盟客户端' }}</h2>
              <p>{{ state.lcu.connected ? '进入海克斯大乱斗选人阶段后会自动显示英雄。' : (state.lcu.lastError || '请先启动 WeGame 与英雄联盟客户端。') }}</p>
              <button v-if="!state.lcu.connected" class="ghost reconnect-button" :disabled="lcuBusy" @click="retryLcu">
                {{ lcuBusy ? '正在检测…' : '立即重新检测' }}
              </button>
            </div>
          </div>

          <div class="bench-head"><div><small>AVAILABLE</small><h2>备战席</h2></div><span>{{ bench.length }} 位可选英雄</span></div>
          <TransitionGroup name="reorder" tag="div" class="bench-grid">
            <article v-for="item in bench" :key="item.id" :class="['bench-card', { best: item.isBest }]">
              <img :src="item.iconUrl" :alt="championAlt(item)" />
              <div class="bench-info"><b>{{ item.name }}</b><small>{{ item.roles[0] || '未知' }}</small></div>
              <div class="bench-stats"><b>{{ tier(item.tier) }}</b><span>{{ winRate(item.winRate) }}</span></div>
              <div v-if="item.isBest" class="best-strip">首选 · 较当前 {{ item.winRateDelta != null && item.winRateDelta >= 0 ? '+' : '' }}{{ item.winRateDelta == null ? '—' : (item.winRateDelta * 100).toFixed(1) + '%' }}</div>
            </article>
          </TransitionGroup>
          <p class="choice-note">推荐仅作数据参考。换英雄与选择均由你在游戏中完成。</p>
        </div>
      </section>

      <section v-else-if="page === 'ranking'" class="page-content standard-page">
        <div class="page-heading"><div><small>PATCH {{ state.api.gamePatch || '—' }}</small><h1>英雄榜</h1><p>海克斯大乱斗英雄强度与胜率快照</p></div><button class="ghost" :disabled="busy" @click="refresh">刷新数据</button></div>
        <div class="toolbar"><label class="search"><span>⌕</span><input v-model="search" placeholder="搜索英雄" /></label><div class="segmented"><button v-for="sort in (['tier','winRate','role'] as const)" :key="sort" :class="{ active: rankingSort === sort }" @click="rankingSort = sort">{{ sort === 'tier' ? 'Tier' : sort === 'winRate' ? '胜率' : '角色' }}</button></div></div>
        <div class="ranking-list">
          <article v-for="(item, index) in ranking" :key="item.id">
            <span class="rank-index">{{ String(index + 1).padStart(2, '0') }}</span><img :src="item.iconUrl" :alt="championAlt(item)" /><div class="rank-name"><b>{{ item.name }}</b><small>{{ item.roles.join(' · ') }}</small></div><span class="tier-pill">{{ tier(item.tier) }}</span><div class="rank-wr"><small>胜率</small><b>{{ winRate(item.winRate) }}</b></div>
          </article>
        </div>
      </section>

      <section v-else-if="page === 'settings'" class="page-content standard-page settings-page">
        <div class="page-heading"><div><small>PREFERENCES</small><h1>设置</h1><p>本地、安全、按你的游戏环境运行</p></div></div>
        <div class="settings-grid">
          <article class="settings-card wide"><header><div><h3>数据服务</h3><p>Key 使用 Windows safeStorage 加密，仅由主进程访问。HEAD 验证不消耗 data credits。</p></div><span :class="['connection-pill', state.api.status]">{{ state.api.configured ? state.api.status : '未配置' }}</span></header><div class="key-row"><input v-model="apiKey" type="password" autocomplete="off" placeholder="hx_live_••••••••" @keyup.enter="validateKey" /><button class="primary" :disabled="keyBusy || !apiKey.trim()" :aria-busy="keyBusy" @click="validateKey">{{ keyBusy ? '正在验证…' : '验证并保存' }}</button><button class="ghost" :disabled="keyBusy" @click="clearKey">清除</button></div><p v-if="keyFeedback.message" :class="['inline-feedback', keyFeedback.kind]" aria-live="polite">{{ keyFeedback.message }}</p><small>申请地址：data.dtodo.cn/developer.html</small></article>
          <article class="settings-card"><h3>视觉性能</h3><p>对局中始终使用省电浮窗样式。</p><select :value="state.settings.visualMode" @change="updateSettings({ visualMode: ($event.target as HTMLSelectElement).value as any })"><option value="auto">自动（推荐）</option><option value="cinematic">电影档</option><option value="balanced">均衡档</option><option value="eco">省电档</option></select><div class="setting-hint">当前：{{ state.diagnostics.activeVisualMode }}</div></article>
          <article class="settings-card"><h3>目标显示器</h3><p>OCR 会截取这个显示器。默认坐标通常可用；只有三张海克斯名称识别位置不准时才需要校准。</p><select :value="state.settings.displayId" @change="updateSettings({ displayId: ($event.target as HTMLSelectElement).value })"><option value="">自动选择主显示器</option><option v-for="display in state.displays" :key="display.id" :value="display.id">{{ display.label }} · {{ display.width }}×{{ display.height }}</option></select><button class="ghost full" :disabled="calibrationBusy" @click="startCalibration">{{ calibrationBusy ? '正在准备校准…' : '校准三张海克斯名称区域' }}</button><small class="calibration-entry-hint">“三张标题”指游戏内同时出现的左、中、右三张海克斯卡片顶部名称。请先让无边框游戏停在该界面；HexBridge 会隐藏自己并显示屏幕截图供框选。</small></article>
          <article class="settings-card wide switches"><label><div><b>自动 OCR</b><small>InProgress 阶段每 750ms 低成本检测</small></div><input type="checkbox" :checked="state.settings.autoOcr" @change="updateSettings({ autoOcr: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>选人浮窗</b><small>仅 queueId 2400 的 ChampSelect 显示</small></div><input type="checkbox" :checked="state.settings.showChampionPanel" @change="updateSettings({ showChampionPanel: ($event.target as HTMLInputElement).checked })" /></label><label><div><b>海克斯浮窗</b><small>三张全部可靠识别后自动出现</small></div><input type="checkbox" :checked="state.settings.showAugmentOverlay" @change="updateSettings({ showAugmentOverlay: ($event.target as HTMLInputElement).checked })" /></label></article>
          <article class="settings-card wide"><h3>游戏目录（自动发现失败时使用）</h3><p>填写包含 LeagueClient.exe 或 lockfile 的英雄联盟安装目录，不要填写 WeGame 启动器或 Game 子目录。保存后会立即重新检测。</p><div class="directory-row"><input v-model="gameDirectory" placeholder="例如 D:\英雄联盟 或 D:\WeGameApps\英雄联盟" @keyup.enter="saveGameDirectory" /><button class="primary" @click="saveGameDirectory">保存并检测</button><button class="ghost" :disabled="lcuBusy" @click="retryLcu">{{ lcuBusy ? '检测中…' : '重新检测' }}</button></div></article>
        </div>
      </section>

      <section v-else class="page-content standard-page diagnostics-page">
        <div class="page-heading"><div><small>SYSTEM HEALTH</small><h1>诊断</h1><p>日志会自动过滤 LCU token、API Key 与账号标识。</p></div><div class="page-actions"><button class="ghost" @click="clearDiagnostics">清除截图</button><button class="ghost" @click="triggerOcr">F8 立即识别</button></div></div>
        <div class="health-grid"><article><span :class="['health-icon', state.lcu.connected ? 'ok' : 'warn']">●</span><div><small>LCU</small><b>{{ state.lcu.connected ? '只读连接正常' : '等待客户端' }}</b><p>{{ state.lcu.lastError || `发现来源：${state.lcu.source || '—'}` }}</p></div></article><article><span :class="['health-icon', state.api.status === 'ready' ? 'ok' : 'warn']">●</span><div><small>DATA API</small><b>{{ state.api.status }}</b><p>{{ state.api.lastError || `数据版本 ${state.api.dataVersion || '—'}` }}</p></div></article><article><span :class="['health-icon', state.diagnostics.ocrReady ? 'ok' : 'warn']">●</span><div><small>OCR</small><b>{{ state.diagnostics.ocrReady ? '模型已就绪' : '模型未就绪' }}</b><p>{{ state.diagnostics.ocrLastError || `上次 ${state.diagnostics.ocrLastDurationMs ?? '—'}ms` }}</p></div></article></div>
        <div class="log-panel"><header><b>本地日志</b><span>{{ state.diagnostics.logLines.length }} 行</span></header><pre>{{ state.diagnostics.logLines.join('\n') || '暂无日志' }}</pre></div>
        <p class="choice-note">诊断截图仅在手动识别时保存，最多保留 60 张裁切图。</p>
        <div v-if="isPreview" class="preview-banner">浏览器视觉预览模式 · Electron 中将显示实时数据</div>
      </section>
    </main>
    <Transition name="toast"><div v-if="toast" class="toast" @click="toast = ''">{{ toast }}</div></Transition>
  </div>
</template>
