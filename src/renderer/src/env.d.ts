/// <reference types="vite/client" />

import type { AugmentOverlayBridge, HexBridgeApi, LobbyBackgroundBridge } from '../../shared/contracts'

declare global {
  interface Window {
    hexbridge?: HexBridgeApi
    hexbridgeOverlay?: AugmentOverlayBridge
    hexbridgeLobbyBackground?: LobbyBackgroundBridge
  }
}

export {}
