// ============================================
// B-SIDE - Storage (Gestione LocalStorage)
// ============================================

import { STORAGE_KEYS, POSITION_MAX_AGE } from './config.js';
import { Engine } from './engine.js';

/**
 * Salva la posizione corrente nel localStorage
 */
export function savePositionToStorage(dateValue) {
  if (!dateValue || !Engine.audio.currentTime) return;

  const key = STORAGE_KEYS.POSITION_PREFIX + dateValue;
  const data = {
    position: Engine.position.current,
    timestamp: Date.now(),
    duration: Engine.audio.duration || 0
  };

  try {
    localStorage.setItem(key, JSON.stringify(data));
    Engine.position.lastSaved = Engine.position.current;
  } catch (e) {
    // Storage full or unavailable (e.g. private mode)
  }
}

/**
 * Carica la posizione salvata dal localStorage
 * @param {string} dateValue - Data in formato YYYY-MM-DD
 * @returns {number} - Posizione salvata o 0
 */
export function loadPositionFromStorage(dateValue) {
  const key = STORAGE_KEYS.POSITION_PREFIX + dateValue;

  try {
    const data = JSON.parse(localStorage.getItem(key));
    if (data && data.position > 30 && (!data.duration || data.position < data.duration - 30)) {
      Engine.position.current = data.position;
      return data.position;
    }
  } catch (e) {
    // Ignora errori di parsing
  }

  Engine.position.current = 0;
  return 0;
}

/**
 * Pulisce le posizioni più vecchie di 30 giorni
 */
export function cleanOldPositions() {
  const now = Date.now();
  const keysToRemove = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS.POSITION_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (now - data.timestamp > POSITION_MAX_AGE) {
          keysToRemove.push(key);
        }
      } catch (e) {
        keysToRemove.push(key);
      }
    }
  }

  keysToRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Ottiene i preferiti dal localStorage
 * @returns {Array} - Array di date preferite
 */
export function getFavorites() {
  try {
    const favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) || '[]');
    return Array.isArray(favorites) ? favorites : [];
  } catch (e) {
    return [];
  }
}

/**
 * Salva i preferiti nel localStorage
 * @param {Array} favorites - Array di date preferite
 */
export function setFavorites(favorites) {
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  } catch (e) {
    // Storage full or unavailable (e.g. private mode)
  }
}

/**
 * Ottiene il tema salvato
 * @returns {string} - 'light' o 'dark'
 */
export function getTheme() {
  return localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
}

/**
 * Salva il tema
 * @param {string} theme - 'light' o 'dark'
 */
export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (e) {
    // Storage full or unavailable (e.g. private mode)
  }
}
