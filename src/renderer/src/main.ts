import { createApp } from 'vue'
import App from './App.vue'
import AugmentOverlay from './AugmentOverlay.vue'
import CalibrationOverlay from './CalibrationOverlay.vue'
import ChampionPanel from './ChampionPanel.vue'
import { initializeState } from './state'
import './styles.css'

const route = window.location.hash.slice(1) || 'main'
document.documentElement.dataset.route = route
const component =
  route === 'champion'
    ? ChampionPanel
    : route === 'augment'
      ? AugmentOverlay
      : route === 'calibration'
      ? CalibrationOverlay
      : App

if (route === 'calibration') {
  // Calibration owns its own context IPC and must render while the parent
  // start-calibration request is still pending.
  createApp(component).mount('#app')
} else {
  void initializeState()
    .catch(() => undefined)
    .then(() => createApp(component).mount('#app'))
}
