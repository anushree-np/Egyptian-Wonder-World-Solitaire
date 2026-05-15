/* ═══════════════════════════════════════════════
   DRAG.JS
   Card drag-and-drop for both mouse and touch.

   How it works:
   1. mousedown / touchstart on a face-up card → startDrag()
   2. mousemove / touchmove → moveDrag() — moves the ghost card
   3. mouseup / touchend   → endDrag()  — tries to place the card

   A "ghost" is a floating clone of the dragged card(s) that
   follows the cursor. The original card is dimmed to 35% opacity
   to show it's "lifted". If the drop is invalid the original
   snaps back to its full opacity via render().
   ═══════════════════════════════════════════════ */

'use strict';

// ─── Drag state ───
// All information about the current drag is kept here.
// Reset to this default object when no drag is in progress.
var drag = {
  active:       false,  // is a drag happening right now?
  cards:        [],     // card objects being dragged (can be a stack)
  source:       null,   // 'waste' | 'foundation' | 'tableau'
  sourceIdx:    null,   // pile index (null for waste)
  cardIndex:    null,   // position of the first dragged card in the pile
  el:           null,   // ghost DOM element
  offsetX:      0,      // cursor offset from the card's top-left corner
  offsetY:      0,
  sourceCardEl: null,   // the original DOM element (we dim it during drag)
};

/*  
   MOUSE EVENT HANDLERS
     */

function onCardMouseDown(e) {
  if (e.button !== 0) return;  // left button only
  e.preventDefault();
  startDrag(e.clientX, e.clientY, e.target);
}

function onMouseMove(e) {
  if (!drag.active) return;
  moveDrag(e.clientX, e.clientY);
}

function onMouseUp(e) {
  if (!drag.active) return;
  endDrag(e.clientX, e.clientY);
}

/*  
   TOUCH EVENT HANDLERS
     */

function onCardTouchStart(e) {
  e.preventDefault();  // prevents scroll while dragging cards
  var t = e.touches[0];
  startDrag(t.clientX, t.clientY, e.target);
}

function onTouchMove(e) {
  if (!drag.active) return;
  e.preventDefault();
  var t = e.touches[0];
  moveDrag(t.clientX, t.clientY);
}

function onTouchEnd(e) {
  if (!drag.active) return;
  var t = e.changedTouches[0];
  endDrag(t.clientX, t.clientY);
}

/*  
   START DRAG
     */

/**
 * Begin a drag operation.
 * Figures out which card was grabbed, builds a ghost element,
 * and dims the original card.
 * @param {number} clientX  — cursor X position
 * @param {number} clientY  — cursor Y position
 * @param {Element} target  — the DOM element that received the event
 */
function startDrag(clientX, clientY, target) {
  if (state.gameOver) return;

  // Walk up from the click target to find the .card element
  var cardEl = target.closest('.card');
  if (!cardEl || cardEl.classList.contains('face-down')) return;

  var src    = cardEl.dataset.source;
  var srcIdx = (cardEl.dataset.sourceIndex !== undefined)
               ? parseInt(cardEl.dataset.sourceIndex) : null;

  var cards     = [];
  var cardIndex = null;

  // ── Figure out which card(s) we're picking up ──
  if (src === 'waste') {
    if (state.waste.length === 0) return;
    cards     = [state.waste[state.waste.length - 1]];
    cardIndex = state.waste.length - 1;

  } else if (src === 'foundation') {
    var fPile = state.foundations[srcIdx];
    if (fPile.length === 0) return;
    cards     = [fPile[fPile.length - 1]];
    cardIndex = fPile.length - 1;

  } else if (src === 'tableau') {
    var tPile    = state.tableau[srcIdx];
    var allCards = DOM.tableau[srcIdx].querySelectorAll('.card');

    // Find which row index was clicked
    var clickedRow = -1;
    allCards.forEach(function(el, i) { if (el === cardEl) clickedRow = i; });
    if (clickedRow === -1) return;

    var clickedCard = tPile[clickedRow];
    if (!clickedCard || !clickedCard.faceUp) return;

    // Grab clicked card AND everything below it (the whole sub-stack)
    cards     = tPile.slice(clickedRow);
    cardIndex = clickedRow;

  } else {
    return; // unknown source — bail out
  }

  if (cards.length === 0) return;

  // ── Build the ghost ──
  var rect  = cardEl.getBoundingClientRect();
  var ghost = buildGhost(cards, rect.width);

  // Position the ghost so it aligns exactly with the card being lifted
  ghost.style.left = (clientX - (clientX - rect.left)) + 'px';
  ghost.style.top  = (clientY - (clientY - rect.top)) + 'px';
  document.body.appendChild(ghost);

  // Store drag state
  drag = {
    active:       true,
    cards:        cards,
    source:       src,
    sourceIdx:    srcIdx,
    cardIndex:    cardIndex,
    el:           ghost,
    offsetX:      clientX - rect.left,
    offsetY:      clientY - rect.top,
    sourceCardEl: cardEl,
  };

  // Dim the original card to show it's being "lifted"
  cardEl.style.opacity = '0.35';

  soundDraw(); // subtle pick-up sound
}

/**
 * Build the floating ghost element that follows the cursor.
 * For a stack of cards each one is stacked 28px below the previous.
 * @param {Array}  cards  — card objects to clone
 * @param {number} width  — card width in pixels
 * @returns {HTMLElement}
 */
function buildGhost(cards, width) {
  var ghost = document.createElement('div');
  ghost.id = 'drag-ghost';

  // Get --card-h from CSS variables
  var cardH = parseInt(getComputedStyle(document.documentElement)
                        .getPropertyValue('--card-h'));

  var totalH = (cards.length - 1) * 28 + cardH;

  ghost.style.cssText = [
    'position:fixed',
    'z-index:2000',
    'pointer-events:none',
    'width:' + width + 'px',
    'height:' + totalH + 'px',
    'transition:none',
  ].join(';');

  // Add each card in the stack as a child
  cards.forEach(function(card, i) {
    var el = buildCardEl(card, 'ghost', null, i); // buildCardEl is in ui.js
    el.style.position = 'absolute';
    el.style.top      = (i * 28) + 'px';
    el.style.left     = '0';
    el.classList.add('dragging');
    ghost.appendChild(el);
  });

  return ghost;
}

/*  
   MOVE DRAG (track cursor)
     */

/**
 * Move the ghost element to follow the cursor.
 * Also highlights the valid drop target beneath the cursor.
 */
function moveDrag(clientX, clientY) {
  if (!drag.el) return;

  // Offset keeps the ghost anchored to where the user grabbed the card
  drag.el.style.left = (clientX - drag.offsetX) + 'px';
  drag.el.style.top  = (clientY - drag.offsetY) + 'px';

  // Highlight which pile the ghost is hovering over
  clearDropTargets();
  var target = getDropTarget(clientX, clientY);
  if (target) target.classList.add('drop-target');
}

/*  
   END DRAG (release)
     */

/**
 * Attempt to place the dragged card(s) at the release position.
 * Cleans up the ghost and resets drag state regardless of outcome.
 */
function endDrag(clientX, clientY) {
  if (!drag.active) return;

  clearDropTargets();

  // Restore the original card's full opacity
  if (drag.sourceCardEl) {
    drag.sourceCardEl.style.opacity = '';
  }

  // Try to drop onto whatever pile is at the cursor
  var dropEl = getDropTarget(clientX, clientY);
  var moved  = false;

  if (dropEl) {
    var dt    = dropEl.dataset.type;
    var dtIdx = (dropEl.dataset.index !== undefined)
                ? parseInt(dropEl.dataset.index) : null;

    if (dt === 'foundation') {
      moved = handleDropOnFoundation(dtIdx);
    } else if (dt === 'tableau') {
      moved = handleDropOnTableau(dtIdx);
    }
  }

  // Remove the ghost
  if (drag.el) {
    drag.el.remove();
    drag.el = null;
  }

  // Reset drag state
  drag = {
    active: false, cards: [], source: null, sourceIdx: null,
    cardIndex: null, el: null, offsetX: 0, offsetY: 0, sourceCardEl: null,
  };

  // If the drop was rejected, re-render to visually restore the card
  if (!moved) render();
}

/*  
   DROP HANDLERS
     */

/**
 * Try to drop dragged card(s) onto a foundation pile.
 * Only single cards are allowed onto foundations.
 * @param {number} foundIdx
 * @returns {boolean} true if the move was accepted
 */
function handleDropOnFoundation(foundIdx) {
  if (drag.cards.length !== 1) return false;
  var card = drag.cards[0];
  if (!canDropOnFoundation(card, foundIdx)) return false;

  saveUndo();

  // Remove card from source
  if (drag.source === 'waste') {
    state.waste.pop();
  } else if (drag.source === 'foundation') {
    state.foundations[drag.sourceIdx].pop();
  } else if (drag.source === 'tableau') {
    state.tableau[drag.sourceIdx].splice(drag.cardIndex, 1);
    flipTopCard(drag.sourceIdx); // reveal the card beneath
  }

  state.foundations[foundIdx].push(card);
  addScore(SCORE_TABLEAU_TO_FOUNDATION);
  state.moveCount++;

  soundFoundation();
  render();
  checkWin();

  return true;
}

/**
 * Try to drop dragged card(s) onto a tableau column.
 * Supports moving an entire sub-stack.
 * @param {number} col
 * @returns {boolean} true if the move was accepted
 */
function handleDropOnTableau(col) {
  var cards = drag.cards;
  if (!canDropOnTableau(cards[0], col)) return false;

  saveUndo();

  // Remove card(s) from source
  if (drag.source === 'waste') {
    state.waste.pop();
    addScore(SCORE_WASTE_TO_TABLEAU);
  } else if (drag.source === 'foundation') {
    state.foundations[drag.sourceIdx].pop();
    addScore(SCORE_FOUNDATION_TO_TABLEAU);
  } else if (drag.source === 'tableau') {
    state.tableau[drag.sourceIdx].splice(drag.cardIndex, cards.length);
    flipTopCard(drag.sourceIdx);
    addScore(SCORE_WASTE_TO_TABLEAU);
  }

  state.tableau[col].push.apply(state.tableau[col], cards);
  state.moveCount++;

  soundDrop();
  render();

  return true;
}

/*  
   DROP TARGET DETECTION
     */

/**
 * Find which pile element is at the cursor position.
 * Checks foundations first, then tableau columns.
 * Annotates the element with data-type and data-index.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {Element|null}
 */
function getDropTarget(clientX, clientY) {
  var i, rect, el;

  // ── Foundations ──
  for (i = 0; i < 4; i++) {
    rect = DOM.foundations[i].getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom) {
      el = DOM.foundations[i];
      el.dataset.type  = 'foundation';
      el.dataset.index = i;
      return el;
    }
  }

  // ── Tableau columns ──
  for (i = 0; i < 7; i++) {
    rect = DOM.tableau[i].getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom) {
      el = DOM.tableau[i];
      el.dataset.type  = 'tableau';
      el.dataset.index = i;
      return el;
    }
  }

  return null;
}

/**
 * Remove the drop-target highlight class from all piles.
 */
function clearDropTargets() {
  document.querySelectorAll('.drop-target').forEach(function(el) {
    el.classList.remove('drop-target');
  });
}

/*  
   GLOBAL DRAG LISTENERS
   Attached to document so events are captured
   even if the cursor moves off the card.
     */
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup',   onMouseUp);
document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend',  onTouchEnd,  { passive: false });
