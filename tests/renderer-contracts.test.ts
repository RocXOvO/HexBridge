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
    expect(appSource).toContain('按上游 rank 排序')
    expect(appSource).toContain('data.dtodo 单英雄统计')
    expect(appSource).toContain('结果只在主窗口更新')
  })
})
