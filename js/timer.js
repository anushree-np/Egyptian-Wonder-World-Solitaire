/* ═══════════════════════════════════════════════
   TIMER.JS
   30-minute countdown timer.

   - startTimer()  — begins the countdown
   - stopTimer()   — pauses / stops it
   - resetTimer()  — restores full 30:00

   The timer reads from and writes to the shared
   `state` object (defined in game.js which loads last).
   DOM references come from the `DOM` object in ui.js.
   ═══════════════════════════════════════════════ */

'use strict';

// Internal interval handle — we need to keep this to cancel it later
var _timerInterval = null;

/* ─────────────────────────────────────────────
   TIMER CONTROL
   ───────────────────────────────────────────── */

/**
 * Start the countdown.
 * Ticks every 1 second, updates the display,
 * triggers game over when time reaches zero,
 * and flashes a warning when under 60 seconds.
 */
function startTimer() {
  // Don't create a second interval if one is already running
  if (_timerInterval) return;

  _timerInterval = setInterval(function() {
    // Immediately stop if the game has ended
    if (state.gameOver || state.won) {
      stopTimer();
      return;
    }

    state.timeLeft--;
    updateTimerDisplay();

    // Warning flash when fewer than 60 seconds remain
    if (state.timeLeft <= 60 && state.timeLeft > 0) {
      DOM.timerBlock.classList.add('warning');
    }

    // Time's up — trigger game over
    if (state.timeLeft <= 0) {
      stopTimer();
      triggerGameOver('time'); // defined in game.js
    }
  }, 1000);
}

/**
 * Stop (pause) the countdown.
 * Safe to call even if the timer is not running.
 */
function stopTimer() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  // Remove the red warning style
  if (typeof DOM !== 'undefined' && DOM.timerBlock) {
    DOM.timerBlock.classList.remove('warning');
  }
}

/**
 * Reset timer back to 30 minutes and update the display.
 * Called at the start of each new game.
 */
function resetTimer() {
  stopTimer();
  state.timeLeft = TIMER_SECONDS; // constant defined in game.js
  updateTimerDisplay();
}

/* ─────────────────────────────────────────────
   DISPLAY HELPERS
   ───────────────────────────────────────────── */

/**
 * Format a number of seconds as "MM:SS".
 * e.g. 125 → "02:05"
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  var mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  var secs = (totalSeconds % 60).toString().padStart(2, '0');
  return mins + ':' + secs;
}

/**
 * Push the current time value to the DOM display.
 */
function updateTimerDisplay() {
  DOM.timerDisplay.textContent = formatTime(state.timeLeft);
}
