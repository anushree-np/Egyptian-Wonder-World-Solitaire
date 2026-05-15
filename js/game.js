/* ═══════════════════════════════════════════════
   GAME.JS
   The heart of the game. Contains:
   - Constants (suits, ranks, scoring)
   - Game state object
   - Deck creation and shuffling
   - Game initialisation (deal)
   - All move functions (stock, tableau, foundation)
   - Win detection
   - Game-over trigger
   - No-more-moves detection

   This file loads last so it can call functions
   from all the other modules freely.
   ═══════════════════════════════════════════════ */

'use strict';

/*  
   CONSTANTS
     */

var SUITS  = ['♠', '♥', '♦', '♣'];
var RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

// Fast lookup sets for colour checking
var RED_SUITS   = { '♥': true, '♦': true };
var BLACK_SUITS = { '♠': true, '♣': true };

// Timer duration
var TIMER_SECONDS = 30 * 60; // 30 minutes

// Scoring constants (classic Windows Solitaire values)
var SCORE_STOCK_TO_WASTE         =  10;
var SCORE_WASTE_TO_TABLEAU       =   5;
var SCORE_TABLEAU_TO_FOUNDATION  =  15;
var SCORE_FOUNDATION_TO_TABLEAU  = -15;
var SCORE_FLIP_CARD              =   5;

/*  
   GAME STATE
   One central object holds all mutable data.
   Modules read and write `state` directly.
     */

var state = {
  stock:       [],              // face-down draw pile
  waste:       [],              // face-up discard pile
  foundations: [[], [], [], []], // 4 suit piles (Ace → King)
  tableau:     [[], [], [], [], [], [], []], // 7 columns
  moveCount:   0,
  score:       0,
  timeLeft:    TIMER_SECONDS,
  gameOver:    false,
  won:         false,
  undoStack:   [],             // snapshots saved before each move
};

/*  
   UTILITY HELPERS
     */

/** Return 'red' or 'black' for a suit character. */
function cardColor(suit) {
  return RED_SUITS[suit] ? 'red' : 'black';
}

/** Return 0-based numeric rank value (A=0, K=12). */
function rankValue(rank) {
  return RANKS.indexOf(rank);
}

/** Add delta to the score, never going below zero. */
function addScore(delta) {
  state.score = Math.max(0, state.score + delta);
}

/*  
   DECK CREATION
     */

/** Create an unshuffled 52-card deck. */
function createDeck() {
  var deck = [];
  SUITS.forEach(function(suit) {
    RANKS.forEach(function(rank) {
      deck.push({ suit: suit, rank: rank, color: cardColor(suit), faceUp: false });
    });
  });
  return deck;
}

/**
 * Shuffle a deck in place using the Fisher-Yates algorithm.
 * Modifies the array and also returns it for chaining.
 */
function shuffleDeck(deck) {
  for (var i = deck.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
  return deck;
}

/*  
   GAME INITIALISATION
     */

/**
 * Start a brand-new game:
 * 1. Reset all state
 * 2. Shuffle deck
 * 3. Deal tableau (7 columns, triangular deal)
 * 4. Remaining cards go to stock
 * 5. Render, reset timer, close any open modals
 */
function initGame() {
  // Clean up any previous game
  stopTimer();
  stopWinParticles();

  // Hide all modals
  DOM.winOverlay.classList.add('hidden');
  DOM.gameoverOverlay.classList.add('hidden');
  DOM.nomovesOverlay.classList.add('hidden');

  // Reset state to factory defaults
  state = {
    stock:       [],
    waste:       [],
    foundations: [[], [], [], []],
    tableau:     [[], [], [], [], [], [], []],
    moveCount:   0,
    score:       0,
    timeLeft:    TIMER_SECONDS,
    gameOver:    false,
    won:         false,
    undoStack:   [],
  };

  // Deal: column 0 gets 1 card, column 1 gets 2, … column 6 gets 7
  var deck = shuffleDeck(createDeck());
  var idx  = 0;

  for (var col = 0; col < 7; col++) {
    for (var row = 0; row <= col; row++) {
      var card    = Object.assign({}, deck[idx++]);
      card.faceUp = (row === col); // only the top card starts face-up
      state.tableau[col].push(card);
    }
  }

  // Remaining 24 cards go face-down to the stock
  while (idx < deck.length) {
    var stockCard = Object.assign({}, deck[idx++]);
    stockCard.faceUp = false;
    state.stock.push(stockCard);
  }

  render();       // from ui.js
  resetTimer();   // from timer.js
  startTimer();   // from timer.js
}

/*  
   MOVE VALIDATION
     */

/**
 * Can `card` be placed on foundation pile `foundIdx`?
 * Rules: empty pile accepts only Aces;
 *        otherwise same suit, next rank up.
 */
function canDropOnFoundation(card, foundIdx) {
  var pile = state.foundations[foundIdx];
  if (pile.length === 0) return card.rank === 'A';
  var top = pile[pile.length - 1];
  return top.suit === card.suit && rankValue(card.rank) === rankValue(top.rank) + 1;
}

/**
 * Can `card` be placed on tableau column `col`?
 * Rules: empty column accepts only Kings;
 *        otherwise alternating colour, next rank down.
 */
function canDropOnTableau(card, col) {
  var pile = state.tableau[col];
  if (pile.length === 0) return card.rank === 'K';
  var top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  var diffColour = (RED_SUITS[card.suit]   && BLACK_SUITS[top.suit]) ||
                   (BLACK_SUITS[card.suit] && RED_SUITS[top.suit]);
  return diffColour && rankValue(card.rank) === rankValue(top.rank) - 1;
}

/*  
   MOVE EXECUTION
   Each function: validate → saveUndo → mutate state → render
     */

/**
 * Click the stock pile:
 * - If cards remain: flip top card to waste.
 * - If empty: recycle waste back to stock (score penalty).
 */
function clickStock() {
  saveUndo();

  if (state.stock.length === 0) {
    // Recycle: flip waste over (reversed) back to stock
    state.stock = state.waste.slice().reverse().map(function(c) {
      return Object.assign({}, c, { faceUp: false });
    });
    state.waste = [];
    addScore(-20); // penalty for recycling
  } else {
    var card = state.stock.pop();
    card.faceUp = true;
    state.waste.push(card);
    addScore(SCORE_STOCK_TO_WASTE);
  }

  state.moveCount++;
  soundDraw();
  render();
  checkNoMoves(); // see if the player is now stuck
}

/**
 * Auto-move the top waste card to any valid foundation.
 * Called on double-click from the waste pile.
 */
function moveWasteToFoundation() {
  if (state.waste.length === 0) return;
  var card = state.waste[state.waste.length - 1];

  for (var i = 0; i < 4; i++) {
    if (canDropOnFoundation(card, i)) {
      saveUndo();
      state.waste.pop();
      state.foundations[i].push(card);
      addScore(SCORE_TABLEAU_TO_FOUNDATION);
      state.moveCount++;
      soundFoundation();
      render();
      checkWin();
      return;
    }
  }
}

/**
 * Flip the top face-down card of a tableau column face-up.
 * Called automatically whenever a card is removed from a column top.
 * @param {number} col — column index (0-6)
 */
function flipTopCard(col) {
  var pile = state.tableau[col];
  if (pile.length === 0) return;
  var top = pile[pile.length - 1];
  if (top.faceUp) return; // already revealed

  top.faceUp = true;
  addScore(SCORE_FLIP_CARD);
  soundFlip();

  // Trigger flip animation on the existing DOM card before render()
  var colEl    = DOM.tableau[col];
  var cardEls  = colEl.querySelectorAll('.card');
  if (cardEls.length > 0) {
    var topCardEl = cardEls[cardEls.length - 1];
    topCardEl.classList.add('flipping');
    setTimeout(function() {
      topCardEl.classList.remove('flipping');
    }, 350);
  }
}

/**
 * Move the top card of a tableau column to any valid foundation.
 * Called on double-click from a tableau card.
 * @param {number} fromCol  — source column
 * @param {number} cardIdx  — must equal pile.length - 1 (top card only)
 * @returns {boolean}
 */
function moveTableauToFoundation(fromCol, cardIdx) {
  var pile = state.tableau[fromCol];
  if (cardIdx !== pile.length - 1) return false;
  var card = pile[cardIdx];
  if (!card.faceUp) return false;

  for (var i = 0; i < 4; i++) {
    if (canDropOnFoundation(card, i)) {
      saveUndo();
      pile.pop();
      flipTopCard(fromCol);
      state.foundations[i].push(card);
      addScore(SCORE_TABLEAU_TO_FOUNDATION);
      state.moveCount++;
      soundFoundation();
      render();
      checkWin();
      return true;
    }
  }
  return false;
}

/*  
   WIN DETECTION
     */

/**
 * Check if all 52 cards are in the foundations.
 * If yes, trigger the win screen.
 */
function checkWin() {
  var total = state.foundations.reduce(function(sum, f) { return sum + f.length; }, 0);
  if (total < 52) return;

  state.won      = true;
  state.gameOver = true;
  stopTimer();

  // Fill in the win modal stats
  DOM.winMoves.textContent = state.moveCount;
  DOM.winTime.textContent  = formatTime(TIMER_SECONDS - state.timeLeft);
  DOM.winScore.textContent = state.score;
  DOM.winOverlay.classList.remove('hidden');

  soundVictory();
  startWinParticles();
}

/*  
   GAME OVER (time expired)
     */

/**
 * Trigger the game-over modal.
 * @param {string} reason — 'time' or 'stuck' (for future use)
 */
function triggerGameOver(reason) {
  state.gameOver = true;
  stopTimer();
  soundGameOver();
  DOM.gameoverOverlay.classList.remove('hidden');
}

/*  
   NO-MORE-MOVES DETECTION
   Scans the full board for any legal move.
   Shows a helpful popup if none exist.
     */

/**
 * Return true if at least one legal move exists anywhere.
 * Checks: stock draw, waste → foundation/tableau,
 *         tableau → foundation/tableau, foundation → tableau.
 */
function hasAnyLegalMove() {
  var i, col, row;

  // 1. Can we draw from the stock? (always a "move" even if recycling)
  if (state.stock.length > 0) return true;

  // 2. Waste → foundation or tableau?
  if (state.waste.length > 0) {
    var wTop = state.waste[state.waste.length - 1];
    for (i = 0; i < 4; i++) {
      if (canDropOnFoundation(wTop, i)) return true;
    }
    for (i = 0; i < 7; i++) {
      if (canDropOnTableau(wTop, i)) return true;
    }
  }

  // 3. Tableau face-up cards → foundation or another tableau column?
  for (col = 0; col < 7; col++) {
    var pile = state.tableau[col];
    for (row = 0; row < pile.length; row++) {
      if (!pile[row].faceUp) continue;
      var card = pile[row];

      // Only the top card can go to a foundation
      if (row === pile.length - 1) {
        for (i = 0; i < 4; i++) {
          if (canDropOnFoundation(card, i)) return true;
        }
      }

      // Any face-up card (+ cards below it) can potentially move to another column
      for (i = 0; i < 7; i++) {
        if (i !== col && canDropOnTableau(card, i)) return true;
      }
    }
  }

  // 4. Foundation top cards → any tableau column? (rare but valid)
  for (i = 0; i < 4; i++) {
    var fPile = state.foundations[i];
    if (fPile.length === 0) continue;
    var fTop = fPile[fPile.length - 1];
    for (col = 0; col < 7; col++) {
      if (canDropOnTableau(fTop, col)) return true;
    }
  }

  // Also true if waste can be recycled from an empty stock
  if (state.stock.length === 0 && state.waste.length > 0) return true;

  return false;
}

/**
 * Check for a dead end and show the no-moves popup if stuck.
 * Called after each stock click (most common moment to get stuck).
 */
function checkNoMoves() {
  if (state.gameOver || state.won) return;
  if (!hasAnyLegalMove()) {
    DOM.nomovesOverlay.classList.remove('hidden');
  }
}
