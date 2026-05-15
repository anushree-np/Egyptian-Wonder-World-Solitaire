/* ═══════════════════════════════════════════════
   UI.JS
   Everything that touches the DOM:
   - DOM element references (the `DOM` object)
   - render() — syncs all piles to game state
   - buildCardEl() — creates a card DOM element
   - Intro screen transition
   - Mute button wiring
   ═══════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   DOM REFERENCES
   Collect all the elements we touch at runtime.
   Centralised so we never scatter getElementById
   calls throughout the codebase.
   ───────────────────────────────────────────── */
var DOM = {
  // Screens
  introScreen:     document.getElementById('intro-screen'),
  gameScreen:      document.getElementById('game-screen'),
  btnEnter:        document.getElementById('btn-enter'),

  // Piles
  stockPile:       document.getElementById('stock-pile'),
  wastePile:       document.getElementById('waste-pile'),
  foundations:     [0,1,2,3].map(function(i) { return document.getElementById('foundation-' + i); }),
  tableau:         [0,1,2,3,4,5,6].map(function(i) { return document.getElementById('tableau-' + i); }),

  // Stats bar
  moveCounter:     document.getElementById('move-counter'),
  timerDisplay:    document.getElementById('timer-display'),
  timerBlock:      document.getElementById('timer-block'),
  scoreDisplay:    document.getElementById('score-display'),

  // Buttons
  btnUndo:         document.getElementById('btn-undo'),
  btnUndoAll:      document.getElementById('btn-undo-all'),
  btnNewGame:      document.getElementById('btn-new-game'),
  btnMute:         document.getElementById('btn-mute'),

  // Win modal
  winOverlay:      document.getElementById('win-overlay'),
  winMoves:        document.getElementById('win-moves'),
  winTime:         document.getElementById('win-time'),
  winScore:        document.getElementById('win-score'),
  btnWinNew:       document.getElementById('btn-win-new'),

  // Game-over modal
  gameoverOverlay: document.getElementById('gameover-overlay'),
  btnGameoverNew:  document.getElementById('btn-gameover-new'),

  // No-moves modal
  nomovesOverlay:  document.getElementById('nomoves-overlay'),
  btnNomovesUndo:  document.getElementById('btn-nomoves-undo'),
  btnNomovesNew:   document.getElementById('btn-nomoves-new'),
};

/* ─────────────────────────────────────────────
   INTRO SCREEN
   ───────────────────────────────────────────── */

/**
 * Trigger the fade-out animation on the intro screen,
 * then switch to the game screen and start the game.
 * Called when the player clicks "Enter the Egyptian Wonder World".
 */
function enterGame() {
  // Add CSS animation class (defined in animations.css)
  DOM.introScreen.classList.add('intro-fadeout');

  // After animation completes, hide intro and show game
  setTimeout(function() {
    DOM.introScreen.classList.add('hidden');
    DOM.introScreen.classList.remove('intro-fadeout');
    DOM.gameScreen.classList.remove('hidden');

    // Start ambient sand particles on the game screen
    initSandParticles(); // from effects.js

    // Deal the first game
    initGame(); // from game.js
  }, 650);
}

/* ─────────────────────────────────────────────
   MUTE BUTTON
   ───────────────────────────────────────────── */

/**
 * Refresh the mute button icon to match the current audio state.
 */
function updateMuteButton() {
  DOM.btnMute.textContent = isMuted() ? '🔇' : '🔊'; // from audio.js
  DOM.btnMute.title       = isMuted() ? 'Unmute (M)' : 'Mute sounds (M)';
}

/* ─────────────────────────────────────────────
   RENDER ENGINE
   Syncs all DOM elements to the current game state.
   Called after every state change.
   ───────────────────────────────────────────── */

/**
 * Full re-render of the board.
 * Cheaper than it looks — innerHTML clears only the pile contents,
 * not the whole page, so it's plenty fast for 52 cards.
 */
function render() {
  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau();

  // Stats bar
  DOM.moveCounter.textContent  = state.moveCount;
  DOM.scoreDisplay.textContent = state.score;
  DOM.timerDisplay.textContent = formatTime(state.timeLeft);

  // Undo buttons depend on history
  updateUndoButtons(); // from undo.js
}

/* Stock pile — shows only the top card (face-down) */
function renderStock() {
  var el = DOM.stockPile;
  el.innerHTML = '';

  if (state.stock.length === 0) {
    el.classList.add('empty-stock');
    return;
  }
  el.classList.remove('empty-stock');
  // Only the top card is visible; render it face-down
  var card = state.stock[state.stock.length - 1];
  el.appendChild(buildCardEl(card, 'stock', null, 0));
}

/* Waste pile — shows only the top (most recently drawn) card */
function renderWaste() {
  var el = DOM.wastePile;
  el.innerHTML = '';

  if (state.waste.length === 0) return;
  var card = state.waste[state.waste.length - 1];
  el.appendChild(buildCardEl(card, 'waste', null, 0));
}

/* Foundation piles — show only the top card of each pile */
function renderFoundations() {
  DOM.foundations.forEach(function(el, i) {
    el.innerHTML = '';
    var pile = state.foundations[i];
    if (pile.length === 0) return;
    var card = pile[pile.length - 1];
    el.appendChild(buildCardEl(card, 'foundation', i, 0));
  });
}

/**
 * Tableau columns — stacked cards with offset positioning.
 * Face-down cards overlap by 18px, face-up by 28px.
 */
function renderTableau() {
  DOM.tableau.forEach(function(el, col) {
    el.innerHTML = '';
    var pile      = state.tableau[col];
    var topOffset = 0; // tracks the CSS `top` for each card

    pile.forEach(function(card, row) {
      var cardEl = buildCardEl(card, 'tableau', col, row);
      cardEl.style.top = topOffset + 'px';
      el.appendChild(cardEl);
      // Advance offset for next card
      topOffset += card.faceUp ? 28 : 18;
    });

    // Set column min-height so it's tall enough to contain all cards
    if (pile.length > 0) {
      var cardH = parseInt(getComputedStyle(document.documentElement)
                           .getPropertyValue('--card-h'));
      el.style.minHeight = (topOffset + cardH) + 'px';
    } else {
      el.style.minHeight = '';
    }
  });
}

/* ─────────────────────────────────────────────
   CARD ELEMENT BUILDER
   Creates one card <div> with correct content
   and drag event listeners.
   ───────────────────────────────────────────── */

/**
 * Build and return a card DOM element.
 * @param {Object}     card        — {suit, rank, color, faceUp}
 * @param {string}     source      — 'stock'|'waste'|'foundation'|'tableau'|'ghost'
 * @param {number|null} sourceIndex — pile index (null when not applicable)
 * @param {number}     zIndex      — CSS z-index value
 * @returns {HTMLElement}
 */
function buildCardEl(card, source, sourceIndex, zIndex) {
  var el = document.createElement('div');
  el.className = 'card ' + (card.faceUp ? 'face-up ' + card.color : 'face-down');
  el.style.zIndex = zIndex;

  // Store metadata so drag.js can identify the card's origin
  el.dataset.source = source;
  if (sourceIndex !== null) el.dataset.sourceIndex = sourceIndex;

  if (card.faceUp) {
    // Face-up: show rank and suit in corners and a faint center symbol
    el.innerHTML =
      '<div class="card-front">' +
        '<div class="card-corner top-left">' +
          '<span class="corner-rank">' + card.rank + '</span>' +
          '<span class="corner-suit">' + card.suit + '</span>' +
        '</div>' +
        '<div class="card-center">' +
          '<span class="card-center-suit">' + card.suit + '</span>' +
        '</div>' +
        '<div class="card-corner bottom-right">' +
          '<span class="corner-rank">' + card.rank + '</span>' +
          '<span class="corner-suit">' + card.suit + '</span>' +
        '</div>' +
      '</div>';

    // Only face-up cards respond to drag events
    el.addEventListener('mousedown', onCardMouseDown);
    el.addEventListener('touchstart', onCardTouchStart, { passive: false });
  } else {
    // Face-down: decorative Egyptian back only
    el.innerHTML = '<div class="card-back"></div>';
  }

  return el;
}

/* ─────────────────────────────────────────────
   EVENT WIRING
   All button click handlers live here.
   ───────────────────────────────────────────── */

// ── Intro "Enter" button ──
DOM.btnEnter.addEventListener('click', enterGame);

// ── Stock pile: draw a card ──
DOM.stockPile.addEventListener('click', function() {
  if (state.gameOver) return;
  clickStock();
  // Brief flash animation as feedback
  DOM.stockPile.classList.add('stock-clicked');
  setTimeout(function() { DOM.stockPile.classList.remove('stock-clicked'); }, 360);
});

// ── Undo buttons ──
DOM.btnUndo.addEventListener('click', undo);
DOM.btnUndoAll.addEventListener('click', function() {
  if (state.undoStack.length === 0) return;
  if (window.confirm('Return the board to how it looked after the deal?')) {
    undoAll();
  }
});

// ── New game ──
DOM.btnNewGame.addEventListener('click', function() {
  stopWinParticles();
  initGame();
});

// ── Mute ──
DOM.btnMute.addEventListener('click', function() {
  toggleMute();       // from audio.js
  updateMuteButton();
});

// ── Win modal → play again ──
DOM.btnWinNew.addEventListener('click', function() {
  stopWinParticles();
  initGame();
});

// ── Game-over modal → try again ──
DOM.btnGameoverNew.addEventListener('click', initGame);

// ── No-moves modal ──
DOM.btnNomovesUndo.addEventListener('click', function() {
  DOM.nomovesOverlay.classList.add('hidden');
  undo();
});
DOM.btnNomovesNew.addEventListener('click', function() {
  DOM.nomovesOverlay.classList.add('hidden');
  initGame();
});

// ── Double-click on a card → auto-move to foundation ──
document.addEventListener('dblclick', function(e) {
  var cardEl = e.target.closest('.card');
  if (!cardEl || !cardEl.classList.contains('face-up')) return;

  var src    = cardEl.dataset.source;
  var srcIdx = parseInt(cardEl.dataset.sourceIndex);

  if (src === 'waste') {
    moveWasteToFoundation();
  } else if (src === 'tableau') {
    moveTableauToFoundation(srcIdx, state.tableau[srcIdx].length - 1);
  }
});

// ── Keyboard shortcuts ──
document.addEventListener('keydown', function(e) {
  // Ignore key events while the intro is showing
  if (!DOM.introScreen.classList.contains('hidden')) {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      enterGame();
    }
    return;
  }

  if (e.code === 'Space')  { e.preventDefault(); if (!state.gameOver) clickStock(); }
  if (e.code === 'KeyU' && !e.shiftKey) undo();
  if (e.code === 'KeyU' &&  e.shiftKey) undoAll();
  if (e.code === 'KeyN')   initGame();
  if (e.code === 'KeyM')   { toggleMute(); updateMuteButton(); }
});

// ── Init intro particle effect ──
// Run as soon as ui.js is parsed (intro is visible at this point)
initIntroParticles(); // from effects.js
