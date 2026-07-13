// ============================================
// B-SIDE - Random (Random Episode Playback + Continuous Shuffle)
// ============================================

import { Engine } from './engine.js';
import { RANDOM_RANGE_START, RANDOM_RANGE_END } from './config.js';
import { formatDate } from './utils.js';
import { elements, updateNav, updateActiveSegment } from './ui.js';
import { updatePlayer } from './audio.js';
import { updateFav } from './favorites.js';
import { updateMediaSession } from './mediasession.js';
import { showToast } from './toast.js';

const LONG_PRESS_MS = 550;          // hold duration that toggles continuous mode
const MAX_CONSECUTIVE_ERRORS = 5;   // stop the shuffle after this many unavailable episodes in a row

// Continuous shuffle state (module-local, no cross-module coupling)
let continuousMode = false;
let currentPart = null;   // 1..4: the quarter currently playing after a shuffle jump
let shuffleDate = null;   // date the shuffle last selected (detects manual episode changes)
let pendingMetaHandler = null;
let jumping = false;      // guards against re-entrant jumps during a source swap
let errorStreak = 0;

/**
 * Picks a random weekday (Mon-Fri) within the configured date range
 * @returns {string} - Date in YYYY-MM-DD format
 */
function pickRandomWeekday() {
  const dayMs = 24 * 60 * 60 * 1000;
  // Date-only strings parse as UTC midnight, so day math stays timezone-safe
  const startMs = Date.parse(RANDOM_RANGE_START);
  const endMs = Date.parse(RANDOM_RANGE_END);
  const candidates = [];

  for (let t = startMs; t <= endMs; t += dayMs) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      candidates.push(d.toISOString().split('T')[0]);
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Picks a random (date, part) that differs from what is playing now
 * @returns {{date: string, part: number}}
 */
function pickNext() {
  let date, part;
  do {
    date = pickRandomWeekday();
    part = Math.floor(Math.random() * 4) + 1;
  } while (date === shuffleDate && part === currentPart);
  return { date, part };
}

/**
 * Registers a one-shot loadedmetadata handler that seeks to the given part.
 * The seek target depends on the episode duration, known only once metadata
 * loads; the existing canplay handler then performs the actual seek + play.
 * Any previously pending handler is removed first to avoid stacking on rapid jumps.
 * @param {number} part - Quarter of the show (1..4)
 */
function seekToPartOnMeta(part) {
  if (pendingMetaHandler) {
    Engine.audio.removeEventListener('loadedmetadata', pendingMetaHandler);
    pendingMetaHandler = null;
  }

  pendingMetaHandler = function onMeta() {
    Engine.audio.removeEventListener('loadedmetadata', onMeta);
    pendingMetaHandler = null;
    const target = ((part - 1) / 4) * Engine.audio.duration;
    Engine.position.current = target;
    updateActiveSegment(target, Engine.audio.duration);
  };

  Engine.audio.addEventListener('loadedmetadata', pendingMetaHandler);
}

/**
 * Loads a specific random episode + part and starts playback from that quarter
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} part - Quarter of the show (1..4)
 */
function playRandom(date, part) {
  currentPart = part;
  shuffleDate = date;

  elements.datePicker.value = date;
  updatePlayer();
  updateNav();
  updateFav();
  updateMediaSession();

  seekToPartOnMeta(part);

  Engine.intent.shouldBePlaying = true;

  showToast('Puntata del ' + formatDate(date) + ' · Parte ' + part);
}

/**
 * Jumps to the next random episode + part (used by tap, skip and auto-advance)
 */
function jumpNext() {
  if (jumping) return;
  jumping = true;

  const { date, part } = pickNext();
  playRandom(date, part);

  // Release the guard once the source swap has reset currentTime/duration
  setTimeout(function() { jumping = false; }, 300);
}

/**
 * Enables or disables continuous shuffle mode
 * @param {boolean} on
 */
function setContinuous(on) {
  if (continuousMode === on) return;
  continuousMode = on;
  elements.randomBtn.classList.toggle('shuffle-on', on);
  showToast(on ? 'Shuffle continuo attivo' : 'Shuffle continuo disattivato');
}

// --- Continuous shuffle engine (audio event listeners) ---

/**
 * Drives auto-advance at the quarter boundary and lazily deactivates the mode
 * when the user has manually switched to a different episode.
 */
function onTimeUpdate() {
  if (!continuousMode) return;

  // The user manually changed the episode: leave continuous mode.
  if (shuffleDate && elements.datePicker.value !== shuffleDate) {
    setContinuous(false);
    return;
  }

  const audio = Engine.audio;
  if (!audio.duration || currentPart === null) return;

  // Parts 1-3 jump at their quarter boundary; part 4 is handled by 'ended'.
  if (currentPart < 4) {
    const boundary = (currentPart / 4) * audio.duration;
    if (audio.currentTime >= boundary) {
      jumpNext();
    }
  }
}

/**
 * When an episode ends naturally (covers part 4, or a missed boundary),
 * continue the shuffle. Runs after audio.js's own 'ended' handler.
 */
function onEnded() {
  if (continuousMode && currentPart !== null) {
    jumpNext();
  }
}

/**
 * On an unavailable episode during continuous mode, skip to another one,
 * capping consecutive failures to avoid hammering the network.
 */
function onError() {
  if (!continuousMode) return;

  const err = Engine.audio.error;
  if (err && err.code === 4) {
    errorStreak++;
    if (errorStreak >= MAX_CONSECUTIVE_ERRORS) {
      setContinuous(false);
      showToast('Shuffle interrotto: troppe puntate non disponibili', 'error', 4000);
      errorStreak = 0;
      return;
    }
    setTimeout(jumpNext, 400);
  }
}

/**
 * Resets the failure counter once playback actually starts.
 */
function onPlaying() {
  errorStreak = 0;
}

/**
 * Initializes the random episode button.
 * Short tap = one-shot random (or skip to next when continuous is active).
 * Long press = toggle continuous shuffle mode.
 */
export function initRandom() {
  const btn = elements.randomBtn;
  let pressTimer = null;
  let longPressed = false;

  function startPress(e) {
    if (e.button && e.button !== 0) return; // primary button / touch only
    longPressed = false;
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    pressTimer = setTimeout(function() {
      pressTimer = null;
      longPressed = true;
      setContinuous(!continuousMode);
    }, LONG_PRESS_MS);
  }

  function endPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (longPressed) {
      longPressed = false; // long press already toggled the mode; ignore the tap
      return;
    }
    jumpNext();
  }

  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    longPressed = false;
  }

  btn.addEventListener('pointerdown', startPress);
  btn.addEventListener('pointerup', endPress);
  btn.addEventListener('pointercancel', cancelPress);
  btn.addEventListener('contextmenu', function(e) { e.preventDefault(); });

  // Self-contained continuous shuffle engine
  Engine.audio.addEventListener('timeupdate', onTimeUpdate);
  Engine.audio.addEventListener('ended', onEnded);
  Engine.audio.addEventListener('error', onError);
  Engine.audio.addEventListener('playing', onPlaying);
}
