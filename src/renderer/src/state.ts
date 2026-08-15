import { computed, ref } from 'vue'
import type {
  AppSettings,
  HexBridgeApi,
  RuntimeState,
} from '../../shared/contracts'

const defaultViewSettings: AppSettings = {
  visualMode: 'auto',
  autoOcr: false,
  showChampionPanel: true,
  showInGameRecommendations: true,
  opponentScouting: false,
  lobbyBackground: false,
  wallpaperEngineEnabled: false,
  recommendationDataSource: 'dtodo',
  hotkey: 'F8',
  displayId: '',
  calibration: null,
  diagnosticsScreenshots: false,
}

const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_HEXBRIDGE_DEMO === 'true'
const bridgeUnavailable = !window.hexbridge && !demoEnabled
const unavailableState: RuntimeState = {
  lcu: {
    connected: false,
    source: null,
    lastError: '安全桥接未加载，请重新安装或查看启动日志',
    lastConnectedAt: null,
  },
  snapshot: {
    phase: 'None',
    locale: 'zh_CN',
    queueId: null,
    modeActive: false,
    matchStage: 'none',
    matchGeneration: 0,
    currentChampionId: null,
    benchChampionIds: [],
    benchEnabled: false,
    updatedAt: Date.now(),
  },
  api: {
    configured: false,
    status: 'error',
    gamePatch: '',
    dataVersion: '',
    publishedAt: '',
    lastError: 'Renderer preload bridge unavailable',
  },
  recommendation: {
    source: 'dtodo',
    status: 'error',
    snapshotId: '',
    dataVersion: '',
    statisticsDate: '',
    stale: false,
    lastError: 'Renderer preload bridge unavailable',
  },
  update: {
    status: 'unsupported',
    currentVersion: '0.1.38',
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
    message: '安全桥接未加载',
  },
  releaseHighlights: null,
  champions: [],
  candidates: [],
  currentRecommendation: null,
  currentBuild: null,
  opponentScout: {
    status: 'disabled',
    reason: 'disabled',
    matchGeneration: null,
    allies: [],
    opponents: [],
    sampledAt: null,
    source: null,
    message: '对手近期状态实验未开启',
  },
  overlay: { visible: false, championId: null, slots: [], detectedAt: null, message: '不可用' },
  wallpaperEngine: {
    supported: false,
    configured: false,
    status: 'not-installed',
    championId: null,
    errorCode: 'BRIDGE_UNAVAILABLE',
    message: '安全桥接不可用',
  },
  settings: { ...defaultViewSettings },
  displays: [],
  diagnostics: {
    ocrReady: false,
    ocrBusy: false,
    ocrLastDurationMs: null,
    ocrLastError: 'Renderer preload bridge unavailable',
    manualOcrStatus: 'idle',
    manualOcrCode: 'IDLE',
    manualOcrSource: null,
    manualOcrTriggeredAt: null,
    manualOcrMessage: '尚未手动识别',
    polling: false,
    activeVisualMode: 'eco',
    gpuAcceleration: false,
    presentation: {
      observer: 'stopped',
      championCompanion: 'ineligible',
      augmentCompanion: 'inactive',
    },
    logLines: ['HexBridge 安全桥接初始化失败，未启用演示数据。'],
  },
}

const state = ref<RuntimeState>(structuredClone(unavailableState))
const ready = ref(false)

const unavailableApi: HexBridgeApi = {
  getState: async () => unavailableState,
  onStateChanged: () => () => undefined,
  updateSettings: async () => unavailableState.settings,
  setOcrHotkey: async () => ({
    ok: false,
    activeHotkey: unavailableState.settings.hotkey,
    errorCode: 'BRIDGE_UNAVAILABLE',
    message: '安全桥接不可用',
  }),
  validateAndSaveApiKey: async () => ({ ok: false, message: '安全桥接未加载' }),
  clearApiKey: async () => undefined,
  refreshData: async () => ({ ok: false, message: '安全桥接未加载' }),
  getChampionRecommendation: async () => ({ ok: false, message: '安全桥接未加载', detail: null }),
  applyUpdate: async () => ({ ok: false, message: '安全桥接未加载' }),
  openDeveloperPage: async () => ({ ok: false, message: '安全桥接未加载' }),
  dismissReleaseHighlights: async () => undefined,
  triggerOcr: async () => ({ ok: false, message: '安全桥接未加载' }),
  retryOpponentScout: async () => ({ ok: false, message: '安全桥接未加载' }),
  getScoutPlayerDetails: async () => ({ ok: false, message: '安全桥接未加载', details: null }),
  getWallpaperEnginePreferences: async () => ({
    championTargetType: 'profile',
    championTargetTemplate: 'HexBridge-{id}',
    restoreTarget: null,
  }),
  saveWallpaperEnginePreferences: async () => ({ ok: false, message: '安全桥接未加载' }),
  retryWallpaperEngine: async () => ({ ok: false, message: '安全桥接未加载' }),
  clearDiagnosticScreenshots: async () => ({ ok: false, message: '安全桥接未加载' }),
  retryLcuConnection: async () => ({ ok: false, message: '安全桥接未加载' }),
  startCalibration: async () => undefined,
  getCalibrationContext: async () => null,
  previewCalibration: async () => ({ ok: false, names: [], message: '安全桥接未加载' }),
  completeCalibration: async () => undefined,
  cancelCalibration: async () => undefined,
  windowAction: async () => undefined,
}

export let api: HexBridgeApi = window.hexbridge ?? unavailableApi
let unsubscribe: (() => void) | null = null

export async function initializeState(): Promise<void> {
  try {
    if (import.meta.env.DEV) {
      if (demoEnabled && !window.hexbridge) {
        const { createDemoApi } = await import('./demo-state')
        api = createDemoApi()
      }
    }
    state.value = await api.getState()
    unsubscribe?.()
    unsubscribe = api.onStateChanged((next) => { state.value = next })
  } finally {
    ready.value = true
  }
}

export function useRuntime() {
  return {
    state: computed(() => state.value),
    ready: computed(() => ready.value),
    isPreview: demoEnabled && !window.hexbridge,
    bridgeError: bridgeUnavailable,
  }
}
