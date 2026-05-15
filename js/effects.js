/* ═══════════════════════════════════════════════
   EFFECTS.JS
   Canvas-based visual effects.

   Three independent systems:
   1. Background sand particles (ambient, always on)
   2. Intro screen particles (run during intro)
   3. Win golden confetti (triggered on victory)

   All kept lightweight — low particle counts,
   simple math, no dependencies on game state.
   ═══════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   1. BACKGROUND SAND PARTICLES
   Tiny golden dust motes drifting slowly downward.
   Runs continuously behind the game board.
   ───────────────────────────────────────────── */

/**
 * Initialise the ambient sand particles on the game-screen canvas.
 * Called once by game.js after the game screen is revealed.
 */
function initSandParticles() {
  var canvas = document.getElementById('particles-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var W, H;
  var particles = [];
  var COUNT = 55; // Low count keeps it smooth even on old hardware

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  // Create one particle with random position and drift speed
  function makeParticle(spreadAcrossHeight) {
    return {
      x:     Math.random() * W,
      y:     spreadAcrossHeight ? Math.random() * H : -4,
      vx:    (Math.random() - 0.5) * 0.35,  // slight left/right wobble
      vy:    0.18 + Math.random() * 0.45,   // drift downward
      r:     0.8 + Math.random() * 1.8,
      alpha: 0.08 + Math.random() * 0.22,
    };
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      // Recycle particles that drift off the bottom
      if (p.y > H + 5) {
        particles[i] = makeParticle(false);
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212,175,55,' + p.alpha + ')';
      ctx.fill();
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  for (var i = 0; i < COUNT; i++) {
    particles.push(makeParticle(true)); // spread evenly at start
  }
  loop();
}

/* ─────────────────────────────────────────────
   2. INTRO SCREEN PARTICLES
   Larger, more dramatic gold motes for the splash screen.
   Uses a separate canvas (#intro-particles-canvas).
   ───────────────────────────────────────────── */

/**
 * Initialise particles on the intro screen canvas.
 * Called once by game.js at page load.
 */
function initIntroParticles() {
  var canvas = document.getElementById('intro-particles-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var W, H;
  var particles = [];
  var COUNT = 70;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle(spreadAcrossHeight) {
    return {
      x:     Math.random() * W,
      y:     spreadAcrossHeight ? Math.random() * H : -4,
      vx:    (Math.random() - 0.5) * 0.5,
      vy:    0.25 + Math.random() * 0.55,
      r:     1 + Math.random() * 2.5,
      alpha: 0.1 + Math.random() * 0.3,
    };
  }

  function loop() {
    // Stop animating once the intro is gone from the DOM
    var introEl = document.getElementById('intro-screen');
    if (!introEl || introEl.classList.contains('hidden')) return;

    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.y > H + 5) {
        particles[i] = makeParticle(false);
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212,175,55,' + p.alpha + ')';
      ctx.fill();
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  for (var i = 0; i < COUNT; i++) {
    particles.push(makeParticle(true));
  }
  loop();
}

/* ─────────────────────────────────────────────
   3. WIN GOLDEN CONFETTI
   Triggered when the player wins. Spawns
   coloured rectangles that fall and fade out.
   ───────────────────────────────────────────── */

var _winCanvas  = null;  // the canvas element
var _winCtx     = null;  // its 2D context
var _winParts   = [];    // particle array
var _winAnimId  = null;  // requestAnimationFrame handle

/**
 * Spawn and animate golden confetti particles.
 * Creates a new full-screen canvas on top of everything.
 */
function startWinParticles() {
  // Create the canvas if it doesn't exist yet
  if (!_winCanvas) {
    _winCanvas = document.createElement('canvas');
    _winCanvas.id = 'win-particles';
    document.body.appendChild(_winCanvas);
  }

  _winCanvas.width  = window.innerWidth;
  _winCanvas.height = window.innerHeight;
  _winCtx  = _winCanvas.getContext('2d');
  _winParts = [];

  // Gold colour palette for the confetti pieces
  var colours = ['#d4af37', '#f0d060', '#c8a96e', '#e8d4a0', '#fffacd', '#ffd700'];

  // Spawn 130 particles starting above the top of the canvas
  for (var i = 0; i < 130; i++) {
    _winParts.push({
      x:        Math.random() * _winCanvas.width,
      y:        -20 - Math.random() * 260,
      vx:       (Math.random() - 0.5) * 2.5,
      vy:       1.4 + Math.random() * 3,
      size:     4 + Math.random() * 9,
      colour:   colours[Math.floor(Math.random() * colours.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 7,
      alpha:    1,
    });
  }

  _animateWin();
}

/**
 * Single animation step for confetti particles.
 * Moves each piece, fades it out once it exits the screen,
 * and stops when all particles have faded.
 */
function _animateWin() {
  _winCtx.clearRect(0, 0, _winCanvas.width, _winCanvas.height);

  var anyAlive = false;

  for (var i = 0; i < _winParts.length; i++) {
    var p = _winParts[i];
    p.x        += p.vx;
    p.y        += p.vy;
    p.rotation += p.rotSpeed;

    // Start fading once the particle has gone past the bottom edge
    if (p.y > _winCanvas.height) {
      p.alpha -= 0.016;
    }

    if (p.alpha > 0) {
      anyAlive = true;
      _winCtx.save();
      _winCtx.globalAlpha = Math.max(0, p.alpha);
      _winCtx.translate(p.x, p.y);
      _winCtx.rotate(p.rotation * Math.PI / 180);
      _winCtx.fillStyle = p.colour;
      // Draw a flat rectangle — like a real confetti piece
      _winCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      _winCtx.restore();
    }
  }

  if (anyAlive) {
    _winAnimId = requestAnimationFrame(_animateWin);
  }
}

/**
 * Stop and clean up the win confetti.
 * Called when starting a new game.
 */
function stopWinParticles() {
  if (_winAnimId) {
    cancelAnimationFrame(_winAnimId);
    _winAnimId = null;
  }
  if (_winCanvas) {
    _winCanvas.remove();
    _winCanvas = null;
    _winCtx    = null;
    _winParts  = [];
  }
}
