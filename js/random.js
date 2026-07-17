// ============================================
// B-SIDE Radio - Shuffle (modalità di default)
// ============================================
//
// La radio è SEMPRE in shuffle: al caricamento carica una prima puntata/sezione
// casuale (in pausa) e da lì scorre in continuazione. Le frecce di transport
// navigano lo shuffle: avanti = nuova puntata+sezione casuale, indietro =
// cronologia (o restart della sezione corrente quando si è all'inizio).
//
// Dependency injection: audio.js espone setShuffleNavigator() e le frecce
// prev/next gli deferiscono. initAudioEvents() (in audio.js) DEVE girare prima
// di initRandom(): i listener 'ended'/'error' qui sotto si registrano dopo
// quelli del motore audio e dipendono da quell'ordine.

import { Engine } from './engine.js';
import { RANDOM_RANGE_START, RANDOM_RANGE_END } from './config.js';
import { formatDate } from './utils.js';
import { elements, updateActiveSegment } from './ui.js';
import { updatePlayer, setShuffleNavigator } from './audio.js';
import { updateMediaSession } from './mediasession.js';
import { showToast } from './toast.js';

const MAX_CONSECUTIVE_ERRORS = 5;   // stop the radio after this many unavailable episodes in a row
const MAX_HISTORY = 50;             // cap the back-navigation history

// Shuffle state (module-local, no cross-module coupling)
let currentPart = null;   // 1..4: the quarter currently playing
let shuffleDate = null;   // date the shuffle last selected
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
 * Loads a specific episode + part and seeks playback to that quarter.
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} part - Quarter of the show (1..4)
 * @param {boolean} autoplay - whether to start playing once the source is ready
 */
function playRandom(date, part, autoplay) {
  advancing = true;
  currentPart = part;
  shuffleDate = date;

  elements.datePicker.value = date;
  updatePlayer();          // loads the new source (paused, intent reset)
  updateMediaSession();

  seekToPartOnMeta(part);

  // updatePlayer() clears the intent; re-arm it only when we want to keep going.
  if (autoplay) Engine.intent.shouldBePlaying = true;

  showToast('Puntata del ' + formatDate(date) + ' · Parte ' + part);
}

/**
 * Jumps forward to a new random episode + part.
 * Used by the next arrow, auto-advance at section end, and error skip.
 * @param {boolean} autoplay - whether to start playing immediately
 */
function forwardRandom(autoplay) {
  const next = pickNext();

  // A forward move from a back position discards the abandoned tail
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(next);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;

  playRandom(next.date, next.part, autoplay);
}

/**
 * Restarts the current section from its beginning (in-place seek).
 * Leaves the play/pause state untouched.
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
    playRandom(entry.date, entry.part, true);
  } else {
    restartCurrentSection();
  }
}

// --- Shuffle engine (audio event listeners) ---

/**
 * Drives auto-advance at the section boundary.
 */
function onTimeUpdate() {
  // A jump's source is still loading: don't evaluate the boundary yet.
  if (advancing) return;

  const audio = Engine.audio;
  if (!audio.duration || currentPart === null) return;

  // Parts 1-3 advance at their quarter boundary; part 4 is handled by 'ended'.
  if (currentPart < 4) {
    const boundary = (currentPart / 4) * audio.duration;
    if (audio.currentTime >= boundary) {
      forwardRandom(true);
    }
  }
}

/**
 * When an episode ends naturally (covers part 4, or a missed boundary),
 * advance the shuffle. Runs after audio.js's own 'ended' handler.
 */
function onEnded() {
  if (!advancing && currentPart !== null) {
    forwardRandom(true);
  }
}

/**
 * On an unavailable episode, move on to a new one after the "episode
 * unavailable" warning, capping consecutive failures.
 */
function onError() {
  const err = Engine.audio.error;
  if (err && err.code === 4) {
    advancing = false;
    errorStreak++;
    if (errorStreak >= MAX_CONSECUTIVE_ERRORS) {
      Engine.intent.shouldBePlaying = false;
      showToast('Radio in pausa: troppe puntate non disponibili', 'error', 4000);
      errorStreak = 0;
      return;
    }
    setTimeout(function() { forwardRandom(true); }, 400);
  }
}

/**
 * Resets the failure counter once playback actually starts.
 */
function onPlaying() {
  errorStreak = 0;
}

/**
 * Initializes the shuffle engine: audio listeners + the transport navigator.
 * Does NOT pick an episode yet — call startRadio() once every module is ready.
 */
export function initRandom() {
  Engine.audio.addEventListener('timeupdate', onTimeUpdate);
  Engine.audio.addEventListener('ended', onEnded);
  Engine.audio.addEventListener('error', onError);
  Engine.audio.addEventListener('playing', onPlaying);

  // The transport arrows next to play always drive the shuffle.
  setShuffleNavigator({
    isActive: function() { return true; },
    next: function() { forwardRandom(true); },
    prev: goBack
  });
}

/**
 * Boots the radio: picks the first random episode + section and loads it
 * paused (ready to start on the first play). Call after all modules init.
 */
export function startRadio() {
  history = [];
  historyIndex = -1;
  errorStreak = 0;
  advancing = false;
  forwardRandom(false);
}
