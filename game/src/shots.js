// The capture setups: ?shot=start|play|plant|end&seed=N. Each one drives the real simulation with
// scripted input until the game reaches the state the frame is meant to show, then stops. Nothing
// is posed by hand — the kill, the plant, the money spent, the damage on the health bar and the
// round result are what the simulation produced — and because the simulation is seeded and stepped
// at a fixed rate, the same query rebuilds the same frame.
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

// The round opens in its buy phase, so every setup that wants to shoot first has to let it run out.
function skipBuy(sim, drive) {
  let guard = 0;
  while (sim.view.phase === 'buy' && guard < 1200) {
    advance(sim, drive, 1);
    guard += 1;
  }
}

// One press of the shop, with the menu open the way the key opens it.
function buy(sim, drive, key, ticks = 2) {
  sim.setBuyOpen(true);
  advance(sim, drive, 1, () => drive.hold(key));
  advance(sim, drive, ticks);
  drive.release(key);
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
  bot.ai.waypoint = Math.min(waypoint, bot.route.length - 1);
  bot.ai.mode = 'patrol';
  bot.ai.facing = state.yaw;
  bot.ai.hold = 0;
  bot.ai.scan = 0;
  bot.ai.seen = 0;
  bot.ai.stuck = 0;
  bot.ai.sidestep = 0;
}

function place(player, x, z, yaw, pitch = 0) {
  player.state.position.set(x, 0, z);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = yaw;
  player.state.pitch = pitch;
  player.state.recoilPitch = 0;
  player.state.recoilYaw = 0;
}

// The opening frame: the round has just opened, the clock is on the buy phase, the banner is up,
// the shop is open and this round's money has already been spent — two purchases the simulation
// made through the same code the keyboard reaches.
function startShot(sim, drive) {
  place(sim.player, PLAYER_SPAWN.x, PLAYER_SPAWN.z, -0.22, 0.03);
  sim.setBuyOpen(true);
  advance(sim, drive, 1, () => drive.hold('Digit2'));
  advance(sim, drive, 1, () => drive.hold('Digit4'));
  advance(sim, drive, 26);
  drive.release('Digit2');
  drive.release('Digit4');
}

// The firefight: the player pushes the west lane, drops the defender holding its mouth, takes
// return fire from the two behind him while he advances, then stops to answer with the rifle and a
// frag — the frame freezes with the burst and the grenade both in the air.
function playShot(sim, drive) {
  const player = sim.player;
  const bots = sim.bots.bots;

  buy(sim, drive, 'Digit4');
  sim.setBuyOpen(false);
  skipBuy(sim, drive);

  place(player, -8.4, 7.6, 0, 0);
  post(bots[0], -8.6, 3.4, 2);
  post(bots[1], -8.8, -0.6, 1);
  post(bots[2], -9.1, -4.8, 0);
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

  // Down the lane under fire.
  drive.hold('KeyW');
  advance(sim, drive, 26);
  drive.release('KeyW');

  // The answer the frame freezes on: the frag goes out, and the last burst leaves the barrel with
  // it still in the air.
  advance(sim, drive, 1, () => {
    drive.hold('KeyG');
    aimAt(player, bots[1].state.position.x, 1.25, bots[1].state.position.z);
  });
  advance(sim, drive, 9, () => {
    aimAt(player, bots[1].state.position.x, 1.35, bots[1].state.position.z);
    drive.state.firing = true;
  });
  drive.release('KeyG');
}

// The objective, live: the attacker has planted at A, backed off the case, and the defender the
// bomb sent him to is down on it cutting the wires — with a frag on its way to him.
function plantShot(sim, drive) {
  const player = sim.player;
  const bots = sim.bots.bots;

  buy(sim, drive, 'Digit4', 2);
  buy(sim, drive, 'Digit5', 3);
  sim.setBuyOpen(false);
  skipBuy(sim, drive);

  place(player, 0.8, -12.2, 0, -0.45);
  // The man who ends up on the wires starts in the gap between the site's two covers, walking away
  // from the plant — so the plant itself is clean. The rest start in their lanes, where the
  // objective has to pull them from.
  post(bots[0], -11.2, -4, 0);
  post(bots[1], 0.8, -10.4, 1);
  post(bots[2], 12.8, -2, 0);
  post(bots[3], 15, -7, 3);
  advance(sim, drive, 10);

  // Hold the plant key inside site A for the whole 3.2 seconds the simulation asks for.
  drive.hold('KeyE');
  advance(sim, drive, 200);
  drive.release('KeyE');

  // Back off the case, the way anyone would, and then watch it: the fuse is running, a defender is
  // down on the wires and the compound is answering over the top of him.
  drive.hold('KeyS');
  advance(sim, drive, 62);
  drive.release('KeyS');
  advance(sim, drive, 208, () => aimAt(player, 0.8, 0.25, -12.2));

  // The answer: a frag aimed at the man cutting the fuse, still in the air when the frame freezes.
  advance(sim, drive, 1, () => {
    drive.hold('KeyG');
    aimAt(player, bots[1].state.position.x, 0.6, bots[1].state.position.z);
  });
  advance(sim, drive, 11, () => aimAt(player, bots[1].state.position.x, 0.7, bots[1].state.position.z));
  drive.release('KeyG');
}

// The end of a round: four defenders lined out along the lane they were holding, cleared one burst
// at a time from the mouth of it, with the result panel the game shows on its own.
function endShot(sim, drive) {
  const player = sim.player;
  const bots = sim.bots.bots;

  buy(sim, drive, 'Digit5', 3);
  sim.setBuyOpen(false);
  skipBuy(sim, drive);

  // Two defenders hold the long lane, two hold the ground behind the central mass: the fight the
  // round would actually give an attacker who pushes this line.
  place(player, -8.2, 6.6, 0, 0);
  post(bots[0], -8.6, -2.6, 0);
  post(bots[1], -8.8, -5.8, 1);
  post(bots[2], 0, -6.6, 0);
  post(bots[3], 3.0, -12.6, 2);
  advance(sim, drive, 18);

  // The aim follows the nearest defender still standing, the trigger stays down and the reload is
  // the same key a player presses. The round decides when it is over — the result panel in the
  // frame is the one the game puts up on its own.
  function sweep(ticks, until) {
    let guard = 0;
    while (guard < ticks && sim.view.kills < until && sim.view.phase === 'live') {
      let target = null;
      let nearest = Infinity;
      for (const bot of bots) {
        if (!bot.state.alive) continue;
        const dx = bot.state.position.x - player.state.position.x;
        const dz = bot.state.position.z - player.state.position.z;
        const distance = dx * dx + dz * dz;
        if (distance < nearest) {
          nearest = distance;
          target = bot;
        }
      }
      advance(sim, drive, 1, () => {
        if (target) aimAt(player, target.state.position.x, 1.05, target.state.position.z);
        if (sim.view.mag === 0) drive.hold('KeyR');
        else drive.release('KeyR');
        drive.state.firing = true;
      });
      guard += 1;
    }
    drive.state.firing = false;
    drive.release('KeyR');
  }

  sweep(400, 2);

  // Beat the first two, then push the lane to the mouth of the site and finish it.
  drive.hold('KeyW');
  advance(sim, drive, 92);
  drive.release('KeyW');
  sweep(600, 4);
  advance(sim, drive, 20);
}

const SHOTS = { start: startShot, play: playShot, plant: plantShot, end: endShot };

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
