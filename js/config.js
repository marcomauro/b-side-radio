// ============================================
// B-SIDE - Config (Costanti e Configurazione)
// ============================================

export const APP_VERSION = '2.0.2';
export const APP_BUILD_DATE = '2026-04-02';

export const MEDIA_BASE_URL = 'https://media.capital.it';
export const STORAGE_KEYS = {
  THEME: 'bside-theme',
  FAVORITES: 'bside-fav',
  POSITION_PREFIX: 'bside-pos-'
};
export const POSITION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 giorni in ms

// Date range for the "random episode" feature (weekends excluded: the show airs Mon-Fri)
export const RANDOM_RANGE_START = '2025-09-01';
export const RANDOM_RANGE_END = '2026-06-26';
