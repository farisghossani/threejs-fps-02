// The capture setups: ?shot=start|play|end&seed=N. Each one drives the real simulation with
// scripted input until the game reaches the state the frame is meant to show, then stops. Nothing
// is posed by hand — the kill, the damage, the ammo count and the round result are what the
// simulation produced — and because the simulation is seeded and stepped at a fixed rate, the same
// query rebuilds the same frame.
import { CONFIG } from './config.js';
import { PLAYER_SPAWN } from './arena.js';
import { clamp } from './util.js';

const STEP = CONFIG.tick.step;

// A driver with the same shape as the keyboard input, so the simulation cannot tell the difference
// between a person and a capture setup.
function createDrive() {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, pressed, locked: true, firing: false, lookX: 0, lookY: 0 };
  return {
    state,
    hold(code) {
      if (!keys.has(code)) pressed.add(code);
      keys.add(code);
    },
    release(code) {
      keys.delete(code);
    },
    endStep() {
      state.lookX = 0;
      state.lookY = 0;
      pressed.clear();
    },
  };
}

function advance(sim, drive, ticks, each) {
  for (let index = 0; index < ticks; index += 1) {
    if (each) each(index);
    sim.step(STEP, drive.state);
    drive.endStep();
  }
}

function aimAt(player, x, y, z) {
  const eyeX = player.state.position.x;
  const eyeY = player.state.position.y + player.viewHeight();
  const eyeZ = player.state.position.z;
  const dx = x - eyeX;
  const dy = y - eyeY;
  const dz = z - eyeZ;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = clamp(Math.asin(dy / length), -CONFIG.player.pitchLimit, CONFIG.player.pitchLimit);
}

// Drops a defender on a spot and points it at the player, holding the stop it is nearest to. The
// bot still sees, aims, fires and reloads through its own code from the next tick on.
function post(bot, x, z, waypoint) {
  const state = bot.state;
  state.position.set(x, 0, z);
  state.velocity.set(0, 0, 0);
  state.yaw = Math.atan2(-(0 - x), -(8 - z));
  state.aimYaw = state.yaw;
  state.aimPitch = 0;
  state.alive = true;
  state.health = CONFIG.bot.health;
  bot.ai.waypoint = waypoint;
  bot.ai.mode = 'patrol';
  bot.ai.hold = 0;
  bot.ai.seen = 0;
}

function place(player, x, z, yaw, pitch = 0) {
  player.state.position.set(x, 0, z);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = yaw;
  player.state.pitch = pitch;
  player.state.recoilPitch = 0;
  player.state.recoilYaw = 0;
}

// The opening frame: the round has just started, the clock is full, the banner is up and the
// defenders are walking off their posts.
function startShot(sim, drive) {
  place(sim.player, PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw, 0.01);
  advance(sim, drive, 54);
}

// The firefight: the player pushes the west lane, drops the defender holding its mouth, takes
// return fire from the two behind him while he advances, then stops to answer — the frame freezes
// with that burst in the air and the damage already taken on the health bar.
function playShot(sim, drive) {
  const player = sim.player;
  const bots = sim.bots.bots;

  place(player, -8.4, 7.6, 0, 0);
  post(bots[0], -8.6, 2.4, 2);
  post(bots[1], -8.6, -2.2, 1);
  post(bots[2], -9, -6.8, 0);
  advance(sim, drive, 22);

  // First contact: a burst into the nearest defender's head, which drops him where he stands.
  advance(sim, drive, 2, () => {
    aimAt(player, bots[0].state.position.x, 1.5, bots[0].state.position.z);
    drive.state.firing = true;
  });
  drive.state.firing = false;
  advance(sim, drive, 34, () => {
    aimAt(player, bots[1].state.position.x, 1.35, bots[1].state.position.z);
  });

  // Down the lane under fire, then the answer the frame freezes on.
  drive.hold('KeyW');
  advance(sim, drive, 26);
  drive.release('KeyW');
  advance(sim, drive, 4, () => {
    aimAt(player, bots[1].state.position.x, 1.35, bots[1].state.position.z);
    drive.state.firing = true;
  });
}

// The end of a round: four defenders lined out along the lane they were holding, cleared one burst
// at a time from the mouth of it, with the result panel the game shows on its own.
function endShot(sim, drive) {
  const player = sim.player;
  const bots = sim.bots.bots;

  place(player, -8.2, 6.6, 0, 0);
  post(bots[0], -8.6, -1.4, 2);
  post(bots[1], -8.6, -4.6, 1);
  post(bots[2], -8.6, -7.8, 0);
  post(bots[3], -8.6, -10.6, 0);
  advance(sim, drive, 20);

  for (const bot of bots) {
    let guard = 0;
    while (bot.state.alive && guard < 60) {
      advance(sim, drive, 1, () => {
        aimAt(player, bot.state.position.x, 1.5, bot.state.position.z);
        drive.state.firing = true;
      });
      guard += 1;
    }
    drive.state.firing = false;
    advance(sim, drive, 10);
  }
  advance(sim, drive, 14);
}

const SHOTS = { start: startShot, play: playShot, end: endShot };

export function isShot(name) {
  return Object.hasOwn(SHOTS, name);
}

export function runShot(name, sim) {
  const drive = createDrive();
  sim.setupRound(false);
  SHOTS[name](sim, drive);
  drive.endStep();
  return sim.view;
}
