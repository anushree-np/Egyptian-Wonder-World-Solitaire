/* ═══════════════════════════════════════════════
   AUDIO.JS
   Lightweight sound effects using the Web Audio API.
   All sounds are synthesised — no audio files needed,
   so the game works 100% offline.

   Sounds are short tones with envelope shaping to
   give a gentle, non-annoying feel.
   ═══════════════════════════════════════════════ */

'use strict';

// ─── Mute state ───
// We keep this in a simple variable. The mute button in ui.js
// calls toggleMute() and then updates the button label.
let _muted = false;

// ─── Audio context ───
// One shared AudioContext for all sounds.
// Created lazily on first use (browsers require a user gesture first).
let _ctx = null;

/**
 * Get (or create) the shared AudioContext.
 * We defer creation until the first sound is requested so we don't
 * trigger the browser's autoplay policy block.
 * @returns {AudioContext}
 */
function getAudioCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

/**
 * Play a simple synthesised tone.
 * @param {number} freq      - Frequency in Hz (pitch of the note)
 * @param {number} duration  - How long the tone lasts in seconds
 * @param {string} type      - Oscillator waveform: 'sine'|'triangle'|'square'|'sawtooth'
 * @param {number} volume    - Peak gain, 0.0 – 1.0  (keep below 0.3 to avoid clipping)
 * @param {number} startAt   - Delay before the tone starts (seconds, for chords)
 */
function _playTone(freq, duration, type = 'sine', volume = 0.15, startAt = 0) {
  if (_muted) return;

  const ctx = getAudioCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);

  // Soft attack + exponential decay so there are no harsh clicks
  gain.gain.setValueAtTime(volume, ctx.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime  + startAt + duration + 0.05);
}

/* ─────────────────────────────────────────────
   PUBLIC SOUND FUNCTIONS
   Each one describes exactly one game event.
   ───────────────────────────────────────────── */

/**
 * Soft card-shuffle sound when a card is placed.
 * Two quick, overlapping triangle tones — like paper.
 */
function soundDrop() {
  _playTone(520, 0.09, 'triangle', 0.13, 0);
  _playTone(380, 0.09, 'triangle', 0.09, 0.04);
}

/**
 * Slightly deeper tone for drawing from the stock pile.
 */
function soundDraw() {
  _playTone(340, 0.12, 'triangle', 0.14, 0);
}

/**
 * Higher-pitched "ding" when a card reaches a foundation pile.
 * Two tones give it a cheerful, successful feel.
 */
function soundFoundation() {
  _playTone(880,  0.12, 'sine', 0.18, 0);
  _playTone(1100, 0.18, 'sine', 0.13, 0.07);
}

/**
 * Quick swish sound when a face-down card flips over.
 */
function soundFlip() {
  _playTone(480, 0.08, 'triangle', 0.10, 0);
}

/**
 * Victory fanfare — ascending arpeggio on win.
 * Notes: C5 E5 G5 C6 E6 (a major arpeggio)
 */
function soundVictory() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach(function(freq, i) {
    _playTone(freq, 0.28, 'sine', 0.20, i * 0.11);
  });
}

/**
 * Low descending tones for game over.
 */
function soundGameOver() {
  _playTone(300, 0.4, 'sawtooth', 0.09, 0);
  _playTone(240, 0.5, 'sawtooth', 0.07, 0.18);
  _playTone(180, 0.6, 'sawtooth', 0.06, 0.36);
}

/**
 * Tiny buzz for an invalid drop (used internally by drag.js).
 */
function soundInvalid() {
  _playTone(160, 0.08, 'square', 0.07, 0);
}

/* ─────────────────────────────────────────────
   MUTE CONTROL
   ───────────────────────────────────────────── */

/**
 * Toggle mute on/off.
 * @returns {boolean} — the NEW muted state (true = muted)
 */
function toggleMute() {
  _muted = !_muted;
  return _muted;
}

/**
 * Get current mute state.
 * @returns {boolean}
 */
function isMuted() {
  return _muted;
}
