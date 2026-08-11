/// <reference types="vite/client" />

import type { HexBridgeApi } from '../../shared/contracts'

declare global {
  interface Window {
    hexbridge?: HexBridgeApi
  }
}

export {}
