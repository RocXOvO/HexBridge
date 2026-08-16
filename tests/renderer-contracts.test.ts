import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nextAugmentAnimationState } from '../src/shared/augment-animation.js'

const appSource = readFileSync(new URL('../src/renderer/src/App.vue', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8')
const rendererEntry = readFileSync(new URL('../src/renderer/src/main.ts', import.meta.url), 'utf8')
const rendererState = readFileSync(new URL('../src/renderer/src/state.ts', import.meta.url), 'utf8')
const rendererDemoState = readFileSync(new URL('../src/renderer/src/demo-state.ts', import.meta.url), 'utf8')
const windowManager = readFileSync(new URL('../src/main/window-manager.ts', import.meta.url), 'utf8')
const bridgeSmoke = readFileSync(new URL('../src/main/bridge-smoke.ts', import.meta.url), 'utf8')
const mainProcess = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const ipcSource = readFileSync(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')
const augmentOverlaySource = readFileSync(new URL('../src/renderer/src/AugmentOverlay.vue', import.meta.url), 'utf8')
const rendererHtml = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8')

describe('main-window recommendation presentation', () => {
  it('animates only the slot whose augment identity changed in each update', () => {
    const first = nextAugmentAnimationState(new Map(), 0, [
      { slot: 'left', augmentId: 10 },
      { slot: 'center', augmentId: 11 },
      { slot: 'right', augmentId: 12 },
    ])
    expect(first.changedBySlot).toEqual({ left: 1, center: 1, right: 1 })
    const second = nextAugmentAnimationState(first.signatures, first.cycle, [
      { slot: 'left', augmentId: 10 },
      { slot: 'center', augmentId: 99 },
      { slot: 'right', augmentId: 12 },
    ])
    expect(second.changedBySlot).toEqual({ center: 2 })
    const metadataOnly = nextAugmentAnimationState(second.signatures, second.cycle, [
      { slot: 'left', augmentId: 10 },
      { slot: 'center', augmentId: 99 },
      { slot: 'right', augmentId: 12 },
    ])
    expect(metadataOnly.changedBySlot).toEqual({})

    // A transient hidden/refresh state keeps the last reliable signatures;
    // when the surface returns, only the actually changed physical slot is
    // animated instead of replaying all three cards.
    const afterTransientHide = nextAugmentAnimationState(second.signatures, second.cycle, [
      { slot: 'left', augmentId: 10 },
      { slot: 'center', augmentId: 101 },
      { slot: 'right', augmentId: 12 },
    ])
    expect(afterTransientHide.changedBySlot).toEqual({ center: 3 })
  })

  it('keeps the safe Renderer fallback version aligned with the packaged product', () => {
    expect(rendererState).toContain("currentVersion: '0.1.65'")
  })

  it('exposes only bounded OCR scheduler telemetry in the diagnostics page', () => {
    expect(appSource).toContain('data-testid="ocr-schedule-diagnostic"')
    expect(appSource).toContain('cheapProbeCount')
    expect(appSource).toContain('cheapProbeLastDurationMs')
    expect(appSource).toContain('fullOcrCount')
    expect(appSource).toContain('fullOcrLastDurationMs')
    expect(appSource).toContain('cheapProbeMaxDurationMs')
    expect(appSource).toContain('fullOcrMaxDurationMs')
    expect(appSource).toContain('nextDelayMs')
    expect(appSource).not.toContain('ocrSchedule.screenshot')
    expect(appSource).not.toContain('ocrSchedule.rawText')
  })

  it('keeps champion selection scrolling inside the assistant without horizontal overflow', () => {
    expect(stylesSource).toContain('.panel-window { width: 100%; min-width: 0;')
    expect(stylesSource).toContain('.panel-bench { flex: 1; min-width: 0; min-height: 0; overflow: hidden;')
    expect(stylesSource).toContain('.panel-list { width: 100%; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden;')
    expect(stylesSource).toContain('overscroll-behavior: contain')
    expect(stylesSource).toContain('scrollbar-gutter: stable')
    expect(stylesSource).toContain('.panel-list::-webkit-scrollbar')
    expect(stylesSource).toContain('grid-template-columns: 37px minmax(0, 1fr) 34px 48px')
  })

  it('keeps the legacy discovery directory out of every Renderer-visible settings fixture', () => {
    expect(rendererState).not.toContain('gameDirectory')
    expect(rendererDemoState).not.toContain('gameDirectory')
    expect(bridgeSmoke).not.toContain('gameDirectory')
    expect(preloadSource).not.toContain('gameDirectory')
  })

  it('routes only a bounded click-through augment recommendation strip', () => {
    expect(rendererEntry).toContain("route === 'augment'")
    expect(windowManager).toContain("createWindow('augment'")
    expect(windowManager).toContain("focusable: false")
    expect(windowManager).toContain("augment.setIgnoreMouseEvents(true")
    expect(windowManager).toContain("height: 96")
    expect(windowManager).not.toContain("augment.setFullScreen")
    expect(windowManager).not.toContain("augment.focus()")
    expect(windowManager).toContain("additionalArguments: [`--hexbridge-renderer=${route}`]")
    expect(preloadSource).toContain("rendererRoute === 'augment'")
    expect(preloadSource).toContain("exposeInMainWorld('hexbridgeOverlay', overlayApi)")
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('hexbridge', api)")
    expect(preloadSource).toContain("rendererRoute === 'main'")
    expect(preloadSource).toContain("exposeInMainWorld('hexbridgeLobbyBackground', lobbyBackgroundApi)")
  })

  it('keeps the opt-in Lobby frame on a dedicated Main-only, revocable bridge', () => {
    expect(appSource).toContain('window.hexbridgeLobbyBackground?.onChanged')
    expect(appSource).toContain('URL.revokeObjectURL')
    expect(appSource).toContain('frame.bytes.byteLength > 500_000')
    expect(appSource).toContain('state.settings.lobbyBackground')
    expect(preloadSource).toContain("if (rendererRoute === 'main')")
    expect(ipcSource).toContain("ipcMain.handle('hexbridge:set-lobby-background-presentation'")
    expect(ipcSource).toContain("requireSender(event, 'main')")
    expect(rendererHtml).toContain("img-src 'self' data: blob: https:")
  })

  it('waits for the guarded desktop restore before Electron commits the quit', () => {
    expect(mainProcess).toContain("{ label: '退出', click: quitApplication }")
    expect(mainProcess).toContain('runtime.prepareForApplicationQuit()')
    expect(mainProcess).toContain('runtime?.commitApplicationQuit()')
    expect(mainProcess).toContain('event.preventDefault()')
    expect(windowManager).toContain('this.activityChanged = null')
  })

  it('keeps Wallpaper Engine target names and controls behind the Main-only bridge', () => {
    expect(appSource).toContain('Wallpaper Engine')
    expect(appSource).toContain('HexBridge-{id}')
    expect(appSource).toContain('默认关闭；只发送受限切换命令。')
    expect(preloadSource).toContain("rendererRoute === 'main' ? {")
    expect(preloadSource).toContain("ipcRenderer.invoke('hexbridge:get-wallpaper-engine-preferences')")
    expect(preloadSource).toContain("ipcRenderer.invoke('hexbridge:save-wallpaper-engine-preferences', preferences)")
    expect(ipcSource).toContain("ipcMain.handle('hexbridge:get-wallpaper-engine-preferences'")
    expect(ipcSource).toContain("ipcMain.handle('hexbridge:save-wallpaper-engine-preferences'")
    expect(ipcSource).toContain("ipcMain.handle('hexbridge:retry-wallpaper-engine'")
    expect(ipcSource.match(/requireSender\(event, 'main'\)/g)?.length).toBeGreaterThanOrEqual(12)
    expect(ipcSource).toContain("if (action === 'quit') requireSender(event, 'main')")
  })

  it('keeps the raw Tier label visibly rendered instead of replacing it with a strength adjective', () => {
    expect(appSource).toContain('class="rank-stats"')
    expect(appSource).toContain("return state.value.recommendation.source === 'tencent101' ? '腾讯排名' : 'Tier'")
    expect(appSource).toContain('championStrengthValue(item.tier)')
    expect(appSource).not.toContain('强度顶尖')
    expect(appSource).not.toContain('tierLabel(')
  })

  it('keeps diagnostics deletion and LCU rediscovery behind the Main sender guard', () => {
    expect(ipcSource).toMatch(
      /ipcMain\.handle\('hexbridge:clear-diagnostics', \(event\) => \{\s*requireSender\(event, 'main'\)/,
    )
    expect(ipcSource).toMatch(
      /ipcMain\.handle\('hexbridge:retry-lcu', \(event\) => \{\s*requireSender\(event, 'main'\)/,
    )
  })

  it('keeps dtodo champion metrics and Tencent global metrics explicitly separated', () => {
    expect(appSource).toContain('该英雄选取率')
    expect(appSource).toContain('优先采用上游提供的英雄专属推荐顺序')
    expect(appSource).toContain('data.dtodo 单英雄详情')
    expect(appSource).toContain('选取率仅作参考')
    expect(appSource).toContain('全局选取率')
    expect(appSource).toContain('全局胜率')
    expect(appSource).toContain('不是该英雄专属统计')
    expect(appSource).toContain('state.currentRecommendation.cards.slice(0, 3)')
  })

  it('surfaces Tencent overall champion pick rate without using it for ranking', () => {
    expect(appSource).toContain('英雄选取率')
    expect(appSource).toContain('championPickRate(current.championPickRate)')
    expect(appSource).toContain('championPickRate(item.championPickRate)')
    expect(stylesSource).toContain('.rank-pick')
    expect(stylesSource).toContain('grid-template-columns: repeat(auto-fill, minmax(116px, 1fr))')
    expect(rendererDemoState).toContain('championPickRate: null')
  })

  it('keeps Tencent browsing source-bound, keyboard reachable and locally filterable', () => {
    expect(appSource).toContain("selectRecommendationSource('tencent101')")
    expect(appSource).toContain('api.getChampionRecommendation(championId)')
    expect(appSource).toContain('state.value.recommendation.dataVersion')
    expect(appSource).toContain('state.value.recommendation.statisticsDate')
    expect(appSource).toContain('@keydown.enter.prevent="selectRankingChampion(item.id)"')
    expect(appSource).toContain('@keydown.space.prevent="selectRankingChampion(item.id)"')
    expect(appSource).toContain("['all','白银','黄金','棱彩']")
    expect(appSource).toContain('championRecommendationRarity.value')
    expect(appSource).toContain('class="champion-augment-card"')
    expect(appSource).toContain("page === 'champion-detail'")
    expect(appSource).toContain('returnToRanking')
    expect(appSource).toContain('无需 Key · 腾讯官网统计')
    expect(preloadSource).toContain("ipcRenderer.invoke('hexbridge:get-champion-recommendation', championId)")
    expect(ipcSource).toContain("ipcMain.handle('hexbridge:get-champion-recommendation'")
    expect(ipcSource).toContain("requireSender(event, 'main')")
  })

  it('keeps hero recommendations visible when the independent build request fails', () => {
    expect(appSource).toContain('const championBuild = ref<ChampionBuildRecommendation | null>(null)')
    expect(appSource).toContain('const championBuildBusy = ref(false)')
    expect(appSource).toContain('const recommendationTask = api.getChampionRecommendation(championId)')
    expect(appSource).toContain('const buildTask = api.getChampionBuild(championId)')
    expect(appSource).toContain('await Promise.allSettled([recommendationTask, buildTask])')
    expect(appSource).toContain('championBuild.value = result.ok ? result.build : null')
    expect(appSource).not.toContain('championRecommendation?.build')
    expect(rendererDemoState).toContain("cards: demoState.currentRecommendation?.cards ?? []")
    expect(rendererDemoState).toContain("message: '预览模式：出装推荐已读取'")
  })

  it('presents Tencent 101 as the default without removing the explicit dtodo choice', () => {
    expect(rendererState).toContain("recommendationDataSource: 'tencent101'")
    expect(bridgeSmoke).toContain("recommendationDataSource: 'tencent101'")
    expect(appSource).toContain('<b>腾讯英雄联盟数据站</b><small>无需 Key · 腾讯官网统计')
    expect(appSource).toContain('<b>data.dtodo</b><small>需要个人 API Key · 英雄、海克斯、出装')
    expect(appSource).toContain("page === 'dtodo-settings'")
    expect(appSource).toContain('class="source-config-link"')
    expect(appSource).toContain('@click.stop="openDtodoSettings"')
    expect(appSource).not.toContain('dtodo-entry-card')
  })

  it('keeps the live assistant source badge limited to the provider name', () => {
    expect(appSource).toContain('<span class="data-version">{{ recommendationSourceName }}</span>')
    expect(appSource).not.toContain(':class="{ stale: state.recommendation.stale }"')
  })

  it('keeps release highlights dismissible only through the explicit button', () => {
    expect(appSource).toContain('class="release-highlights-backdrop"')
    expect(appSource).toContain('@click="dismissReleaseHighlights"')
    expect(appSource).not.toContain('@click.self="dismissReleaseHighlights"')
  })

  it('animates only changed augment cards and exposes the tray update action', () => {
    expect(appSource).toContain('`${slot.slot}-${slot.augmentId ?? \'unknown\'}`')
    expect(appSource).toContain('overlayCardAnimationBySlot.value[slot.slot] === overlayCardAnimationCycle.value')
    expect(appSource).toContain('nextAugmentAnimationState(overlayCardSignatures')
    expect(appSource).toContain('class="augment-surface"')
    expect(appSource).not.toContain('name="augment-surface"')
    expect(appSource).toContain('if (next.slots.length === 0)')
    expect(appSource).toContain('augment-card-refresh')
    expect(appSource).not.toContain('<TransitionGroup v-if="state.overlay.visible && state.overlay.slots.length"')
    expect(augmentOverlaySource).toContain('overlay-card-refresh')
    expect(augmentOverlaySource).toContain('slotAnimationBySlot[slot.slot] === slotAnimationCycle')
    expect(augmentOverlaySource).toContain('slotKey(slot)')
    expect(stylesSource).toContain('.augment-card-refresh')
    expect(stylesSource).toContain('.overlay-card-refresh')
    expect(stylesSource).toContain('.augment-refreshing')
    expect(stylesSource).toContain('refresh-orbit')
    expect(mainProcess).toContain("{ label: '立即更新', click: applyUpdateFromTray }")
    expect(mainProcess).toContain('runtime?.applyUpdate()')
  })

  it('does not promise automatic recovery after an API rate limit', () => {
    expect(appSource).toContain("status === 'limited') return '请求受限，请稍后手动刷新'")
    expect(appSource).not.toContain('请求受限，稍后自动恢复')
  })

  it('shows both recommendation order and champion-specific pick rate in the in-game strip', () => {
    expect(augmentOverlaySource).toContain('该英雄选取率')
    expect(augmentOverlaySource).toContain('全局选取率')
    expect(augmentOverlaySource).toContain('全局胜率')
    expect(augmentOverlaySource).toContain('(value * 100).toFixed(1)')
    expect(augmentOverlaySource).toContain('rankLabel')
    expect(augmentOverlaySource).toContain('overlay-rank')
    expect(augmentOverlaySource).toContain('slot.reason')
    expect(augmentOverlaySource).toContain('slot.statisticsDate')
    expect(augmentOverlaySource).toContain('腾讯数据站')
    expect(augmentOverlaySource).toContain('data.dtodo')
  })

  it('renders a coherent current-champion build and removes redundant reconnect controls', () => {
    expect(appSource).toContain('大乱斗出装参考')
    expect(appSource).toContain('state.currentBuild.startingItems')
    expect(appSource).toContain('state.currentBuild.coreItems')
    expect(appSource).toContain('state.currentBuild.situationalItems')
    expect(appSource).toContain('class="build-empty">暂无数据</p>')
    expect(appSource).not.toContain('立即重新检测')
    expect(appSource).not.toContain('启动 WeGame 与英雄联盟后')
  })

  it('keeps team-history details behind a Main-only opaque-key bridge', () => {
    expect(appSource).toContain('队友与对手近期状态')
    expect(appSource).toContain('state.opponentScout.allies')
    expect(appSource).toContain('state.opponentScout.opponents')
    expect(appSource).toContain('队伍强度')
    expect(appSource).toContain('总体胜率')
    expect(appSource).toContain('opponentTeamConfidence')
    expect(appSource).toContain('api.getScoutPlayerDetails(')
    expect(appSource).not.toContain('player.puuid')
    expect(preloadSource).toContain("ipcRenderer.invoke('hexbridge:get-scout-player-details', opaqueKey, matchGeneration)")
    expect(ipcSource).toContain("ipcMain.handle('hexbridge:get-scout-player-details'")
    expect(ipcSource).toContain("requireSender(event, 'main')")
    expect(windowManager).toContain("message: '仅主窗口可见'")
  })

  it('keeps the team-history dialog keyboard-contained and restores its trigger', () => {
    expect(appSource).toContain('ref="scoutDetailsDialog"')
    expect(appSource).toContain('ref="scoutDetailsCloseButton"')
    expect(appSource).toContain('tabindex="-1"')
    expect(appSource).toContain("event.key === 'Escape'")
    expect(appSource).toContain("event.key !== 'Tab'")
    expect(appSource).toContain('scoutDetailsTrigger = event?.currentTarget')
    expect(appSource).toContain('scoutDetailsCloseButton.value?.focus()')
    expect(appSource).toContain('active === dialog || active === first')
    expect(appSource).toContain('if (trigger?.isConnected) trigger.focus()')
    expect(appSource).toContain('@click="openScoutDetails(player, $event)"')
  })

  it('exposes one compact update intent without a separate update page or confirmation copy', () => {
    expect(appSource).toContain('class="title-update-action"')
    expect(appSource).toContain('shouldShowUpdateAction(state.value.update)')
    expect(appSource).toContain('api.applyUpdate()')
    expect(appSource).not.toContain("page === 'updates'")
    expect(appSource).not.toContain('确认下载')
    expect(appSource).not.toContain('确认重启安装')
  })

  it('renders user-facing update and diagnostic status in Chinese', () => {
    expect(appSource).toContain("MATCHED: '识别完成'")
    expect(appSource).toContain("ready: '连接正常'")
    expect(appSource).not.toContain('{{ state.api.status }}')
    expect(appSource).not.toContain('{{ state.diagnostics.manualOcrCode }}')
    expect(appSource).not.toContain('CHAMPION DETECTED')
    expect(appSource).not.toContain('LCU CONNECTED')
    expect(appSource).not.toContain('SEARCHING FOR LCU')
    expect(appSource).toContain('data-testid="champion-companion-diagnostic"')
    expect(appSource).toContain('data-testid="augment-companion-diagnostic"')
    expect(appSource).toContain('尚未确认客户端窗口')
    expect(appSource).toContain('游戏不在前台，已隐藏')
    expect(appSource).toContain('不记录窗口位置或进程标识')
  })

  it('presents the API service progressively without exposing the stored secret', () => {
    expect(appSource).toContain("'api-service-card'")
    expect(appSource).toContain("'api-health-badge'")
    expect(appSource).toContain('<label for="api-key-input">API Key</label>')
    expect(appSource).toContain('aria-describedby="api-service-status api-key-feedback"')
    expect(appSource).toContain('v-if="apiKeyFormVisible"')
    expect(appSource).toContain("state.api.configured && state.api.status !== 'unauthorized'")
    expect(appSource).toContain('更换 Key')
    expect(appSource).not.toContain('state.api.apiKey')
  })

  it('guards live-assistant motion when the window is inactive or in eco mode', () => {
    expect(appSource).toContain('name="hero-backdrop-fade"')
    expect(appSource).toContain('name="hero-presence"')
    expect(appSource).toContain('name="assistant-reveal"')
    expect(appSource).toContain('augment-card-refresh')
    expect(appSource).toContain('class="live-atmosphere"')
    expect(stylesSource).toContain('.animations-paused *')
    expect(stylesSource).toContain('transition-duration:.001ms!important')
    expect(stylesSource).toContain('.animations-paused .hero-presence-enter-active .build-recommendation')
    expect(stylesSource).toContain('animation-play-state:paused!important')
    expect(stylesSource).toContain('[data-performance="eco"] .live-atmosphere { display:none; }')
    expect(stylesSource).toContain('[data-performance="eco"] .hero-presence-enter-active .build-recommendation { animation:none!important; }')
    expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)')
    expect(stylesSource).toContain('overflow-y: scroll')
    expect(stylesSource).toContain('scrollbar-gutter: stable')
    expect(stylesSource).not.toContain('.page-flow-enter-from { opacity:0; transform:translateY(10px) scale(.995); }')
  })

  it('keeps the selected hero artwork clear without weakening the eco fallback', () => {
    expect(stylesSource).toContain('filter: blur(1.5px) saturate(1.06) contrast(1.03); opacity: .66')
    expect(stylesSource).toContain('[data-performance="balanced"] .hero-backdrop { filter: blur(1px) saturate(1.04) contrast(1.02); opacity: .56; }')
    expect(stylesSource).toContain('[data-performance="eco"] .hero-backdrop { inset: 0; filter: none; opacity: .20; transform: none; }')
    expect(stylesSource).toContain('[data-performance="eco"] .hero-scrim { background: linear-gradient(90deg, rgba(9,11,16,.42), rgba(9,11,16,.18) 52%, rgba(9,11,16,.48)), linear-gradient(180deg, rgba(9,11,16,.20), #090b10 88%); }')
    expect(stylesSource).toContain('linear-gradient(180deg, rgba(9,11,16,.16), #090b10 90%)')
    expect(stylesSource).not.toContain('filter: blur(3px)')
  })
})
