// ============================================
// B-SIDE Radio - App (Inizializzazione e Orchestrazione)
// ============================================

import { initUI, elements, initProgressBar, initVolumeControl, updateVolIcon, updateNav } from './ui.js';
import { initNetworkMonitoring } from './network.js';
import { initPositionTracking, initLifecycleManagement, initAudioEvents, initPlayerControls } from './audio.js';
import { initTheme } from './theme.js';
import { initSleep } from './sleep.js';
import { initRandom, startRadio } from './random.js';
import { initMediaSession } from './mediasession.js';
import { initInstall, registerServiceWorker } from './install.js';
import { initInfo } from './info.js';
import { initToast } from './toast.js';
import { cleanOldPositions } from './storage.js';

/**
 * Inizializza l'applicazione
 */
function init() {
  // Inizializza riferimenti DOM
  initUI();

  // Data di partenza di default (stato interno; lo shuffle la sovrascrive subito)
  const today = new Date();
  elements.datePicker.value = today.toISOString().split('T')[0];

  // Inizializza tutti i moduli.
  // NB: initAudioEvents() deve girare PRIMA di initRandom(): i listener
  // 'ended'/'error' dello shuffle si registrano dopo quelli del motore audio
  // e dipendono da quell'ordine.
  initNetworkMonitoring();
  initPositionTracking();
  initLifecycleManagement();
  initAudioEvents();
  initPlayerControls();
  initProgressBar();
  initVolumeControl();
  initTheme();
  initSleep();
  initRandom();
  initMediaSession();
  initInstall();
  initInfo();
  initToast();

  // Stato iniziale dei controlli
  updateNav();
  updateVolIcon();

  // Imposta volume iniziale
  elements.volumeFill.style.width = (elements.audio.volume * 100) + '%';

  // Pulisci posizioni vecchie
  cleanOldPositions();

  // Registra Service Worker
  registerServiceWorker();

  // La radio è in shuffle per default: carica subito una prima puntata/sezione
  // casuale (in pausa, pronta a partire al primo play).
  startRadio();
}

// Avvia l'applicazione
init();
