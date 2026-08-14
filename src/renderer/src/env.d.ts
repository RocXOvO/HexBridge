/// <reference types="vite/client" />

import type { AugmentOverlayBridge, HexBridgeApi } from '../../shared/contracts'

declare global {
  interface Window {
    hexbridge?: HexBridgeApi
    hexbridgeOverlay?: AugmentOverlayBridge
  }
}

export {}
