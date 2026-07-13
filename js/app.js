// ============================================
// B-SIDE - App (Inizializzazione e Orchestrazione)
// ============================================

import { initUI, elements, initProgressBar, initVolumeControl, updateVolIcon, updateNav, initSegmentControls } from './ui.js';
import { initNetworkMonitoring } from './network.js';
import { initPositionTracking, initLifecycleManagement, initAudioEvents, updatePlayer, initPlayerControls } from './audio.js';
import { initTheme } from './theme.js';
import { initFavorites, updateFav } from './favorites.js';
import { initSleep } from './sleep.js';
import { initRandom } from './random.js';
import { initMediaSession, updateMediaSession } from './mediasession.js';
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

  // Imposta data corrente
  const today = new Date();
  elements.datePicker.value = today.toISOString().split('T')[0];
  elements.datePicker.max = elements.datePicker.value;

  // Inizializza tutti i moduli
  initNetworkMonitoring();
  initPositionTracking();
  initLifecycleManagement();
  initAudioEvents();
  initPlayerControls();
  initProgressBar();
  initSegmentControls();
  initVolumeControl();
  initTheme();
  initFavorites();
  initSleep();
  initRandom();
  initMediaSession();
  initInstall();
  initInfo();
  initToast();

  // Aggiorna stato iniziale
  updatePlayer();
  updateNav();
  updateFav();
  updateVolIcon();
  updateMediaSession();

  // Imposta volume iniziale
  elements.volumeFill.style.width = (elements.audio.volume * 100) + '%';

  // Pulisci posizioni vecchie
  cleanOldPositions();

  // Registra Service Worker
  registerServiceWorker();
}

// Avvia l'applicazione
init();
