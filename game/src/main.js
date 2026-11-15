// Boot: read the capture query, build the renderer, the simulation and the HUD, and run one loop —
// a fixed 60 Hz simulation feeding a render at the display's rate. In capture mode the loop never
// starts: the setup steps the simulation itself, the frame is drawn twice and frozen, and
// window.__shotReady tells the capture that the picture is on screen.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createArena } from './arena.js';
import { createSim } from './sim.js';
import { createRender } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { isShot, runShot } from './shots.js';

const STEP = CONFIG.tick.step;
const params = new URLSearchParams(window.location.search);
const requested = params.get('shot');
const shot = isShot(requested) ? requested : null;
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const arena = createArena();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 160);
const render = createRender({ arena, camera, container: document.getElementById('game') });
const sim = createSim({ arena, scene: render.scene, seed });
camera.add(sim.weaponModel);
const hud = createHud();
const input = createInput(render.renderer.domElement, onLockChange);

let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
let started = false;
let resultShown = false;

hud.update(sim.view);
hud.showStart();

hud.onPlay(() => {
  if (shot) return;
  if (sim.view.phase === 'over') sim.setupRound(true);
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hide();
  } else if (sim.view.phase !== 'over') {
    if (started) hud.showPaused();
    else hud.showStart();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < CONFIG.tick.maxSubSteps) {
      sim.step(STEP, input.state);
      input.endStep();
      accumulator -= STEP;
      steps += 1;
    }
    if (accumulator > STEP * CONFIG.tick.maxSubSteps) accumulator = 0;

    render.sync(sim.player);
    hud.update(sim.view);

    // The round panel is the game's own: it comes up when the simulation says the round is over,
    // and the mouse is handed back at the same moment.
    if (sim.view.phase === 'over') {
      if (!resultShown) {
        resultShown = true;
        hud.showResult(sim.view.result);
        if (document.pointerLockElement) document.exitPointerLock();
      }
    } else {
      resultShown = false;
    }
  }
  render.draw();
}

// Capture mode: step the simulation to the frame the shot asks for, paint it twice, then stop.
function capture(name) {
  runShot(name, sim);
  render.sync(sim.player);
  hud.update(sim.view);
  if (name === 'end' && sim.view.result) hud.showResult(sim.view.result);
  else hud.hide();

  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    render.sync(sim.player);
    render.draw();
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => render.resize());

render.sync(sim.player);
if (shot) capture(shot);
else requestAnimationFrame(frame);
