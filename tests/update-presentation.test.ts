import { describe, expect, it } from 'vitest'
import type { AppUpdateState, AppUpdateStatus } from '../src/shared/contracts.js'
import { describeUpdateAction, shouldShowUpdateAction } from '../src/shared/update-presentation.js'

function updateState(status: AppUpdateStatus, patch: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    status,
    currentVersion: '0.1.19',
    availableVersion: null,
    releaseName: null,
    releaseNotes: '',
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    downloadMode: null,
    downloadModeMessage: '',
    lastCheckedAt: null,
    errorCode: null,
    message: '',
    ...patch,
  }
}

describe('compact update presentation', () => {
  it.each(['unsupported', 'up-to-date'] as const)('hides the action for %s', (status) => {
    expect(shouldShowUpdateAction(status)).toBe(false)
  })

  it.each(['idle', 'checking', 'available', 'downloading', 'downloaded', 'installing', 'error'] as const)(
    'keeps the action visible for %s',
    (status) => expect(shouldShowUpdateAction(status)).toBe(true),
  )

  it('describes every actionable state without claiming that the latest version needs action', () => {
    expect(describeUpdateAction(updateState('idle'), false)).toBe('检查更新')
    expect(describeUpdateAction(updateState('checking'), false)).toBe('检查中…')
    expect(describeUpdateAction(updateState('available', { availableVersion: '0.1.19' }), false)).toBe('更新至 v0.1.19')
    expect(describeUpdateAction(updateState('downloading', { percent: 38.6 }), false)).toBe('39%')
    expect(describeUpdateAction(updateState('downloaded'), false)).toBe('重启更新')
    expect(describeUpdateAction(updateState('installing'), false)).toBe('更新中…')
    expect(describeUpdateAction(updateState('error', { availableVersion: '0.1.19' }), false)).toBe('重试更新')
    expect(describeUpdateAction(updateState('error'), false)).toBe('重试检查')
    expect(describeUpdateAction(updateState('up-to-date'), false)).toBe('')
  })

  it('uses the match guard label before any update action', () => {
    expect(describeUpdateAction(updateState('available', { availableVersion: '0.1.19' }), true)).toBe('对局后更新')
  })
})
