// ============================================
// B-SIDE - Audio (Eventi e Controlli Playback)
// ============================================

import { Engine, isPlaying, setIsPlaying } from './engine.js';
import { formatTime, formatDate, buildUrl } from './utils.js';
import { savePositionToStorage, loadPositionFromStorage } from './storage.js';
import { clearRecoveryTimers, scheduleRecovery, recoverySuccess, executeRecovery } from './network.js';
import { elements, updatePlayIcon, updateBufferHealth, getProgressDragging, updateNav, updateActiveSegment } from './ui.js';
import { updateFav } from './favorites.js';
import { updateMediaSession, updatePositionState } from './mediasession.js';
import { showToast } from './toast.js';

// Optional shuffle navigator: when shuffle mode is active it overrides the
// prev/next day buttons next to the play control. Injected by random.js at
// init time to keep the dependency one-way (audio.js never imports random.js).
let shuffleNavigator = null;
export function setShuffleNavigator(nav) {
  shuffleNavigator = nav;
}

/**
 * Inizializza il tracciamento della posizione
 */
export function initPositionTracking() {
  Engine.position.saveInterval = setInterval(function() {
    if (isPlaying && Engine.audio.currentTime > 0) {
      Engine.position.current = Engine.audio.currentTime;

      if (Math.abs(Engine.audio.currentTime - Engine.position.lastSaved) > 5) {
        savePositionToStorage(elements.datePicker.value);
      }
    }
  }, 1000);
}

/**
 * Inizializza la gestione del ciclo di vita della pagina
 */
export function initLifecycleManagement() {
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      if (isPlaying) {
        Engine.position.current = Engine.audio.currentTime;
      }
      savePositionToStorage(elements.datePicker.value);
    } else {
      if (Engine.intent.shouldBePlaying && !isPlaying) {
        setTimeout(function() {
          if (Engine.intent.shouldBePlaying && !isPlaying) {
            executeRecovery();
          }
        }, 300);
      }
    }
  });
}

/**
 * Inizializza tutti gli eventi audio
 */
export function initAudioEvents() {
  const audio = Engine.audio;

  audio.addEventListener('loadedmetadata', function() {
    elements.remainingTime.textContent = '-' + formatTime(audio.duration);
    updatePositionState();
  });

  audio.addEventListener('canplay', function() {
    if (Engine.intent.shouldBePlaying && audio.paused) {
      if (Engine.position.current > 0 && audio.duration && Engine.position.current < audio.duration - 1) {
        audio.currentTime = Engine.position.current;
      }
      audio.play().catch(function() {});
    }
  });

  audio.addEventListener('playing', function() {
    setIsPlaying(true);
    updatePlayIcon(true);
    recoverySuccess();
    updatePositionState();
  });

  audio.addEventListener('pause', function() {
    setIsPlaying(false);
    updatePlayIcon(false);
  });

  audio.addEventListener('timeupdate', function() {
    if (getProgressDragging()) return;

    if (!audio.paused && audio.currentTime > 0) {
      Engine.position.current = audio.currentTime;
    }

    updateBufferHealth();

    const pct = (audio.currentTime / audio.duration) * 100 || 0;
    elements.progressFill.style.width = pct + '%';
    elements.currentTime.textContent = formatTime(audio.currentTime);
    elements.remainingTime.textContent = '-' + formatTime(audio.duration - audio.currentTime);
    updateActiveSegment(audio.currentTime, audio.duration);
  });

  audio.addEventListener('stalled', function() {
    if (!Engine.intent.shouldBePlaying) return;

    setTimeout(function() {
      if (Engine.intent.shouldBePlaying && (audio.paused || audio.readyState < 3)) {
        scheduleRecovery();
      }
    }, 4000);
  });

  audio.addEventListener('waiting', function() {
    if (!Engine.intent.shouldBePlaying) return;

    setTimeout(function() {
      if (Engine.intent.shouldBePlaying && (audio.paused || audio.readyState < 3)) {
        scheduleRecovery();
      }
    }, 6000);
  });

  audio.addEventListener('error', function() {
    const err = audio.error;

    if (Engine.position.current > 0) {
      savePositionToStorage(elements.datePicker.value);
    }

    setIsPlaying(false);
    updatePlayIcon(false);

    if (!Engine.intent.shouldBePlaying) return;

    // Errore 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (puntata non disponibile)
    if (err && err.code === 4 && !Engine.recovery.isActive && navigator.onLine) {
      Engine.intent.shouldBePlaying = false;
      clearRecoveryTimers();
      showToast('Puntata non disponibile', 'error', 4000);
      return;
    }

    scheduleRecovery();
  });

  audio.addEventListener('ended', function() {
    setIsPlaying(false);
    updatePlayIcon(false);
    Engine.intent.shouldBePlaying = false;
    Engine.position.current = 0;
    clearRecoveryTimers();
    localStorage.removeItem('bside-pos-' + elements.datePicker.value);
  });
}

/**
 * Aggiorna il player per una nuova data
 */
export function updatePlayer() {
  const d = elements.datePicker.value;
  const url = buildUrl(d);

  clearRecoveryTimers();

  Engine.currentUrl = url;
  Engine.position.current = loadPositionFromStorage(d);
  Engine.position.lastSaved = Engine.position.current;
  Engine.recovery.attempt = 0;
  Engine.recovery.isActive = false;
  Engine.intent.shouldBePlaying = false;

  Engine.audio.src = url;

  elements.episodeDate.textContent = formatDate(d);
  elements.dateDisplay.textContent = formatDate(d);

  setIsPlaying(false);
  updatePlayIcon(false);

  elements.progressFill.style.width = '0%';
  elements.bufferBar.style.width = '0%';
  elements.currentTime.textContent = formatTime(Engine.position.current);
  elements.remainingTime.textContent = '-0:00';
}

/**
 * Inizializza i controlli del player
 */
export function initPlayerControls() {
  // Date picker
  elements.datePickerBtn.addEventListener('click', function() {
    elements.datePicker.showPicker();
  });

  elements.datePicker.addEventListener('change', function() {
    updatePlayer();
    updateNav();
    updateFav();
    updateMediaSession();
  });

  // Play/Pause
  elements.playBtn.addEventListener('click', handlePlayPause);

  // Skip buttons
  elements.skipBack.addEventListener('click', function() {
    const t = Math.max(0, Engine.audio.currentTime - 30);
    Engine.position.current = t;
    Engine.audio.currentTime = t;
  });

  elements.skipForward.addEventListener('click', function() {
    const t = Engine.audio.currentTime + 30;
    Engine.position.current = t;
    Engine.audio.currentTime = t;
  });

  // Day navigation (buttons next to the play control).
  // In shuffle mode these become "previous / next in the shuffle".
  elements.prevDay.addEventListener('click', function() {
    if (shuffleNavigator && shuffleNavigator.isActive()) { shuffleNavigator.prev(); return; }
    changeDay(-1);
  });

  elements.nextDay.addEventListener('click', function() {
    if (shuffleNavigator && shuffleNavigator.isActive()) { shuffleNavigator.next(); return; }
    changeDay(1);
  });

  // Date-bar arrows: always plain day navigation.
  elements.prevDayNav.addEventListener('click', function() {
    changeDay(-1);
  });

  elements.nextDayNav.addEventListener('click', function() {
    changeDay(1);
  });
}

/**
 * Gestisce il click su play/pause
 */
function handlePlayPause() {
  if (isPlaying) {
    Engine.intent.shouldBePlaying = false;
    Engine.recovery.isActive = false;
    Engine.position.current = Engine.audio.currentTime;
    clearRecoveryTimers();
    Engine.audio.pause();
    savePositionToStorage(elements.datePicker.value);
  } else {
    Engine.intent.shouldBePlaying = true;
    Engine.recovery.isActive = false;
    Engine.recovery.attempt = 0;
    clearRecoveryTimers();

    const targetTime = Engine.position.current;

    if (!Engine.audio.src || Engine.audio.error || Engine.audio.readyState === 0) {
      const url = buildUrl(elements.datePicker.value);
      Engine.currentUrl = url;
      Engine.audio.src = url;

      function onReady() {
        Engine.audio.removeEventListener('canplay', onReady);
        Engine.audio.removeEventListener('error', onLoadErr);

        if (targetTime > 0 && Engine.audio.duration && targetTime < Engine.audio.duration - 1) {
          Engine.audio.currentTime = targetTime;
        }

        Engine.audio.play().catch(function() {
          Engine.intent.shouldBePlaying = false;
        });
      }

      function onLoadErr() {
        Engine.audio.removeEventListener('canplay', onReady);
        Engine.audio.removeEventListener('error', onLoadErr);
        Engine.intent.shouldBePlaying = false;
        setIsPlaying(false);
        updatePlayIcon(false);
      }

      Engine.audio.addEventListener('canplay', onReady);
      Engine.audio.addEventListener('error', onLoadErr);
      Engine.audio.load();
    } else {
      if (targetTime > 0 && Engine.audio.duration && targetTime < Engine.audio.duration - 1) {
        Engine.audio.currentTime = targetTime;
      }

      Engine.audio.play().catch(function(e) {
        if (e.name === 'NotAllowedError') {
          Engine.intent.shouldBePlaying = false;
        } else {
          const url = buildUrl(elements.datePicker.value);
          Engine.currentUrl = url;
          Engine.audio.src = url + '?_t=' + Date.now();

          Engine.audio.addEventListener('canplay', function onR() {
            Engine.audio.removeEventListener('canplay', onR);
            if (targetTime > 0 && Engine.audio.duration) {
              Engine.audio.currentTime = targetTime;
            }
            Engine.audio.play().catch(function() {
              Engine.intent.shouldBePlaying = false;
            });
          });

          Engine.audio.load();
        }
      });
    }
  }
}

/**
 * Cambia giorno
 * @param {number} delta - Numero di giorni da aggiungere/sottrarre
 */
function changeDay(delta) {
  const d = new Date(elements.datePicker.value);
  d.setDate(d.getDate() + delta);
  const str = d.toISOString().split('T')[0];

  if (str <= elements.datePicker.max) {
    elements.datePicker.value = str;
    updatePlayer();
    updateNav();
    updateFav();
    updateMediaSession();
  }
}
