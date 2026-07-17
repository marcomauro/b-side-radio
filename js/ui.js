// ============================================
// B-SIDE - UI (Gestione Interfaccia)
// ============================================

import { Engine, isPlaying } from './engine.js';
import { formatTime } from './utils.js';

// Riferimenti DOM - vengono inizializzati in initUI()
export let elements = {};

/**
 * Inizializza i riferimenti agli elementi DOM
 */
export function initUI() {
  elements = {
    audio: document.getElementById('audio'),
    // datePicker/dateDisplay: hidden engine state (no date-picker UI in the radio)
    datePicker: document.getElementById('datePicker'),
    dateDisplay: document.getElementById('dateDisplay'),
    episodeDate: document.getElementById('episodeDate'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    bufferBar: document.getElementById('bufferBar'),
    currentTime: document.getElementById('currentTime'),
    remainingTime: document.getElementById('remainingTime'),
    playBtn: document.getElementById('playBtn'),
    playIcon: document.getElementById('playIcon'),
    // prevDay/nextDay: the transport arrows, wired to shuffle navigation
    prevDay: document.getElementById('prevDay'),
    nextDay: document.getElementById('nextDay'),
    skipBack: document.getElementById('skipBack'),
    skipForward: document.getElementById('skipForward'),
    sleepBtn: document.getElementById('sleepBtn'),
    sleepIcon: document.getElementById('sleepIcon'),
    sleepCountdown: document.getElementById('sleepCountdown'),
    volumeNavBtn: document.getElementById('volumeNavBtn'),
    volumeIcon: document.getElementById('volumeIcon'),
    themeBtn: document.getElementById('themeBtn'),
    themeIcon: document.getElementById('themeIcon'),
    volumeOverlay: document.getElementById('volumeOverlay'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeFill: document.getElementById('volumeFill'),
    sleepOverlay: document.getElementById('sleepOverlay'),
    themeColorMeta: document.getElementById('themeColor'),
    installPrompt: document.getElementById('installPrompt'),
    installBtn: document.getElementById('installBtn'),
    installClose: document.getElementById('installClose')
  };

  // Collega audio all'Engine
  Engine.audio = elements.audio;

  buildVisualizer();
}

/**
 * Costruisce il waveform: una fila di barre con altezze irregolari (casuali)
 * su un profilo centrale, generate via JS. A riposo è una figura statica;
 * ogni barra si anima con ritmo proprio quando `is-playing` è attivo
 * (classe sul body, vedi updatePlayIcon). Ogni caricamento ha una forma
 * leggermente diversa, per un effetto organico.
 */
function buildVisualizer() {
  const viz = document.getElementById('viz');
  if (!viz) return;

  const N = 46;
  let html = '';
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // Envelope più alto al centro + rumore casuale = forma irregolare ma bilanciata
    const env = 0.4 + 0.6 * Math.sin(Math.PI * t);
    const base = Math.max(0.14, Math.min(1, env * (0.45 + Math.random() * 0.7)));
    const min = Math.max(0.12, base * (0.3 + Math.random() * 0.3)) / base;
    const max = Math.min(1.15, (base + (1 - base) * (0.4 + Math.random() * 0.6))) / base;
    const dur = (560 + Math.random() * 900).toFixed(0);
    const delay = (Math.random() * -1600).toFixed(0);
    html += '<span class="vbar" style="' +
            '--h:' + (base * 100).toFixed(1) + '%;' +
            '--min:' + min.toFixed(2) + ';' +
            '--max:' + max.toFixed(2) + ';' +
            '--d:' + dur + 'ms;' +
            '--delay:' + delay + 'ms"></span>';
  }
  viz.innerHTML = html;
}

/**
 * Aggiorna l'icona play/pause
 * @param {boolean} playing - Stato di riproduzione
 */
export function updatePlayIcon(playing) {
  if (!elements.playIcon) return;

  elements.playIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<polygon points="6,4 20,12 6,20"/>';

  // Drive the minimal equalizer animation only while audio is playing
  document.body.classList.toggle('is-playing', playing);
}

/**
 * Aggiorna la salute del buffer
 */
export function updateBufferHealth() {
  const audio = Engine.audio;
  const buffered = audio.buffered;
  const duration = audio.duration;

  if (duration > 0) {
    let totalBuffered = 0;
    for (let j = 0; j < buffered.length; j++) {
      totalBuffered += buffered.end(j) - buffered.start(j);
    }
    elements.bufferBar.style.width = ((totalBuffered / duration) * 100) + '%';
  }
}

// Stato per il drag della progress bar
let progressDragging = false;
let seekTime = 0;

export function getProgressDragging() {
  return progressDragging;
}

/**
 * Inizializza gli eventi della progress bar
 */
export function initProgressBar() {
  function getProgressPct(e) {
    const r = elements.progressBar.getBoundingClientRect();
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  }

  function updateProgressUI(pct) {
    elements.progressFill.style.width = (pct * 100) + '%';
    if (Engine.audio.duration) {
      seekTime = pct * Engine.audio.duration;
      elements.currentTime.textContent = formatTime(seekTime);
      elements.remainingTime.textContent = '-' + formatTime(Engine.audio.duration - seekTime);
    }
  }

  elements.progressBar.addEventListener('mousedown', function(e) {
    progressDragging = true;
    elements.progressBar.classList.add('dragging');
    updateProgressUI(getProgressPct(e));
  });

  elements.progressBar.addEventListener('touchstart', function(e) {
    e.preventDefault();
    progressDragging = true;
    elements.progressBar.classList.add('dragging');
    updateProgressUI(getProgressPct(e));
  }, { passive: false });

  document.addEventListener('mousemove', function(e) {
    if (progressDragging) updateProgressUI(getProgressPct(e));
  });

  document.addEventListener('touchmove', function(e) {
    if (progressDragging) updateProgressUI(getProgressPct(e));
  }, { passive: true });

  document.addEventListener('mouseup', function() {
    if (progressDragging && Engine.audio.duration) {
      Engine.position.current = seekTime;
      Engine.audio.currentTime = seekTime;
    }
    progressDragging = false;
    elements.progressBar.classList.remove('dragging');
  });

  document.addEventListener('touchend', function() {
    if (progressDragging && Engine.audio.duration) {
      Engine.position.current = seekTime;
      Engine.audio.currentTime = seekTime;
    }
    progressDragging = false;
    elements.progressBar.classList.remove('dragging');
  });
}

// Stato per il drag del volume
let volDrag = false;

/**
 * Inizializza il controllo volume
 */
export function initVolumeControl() {
  function updateVol(e) {
    const r = elements.volumeSlider.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const pct = Math.max(0, Math.min(1, x / r.width));
    Engine.audio.volume = pct;
    elements.volumeFill.style.width = (pct * 100) + '%';
    updateVolIcon();
  }

  elements.volumeNavBtn.addEventListener('click', function() {
    elements.volumeOverlay.classList.add('show');
  });

  elements.volumeOverlay.addEventListener('click', function(e) {
    if (e.target === elements.volumeOverlay) {
      elements.volumeOverlay.classList.remove('show');
    }
  });

  elements.volumeSlider.addEventListener('mousedown', function(e) {
    volDrag = true;
    updateVol(e);
  });

  elements.volumeSlider.addEventListener('touchstart', function(e) {
    e.preventDefault();
    volDrag = true;
    updateVol(e);
  });

  document.addEventListener('mousemove', function(e) {
    if (volDrag) updateVol(e);
  });

  document.addEventListener('touchmove', function(e) {
    if (volDrag) {
      e.preventDefault();
      updateVol(e);
    }
  }, { passive: false });

  document.addEventListener('mouseup', function() {
    volDrag = false;
  });

  document.addEventListener('touchend', function() {
    volDrag = false;
  });
}

/**
 * Aggiorna l'icona del volume
 */
export function updateVolIcon() {
  const v = Engine.audio.volume;

  if (v === 0) {
    elements.volumeIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else if (v < 0.5) {
    elements.volumeIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/>';
  } else {
    elements.volumeIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/>';
  }
}

/**
 * Aggiorna i pulsanti di navigazione (transport).
 * Nella radio la freccia "avanti" significa "prossima casuale": mai disabilitata.
 */
export function updateNav() {
  if (elements.nextDay) elements.nextDay.disabled = false;
  if (elements.prevDay) elements.prevDay.disabled = false;
}

/**
 * Aggiorna il bottone segmento attivo in base al tempo corrente.
 * La radio non mostra i pulsanti segmento: la funzione resta come no-op
 * sicuro perché il motore audio (core) la richiama comunque nel timeupdate.
 */
export function updateActiveSegment(currentTime, duration) {
  if (!elements.segmentControls || !duration) return;
  const buttons = elements.segmentControls.querySelectorAll('.segment-btn');
  const segment = Math.min(3, Math.floor((currentTime / duration) * 4));

  buttons.forEach((btn, i) => {
    btn.classList.toggle('active', i === segment);
  });
}
