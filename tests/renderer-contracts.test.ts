import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('../src/renderer/src/App.vue', import.meta.url), 'utf8')
const rendererEntry = readFileSync(new URL('../src/renderer/src/main.ts', import.meta.url), 'utf8')
const windowManager = readFileSync(new URL('../src/main/window-manager.ts', import.meta.url), 'utf8')
const mainProcess = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')

describe('main-window recommendation presentation', () => {
  it('does not create or route a full-screen augment renderer', () => {
    expect(rendererEntry).not.toContain("route === 'augment'")
    expect(windowManager).not.toContain("createWindow('augment'")
    expect(windowManager).not.toContain("windows.get('augment'")
  })

  it('starts the guarded shutdown path before the tray asks Electron to quit', () => {
    expect(mainProcess).toContain("{ label: '退出', click: quitApplication }")
    expect(mainProcess).toContain('runtime?.getWindowManager().prepareToQuit()')
    expect(windowManager).toContain('this.activityChanged = null')
  })

  it('keeps the raw Tier label visibly rendered instead of replacing it with a strength adjective', () => {
    expect(appSource).toContain('class="rank-tier"')
    expect(appSource).toContain('<small>Tier</small><b>{{ tier(item.tier) }}</b>')
    expect(appSource).not.toContain('强度顶尖')
    expect(appSource).not.toContain('tierLabel(')
  })

  it('labels pick rate as champion-specific secondary data in the main assistant', () => {
    expect(appSource).toContain('该英雄选取率')
    expect(appSource).toContain('优先采用上游提供的英雄专属推荐顺序')
    expect(appSource).toContain('data.dtodo 单英雄统计')
    expect(appSource).toContain('选取率仅作参考')
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

  it('exposes one compact update intent without a separate update page or confirmation copy', () => {
    expect(appSource).toContain('class="title-update-action"')
    expect(appSource).toContain('api.applyUpdate()')
    expect(appSource).not.toContain("page === 'updates'")
    expect(appSource).not.toContain('确认下载')
    expect(appSource).not.toContain('确认重启安装')
  })

  it('renders user-facing update and diagnostic status in Chinese', () => {
    expect(appSource).toContain("MATCHED: '识别完成'")
    expect(appSource).toContain("ready: '已就绪'")
    expect(appSource).not.toContain('{{ state.api.status }}')
    expect(appSource).not.toContain('{{ state.diagnostics.manualOcrCode }}')
    expect(appSource).not.toContain('CHAMPION DETECTED')
    expect(appSource).not.toContain('LCU CONNECTED')
    expect(appSource).not.toContain('SEARCHING FOR LCU')
  })
})
