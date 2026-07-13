// ============================================
// B-SIDE - Random (Random Episode Playback)
// ============================================

import { Engine } from './engine.js';
import { RANDOM_RANGE_START, RANDOM_RANGE_END } from './config.js';
import { formatDate } from './utils.js';
import { elements, updateNav, updateActiveSegment } from './ui.js';
import { updatePlayer } from './audio.js';
import { updateFav } from './favorites.js';
import { updateMediaSession } from './mediasession.js';
import { showToast } from './toast.js';

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
 * Picks a random episode and segment, then starts playback
 */
function playRandomEpisode() {
  const date = pickRandomWeekday();
  const segment = Math.floor(Math.random() * 4) + 1; // 1..4

  elements.datePicker.value = date;
  updatePlayer();
  updateNav();
  updateFav();
  updateMediaSession();

  // The segment start time depends on the episode duration, known only
  // after metadata loads; the canplay handler then seeks and plays
  Engine.audio.addEventListener('loadedmetadata', function onMeta() {
    Engine.audio.removeEventListener('loadedmetadata', onMeta);
    const target = ((segment - 1) / 4) * Engine.audio.duration;
    Engine.position.current = target;
    updateActiveSegment(target, Engine.audio.duration);
  });

  Engine.intent.shouldBePlaying = true;

  showToast('Puntata del ' + formatDate(date) + ' · Parte ' + segment);
}

/**
 * Initializes the random episode button
 */
export function initRandom() {
  elements.randomBtn.addEventListener('click', playRandomEpisode);
}
