// ============================================
// B-SIDE - Random (Shuffle Mode)
// ============================================

import { Engine, isPlaying } from './engine.js';
import { RANDOM_RANGE_START, RANDOM_RANGE_END } from './config.js';
import { formatDate } from './utils.js';
import { elements, updateNav, updateActiveSegment } from './ui.js';
import { updatePlayer, setShuffleNavigator } from './audio.js';
import { updateFav } from './favorites.js';
import { updateMediaSession } from './mediasession.js';
import { showToast } from './toast.js';

const MAX_CONSECUTIVE_ERRORS = 5;   // stop shuffle after this many unavailable episodes in a row
const MAX_HISTORY = 50;             // cap the back-navigation history

// Shuffle state (module-local, no cross-module coupling)
let shuffleMode = false;
let currentPart = null;   // 1..4: the quarter currently playing
let shuffleDate = null;   // date the shuffle last selected (detects manual episode changes)
let pendingMetaHandler = null;
let advancing = false;    // a jump's source is loading; gates auto-advance re-entry
let errorStreak = 0;

// Back-navigation history of {date, part} entries
let history = [];
let historyIndex = -1;

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
 * Also clears the `advancing` gate once the new source is ready.
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
    advancing = false;
  };

  Engine.audio.addEventListener('loadedmetadata', pendingMetaHandler);
}

/**
 * Keeps the "next" button (next to play) enabled in shuffle mode even on
 * today's date, since it means "next random", not "tomorrow".
 */
function keepForwardEnabled() {
  if (shuffleMode) elements.nextDay.disabled = false;
}

/**
 * Loads a specific episode + part and starts playback from that quarter
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} part - Quarter of the show (1..4)
 */
function playRandom(date, part) {
  advancing = true;
  currentPart = part;
  shuffleDate = date;

  elements.datePicker.value = date;
  updatePlayer();
  updateNav();
  keepForwardEnabled();
  updateFav();
  updateMediaSession();

  seekToPartOnMeta(part);

  Engine.intent.shouldBePlaying = true;

  showToast('Puntata del ' + formatDate(date) + ' · Parte ' + part);
}

/**
 * Jumps forward to a new random episode + part.
 * Used by the next button, auto-advance at section end, and error skip.
 */
function forwardRandom() {
  const next = pickNext();

  // A forward move from a back position discards the abandoned tail
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(next);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;

  playRandom(next.date, next.part);
}

/**
 * Restarts the current section from its beginning (in-place seek)
 */
function restartCurrentSection() {
  const audio = Engine.audio;
  if (!audio.duration || currentPart === null) return;
  const target = ((currentPart - 1) / 4) * audio.duration;
  Engine.position.current = target;
  audio.currentTime = target;
  updateActiveSegment(target, audio.duration);
}

/**
 * Goes back to the previous entry in history, or restarts the current
 * section from its beginning when already at the start of history.
 */
function goBack() {
  if (historyIndex > 0) {
    historyIndex--;
    const entry = history[historyIndex];
    playRandom(entry.date, entry.part);
  } else {
    restartCurrentSection();
  }
}

/**
 * Enables shuffle mode. If something is already playing, shuffle takes over at
 * the end of the current section; otherwise it picks and plays immediately.
 */
function activateShuffle() {
  shuffleMode = true;
  elements.randomBtn.classList.add('shuffle-on');
  history = [];
  errorStreak = 0;
  advancing = false;

  const audio = Engine.audio;
  if (isPlaying && audio.duration) {
    // Keep current playback; the boundary/ended engine advances at section end
    const part = Math.min(4, Math.floor((audio.currentTime / audio.duration) * 4) + 1);
    currentPart = part;
    shuffleDate = elements.datePicker.value;
    history = [{ date: shuffleDate, part: part }];
    historyIndex = 0;
    keepForwardEnabled();
    showToast('Shuffle attivo — parte a fine sezione');
  } else {
    historyIndex = -1;
    showToast('Shuffle attivo');
    forwardRandom();
  }
}

/**
 * Disables shuffle mode. Playback is left untouched; only the mode ends.
 */
function deactivateShuffle() {
  shuffleMode = false;
  elements.randomBtn.classList.remove('shuffle-on');
  history = [];
  historyIndex = -1;
  updateNav(); // restore normal day-navigation button states
  showToast('Shuffle disattivato');
}

/**
 * Toggles shuffle mode on/off (the shuffle button click handler)
 */
function toggleShuffle() {
  if (shuffleMode) deactivateShuffle();
  else activateShuffle();
}

// --- Shuffle engine (audio event listeners) ---

/**
 * Drives auto-advance at the section boundary and lazily deactivates the mode
 * when the user has manually switched to a different episode.
 */
function onTimeUpdate() {
  if (!shuffleMode) return;

  // The user manually changed the episode: leave shuffle mode.
  if (shuffleDate && elements.datePicker.value !== shuffleDate) {
    deactivateShuffle();
    return;
  }

  // A jump's source is still loading: don't evaluate the boundary yet.
  if (advancing) return;

  const audio = Engine.audio;
  if (!audio.duration || currentPart === null) return;

  // Parts 1-3 advance at their quarter boundary; part 4 is handled by 'ended'.
  if (currentPart < 4) {
    const boundary = (currentPart / 4) * audio.duration;
    if (audio.currentTime >= boundary) {
      forwardRandom();
    }
  }
}

/**
 * When an episode ends naturally (covers part 4, or a missed boundary),
 * advance the shuffle. Runs after audio.js's own 'ended' handler.
 */
function onEnded() {
  if (shuffleMode && !advancing && currentPart !== null) {
    forwardRandom();
  }
}

/**
 * On an unavailable episode during shuffle, move on to a new one after the
 * "episode unavailable" warning, capping consecutive failures.
 */
function onError() {
  if (!shuffleMode) return;

  const err = Engine.audio.error;
  if (err && err.code === 4) {
    advancing = false;
    errorStreak++;
    if (errorStreak >= MAX_CONSECUTIVE_ERRORS) {
      deactivateShuffle();
      showToast('Shuffle interrotto: troppe puntate non disponibili', 'error', 4000);
      errorStreak = 0;
      return;
    }
    setTimeout(forwardRandom, 400);
  }
}

/**
 * Resets the failure counter once playback actually starts.
 */
function onPlaying() {
  errorStreak = 0;
}

/**
 * Initializes shuffle mode.
 * Tap the shuffle button to toggle the mode on/off. In shuffle mode the
 * prev/next buttons next to play navigate the shuffle instead of the day.
 */
export function initRandom() {
  elements.randomBtn.addEventListener('click', toggleShuffle);

  Engine.audio.addEventListener('timeupdate', onTimeUpdate);
  Engine.audio.addEventListener('ended', onEnded);
  Engine.audio.addEventListener('error', onError);
  Engine.audio.addEventListener('playing', onPlaying);

  // Let the day buttons next to play drive the shuffle when it is active
  setShuffleNavigator({
    isActive: function() { return shuffleMode; },
    next: forwardRandom,
    prev: goBack
  });
}
