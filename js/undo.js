/* ═══════════════════════════════════════════════
   UNDO.JS
   Undo stack management.

   Before every legal move, saveUndo() captures a
   deep copy of the entire game state. The player
   can then step backwards one move at a time with
   undo(), or jump all the way back to move 1 with
   undoAll().

   ═══════════════════════════════════════════════ */

'use strict';

/*  
   SAVE SNAPSHOT
     */

/**
 * Push a snapshot of the current game state onto the stack.
 * Call this BEFORE making any change to `state`.
 */
function saveUndo() {
  state.undoStack.push({
    stock:       JSON.parse(JSON.stringify(state.stock)),
    waste:       JSON.parse(JSON.stringify(state.waste)),
    foundations: JSON.parse(JSON.stringify(state.foundations)),
    tableau:     JSON.parse(JSON.stringify(state.tableau)),
    moveCount:   state.moveCount,
    score:       state.score,
    timeLeft:    state.timeLeft,
  });

  // Keep undo buttons in sync
  updateUndoButtons();
}

/*  
   UNDO LAST MOVE
     */

/**
 * Revert the game to the state before the last move.
 * Pops one snapshot from the stack.
 */
function undo() {
  if (state.undoStack.length === 0) return;

  // Pop the most recent snapshot and restore it
  var snap = state.undoStack.pop();
  applySnapshot(snap);

  soundFlip(); // subtle audio cue
  render();
  updateUndoButtons();
}

/*  
   UNDO ALL MOVES
     */

/**
 * Jump all the way back to how the board looked after the deal.
 * Takes the very first snapshot and clears the whole stack.
 */
function undoAll() {
  if (state.undoStack.length === 0) return;

  // The first snapshot is the initial deal state
  var firstSnap = state.undoStack[0];
  state.undoStack = []; // wipe the entire history

  applySnapshot(firstSnap);

  soundFlip();
  render();
  updateUndoButtons();
}

/*  
   APPLY SNAPSHOT
     */

/**
 * Overwrite the live game state with a saved snapshot.
 * Also restores the timer so undoing brings back lost time.
 * @param {Object} snap - A snapshot object created by saveUndo()
 */
function applySnapshot(snap) {
  state.stock       = snap.stock;
  state.waste       = snap.waste;
  state.foundations = snap.foundations;
  state.tableau     = snap.tableau;
  state.moveCount   = snap.moveCount;
  state.score       = snap.score;
  state.timeLeft    = snap.timeLeft;

  // Restore the warning style based on restored time
  if (snap.timeLeft <= 60) {
    DOM.timerBlock.classList.add('warning');
  } else {
    DOM.timerBlock.classList.remove('warning');
  }
}

/*  
   BUTTON STATE
     */

/**
 * Enable or disable the Undo / Undo-All buttons
 * based on whether there is any history to step back through.
 */
function updateUndoButtons() {
  var hasHistory = state.undoStack.length > 0;
  DOM.btnUndo.disabled    = !hasHistory;
  DOM.btnUndoAll.disabled = !hasHistory;

  // Show move count in tooltip so players know how far back they can go
  DOM.btnUndoAll.title = hasHistory
    ? 'Undo all ' + state.undoStack.length + ' move(s) — back to deal (Shift+U)'
    : 'Undo all moves (Shift+U)';
}
