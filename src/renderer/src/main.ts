import { createApp } from 'vue'
import App from './App.vue'
import AugmentOverlay from './AugmentOverlay.vue'
import CalibrationOverlay from './CalibrationOverlay.vue'
import ChampionPanel from './ChampionPanel.vue'
import { initializeState } from './state'
import './styles.css'

const route = window.location.hash.slice(1) || 'main'
const component =
  route === 'champion'
    ? ChampionPanel
    : route === 'augment'
      ? AugmentOverlay
      : route === 'calibration'
        ? CalibrationOverlay
        : App

void initializeState().then(() => createApp(component).mount('#app'))
