import type { AppSettings, HexBridgeApi, RuntimeState } from '../../shared/contracts'

const champion = (
  id: number,
  alias: string,
  name: string,
  tier: number,
  winRate: number,
  roles: string[],
) => ({
  id,
  alias,
  name,
  title: '',
  roles,
  tier,
  winRate,
  patch: '16.15',
  date: '2026-08-10',
  source: 'tencent',
  iconUrl: `https://ddragon.leagueoflegends.com/cdn/16.15.1/img/champion/${alias}.png`,
  splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${alias}_0.jpg`,
})

export function createDemoApi(): HexBridgeApi {
  const champions = [
    champion(103, 'Ahri', '阿狸', 2, 0.528, ['法师', '刺客']),
    champion(81, 'Ezreal', '伊泽瑞尔', 1, 0.552, ['射手', '法师']),
    champion(63, 'Brand', '布兰德', 1, 0.547, ['法师']),
    champion(89, 'Leona', '蕾欧娜', 3, 0.514, ['坦克', '辅助']),
    champion(51, 'Caitlyn', '凯特琳', 2, 0.535, ['射手']),
    champion(154, 'Zac', '扎克', 2, 0.531, ['坦克', '战士']),
  ]
  const current = {
    ...champions[0]!,
    sourceType: 'current' as const,
    isCurrent: true,
    isBest: false,
    winRateDelta: 0,
  }
  const bench = champions.slice(1, 5).map((item, index) => ({
    ...item,
    sourceType: 'bench' as const,
    isCurrent: false,
    isBest: index === 0,
    winRateDelta: item.winRate - current.winRate,
  }))
  const settings: AppSettings = {
    visualMode: 'auto',
    autoOcr: true,
    showChampionPanel: true,
    showAugmentOverlay: true,
    hotkey: 'F8',
    gameDirectory: '',
    displayId: '',
    calibration: null,
    diagnosticsScreenshots: false,
  }
  const demoState: RuntimeState = {
    lcu: { connected: true, source: 'process', lastError: null, lastConnectedAt: Date.now() },
    snapshot: {
      phase: 'ChampSelect',
      locale: 'zh_CN',
      queueId: 2400,
      modeActive: true,
      matchStage: 'selecting',
      matchGeneration: 1,
      currentChampionId: current.id,
      benchChampionIds: bench.map((item) => item.id),
      benchEnabled: true,
      updatedAt: Date.now(),
    },
    api: {
      configured: true,
      status: 'ready',
      gamePatch: '16.15',
      dataVersion: '16.15.6',
      publishedAt: '2026-08-10',
      lastError: null,
    },
    update: {
      status: 'available',
      currentVersion: '0.1.7',
      availableVersion: '0.1.8',
      releaseName: 'HexBridge v0.1.8',
      releaseNotes: '预览模式的更新提示。',
      percent: null,
      transferred: null,
      total: 198_000_000,
      bytesPerSecond: null,
      lastCheckedAt: Date.now(),
      errorCode: null,
      message: '发现新版本 0.1.8',
    },
    champions,
    candidates: [current, ...bench],
    overlay: {
      visible: true,
      championId: current.id,
      detectedAt: Date.now(),
      message: '推荐已更新',
      slots: [
        { slot: 'left', rawText: '珠光护手', augmentId: 101, name: '珠光护手', confidence: .98, position: 2, tied: false, reason: '英雄专属 #8 / 167', iconUrl: '', rarityName: '棱彩' },
        { slot: 'center', rawText: '万用瞄准镜', augmentId: 102, name: '万用瞄准镜', confidence: .97, position: 1, tied: false, reason: '英雄专属 #3 / 167', iconUrl: '', rarityName: '金色' },
        { slot: 'right', rawText: '加速巫术', augmentId: 103, name: '加速巫术', confidence: .95, position: 3, tied: false, reason: '英雄专属 Tier 3', iconUrl: '', rarityName: '银色' },
      ],
    },
    settings,
    displays: [{ id: '1', label: '显示器 1（主）', width: 2560, height: 1440, scaleFactor: 1, primary: true }],
    diagnostics: {
      ocrReady: true,
      ocrBusy: false,
      ocrLastDurationMs: 284,
      ocrLastError: null,
      polling: true,
      activeVisualMode: 'balanced',
      gpuAcceleration: true,
      logLines: ['2026-08-11T10:18:03 INFO LCU credentials discovered', '2026-08-11T10:18:04 INFO Data catalogs updated'],
    },
  }

  return {
    getState: async () => demoState,
    onStateChanged: () => () => undefined,
    updateSettings: async (patch: Partial<AppSettings>) => {
      demoState.settings = { ...demoState.settings, ...patch }
      return demoState.settings
    },
    validateAndSaveApiKey: async () => ({ ok: true, message: '预览模式：验证成功' }),
    clearApiKey: async () => undefined,
    refreshData: async () => ({ ok: true, message: '预览模式：数据已刷新' }),
    checkForUpdates: async () => ({ ok: true, message: demoState.update.message }),
    downloadUpdate: async () => {
      demoState.update = { ...demoState.update, status: 'downloaded', percent: 100, message: '更新已下载' }
      return { ok: true, message: demoState.update.message }
    },
    installUpdate: async () => ({ ok: true, message: '预览模式：将重启安装' }),
    openReleasePage: async () => ({ ok: true, message: '预览模式：打开官方下载页' }),
    triggerOcr: async () => ({ ok: true, message: '预览模式：识别完成' }),
    clearDiagnosticScreenshots: async () => ({ ok: true, message: '预览模式：没有诊断截图' }),
    retryLcuConnection: async () => ({ ok: false, message: '预览模式：未连接客户端' }),
    startCalibration: async () => undefined,
    getCalibrationContext: async () => null,
    completeCalibration: async (rects) => { demoState.settings.calibration = rects },
    cancelCalibration: async () => undefined,
    windowAction: async () => undefined,
  }
}
