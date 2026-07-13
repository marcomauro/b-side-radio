// ============================================
// B-SIDE - Theme (Gestione Tema Light/Dark)
// ============================================

import { getTheme, setTheme } from './storage.js';
import { elements } from './ui.js';

/**
 * Applica il tema specificato
 * @param {string} t - 'light' o 'dark'
 */
function applyTheme(t) {
  if (t === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    elements.themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
    elements.themeColorMeta.content = '#0b0c14';
  } else {
    document.documentElement.removeAttribute('data-theme');
    elements.themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    elements.themeColorMeta.content = '#e6eaf7';
  }
}

/**
 * Alterna tra tema light e dark
 */
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  setTheme(newTheme);
}

/**
 * Inizializza il tema
 */
export function initTheme() {
  const savedTheme = getTheme();
  applyTheme(savedTheme);

  elements.themeBtn.addEventListener('click', toggleTheme);
}
