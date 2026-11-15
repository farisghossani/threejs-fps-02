// The simulation: one fixed step that moves the player, the bots, the bullets and the round, and
// one derived view object that the HUD and the capture setups read. It owns every piece of mutable
// state in the game and touches no DOM and no WebGL, so the same code runs in a browser and under
// a test harness, at the same speed whatever the frame rate is doing.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createRound } from './round.js';
import { PLAYER_SPAWN } from './arena.js';
import { aimDirection, muzzlePoint, resolveShot } from './combat.js';

const scratchEye = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchMuzzle = new THREE.Vector3();

export function createSim({ arena, scene, seed }) {
  const rng = createRng(seed);
  const effects = createEffects(scene);
  const player = createPlayer(arena.colliders);
  const weapons = createWeapons();
  const round = createRound();
  const bots = createBots({ arena, rng, effects, colliders: arena.colliders, parent: scene });

  // Transient feedback: how long a hit marker, a kill marker and the damage vignette still show.
  const feedback = { hit: 0, kill: 0, hurt: 0 };
  const state = { tick: 0, time: 0 };
  const bodies = [player.state, ...bots.bodies];

  const context = {
    colliders: arena.colliders,
    bodies,
    playerBody: player.state,
    playerSpeed: player.speed,
    damagePlayer,
  };

  const view = {
    phase: 'live',
    roundIndex: 1,
    timeLeft: CONFIG.match.roundSeconds,
    score: 0,
    kills: 0,
    headshots: 0,
    accuracy: 0,
    enemies: bots.bots.length,
    enemiesTotal: bots.bots.length,
    health: CONFIG.player.health,
    alive: true,
    mag: 0,
    reserve: 0,
    weapon: '',
    slot: 1,
    spread: 0,
    reloading: 0,
    crouching: false,
    banner: CONFIG.match.bannerSeconds,
    feed: [],
    result: null,
    hitMarker: 0,
    killMarker: 0,
    hurt: 0,
  };

  function setupRound(advance) {
    if (advance) round.beginRound();
    bots.reset(round.state.index);
    player.spawn(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
    weapons.refill();
    effects.reset();
    feedback.hit = 0;
    feedback.kill = 0;
    feedback.hurt = 0;
    syncView();
  }

  function damagePlayer(amount) {
    player.damage(amount);
    feedback.hurt = 0.55;
  }

  // One round from the rifle: the ray leaves the eye, which is where the crosshair points, and the
  // tracer is drawn from the muzzle, which is where the weapon is. Damage depends on the zone the
  // ray crossed, and the recoil goes back into the player's aim.
  function fire() {
    if (round.state.phase !== 'live') return false;
    const def = weapons.def();
    if (!weapons.canFire()) return false;
    const kick = weapons.fire();
    player.applyRecoil(kick.pitch, kick.yaw);
    round.countShot();

    player.eyePoint(scratchEye);
    const yaw = player.aimYaw();
    const pitch = player.aimPitch();
    aimDirection(scratchDir, yaw, pitch);
    const spread = weapons.spread(player.speed(), player.state.crouching, player.state.onGround);
    scratchDir.x += rng.signed(spread);
    scratchDir.y += rng.signed(spread);
    scratchDir.z += rng.signed(spread);
    scratchDir.normalize();

    const hit = resolveShot(scratchEye, scratchDir, arena.colliders, bodies, player.state, def.range);
    const endX = scratchEye.x + scratchDir.x * hit.distance;
    const endY = scratchEye.y + scratchDir.y * hit.distance;
    const endZ = scratchEye.z + scratchDir.z * hit.distance;
    muzzlePoint(scratchMuzzle, scratchEye.x, scratchEye.y, scratchEye.z, yaw, pitch, 0.22, 0.14);
    effects.tracer(scratchMuzzle.x, scratchMuzzle.y, scratchMuzzle.z, endX, endY, endZ);

    if (hit.body) {
      const victim = bots.bodyOf(hit.body);
      victim.state.health -= def.damage[hit.zone];
      round.countHit();
      feedback.hit = 0.4;
      if (bots.onDamaged(victim.state)) {
        round.countKill(hit.zone === 'head');
        feedback.kill = 0.7;
        round.addFeed(`${victim.name} DOWN${hit.zone === 'head' ? ' — HEADSHOT' : ''}`, 'kill');
      }
    } else if (hit.distance < def.range) {
      effects.impact(endX, endY, endZ);
    }
    bots.reportShot(scratchEye.x, scratchEye.z);
    return true;
  }

  function syncView() {
    const def = weapons.def();
    const pool = weapons.current();
    view.phase = round.state.phase;
    view.roundIndex = round.state.index;
    view.timeLeft = round.state.timeLeft;
    view.score = round.state.score;
    view.kills = round.state.kills;
    view.headshots = round.state.headshots;
    view.accuracy = round.accuracy();
    view.enemies = bots.aliveCount();
    view.enemiesTotal = bots.bots.length;
    view.health = Math.ceil(player.state.health);
    view.alive = player.state.alive;
    view.mag = pool.mag;
    view.reserve = pool.reserve;
    view.weapon = def.name;
    view.slot = def.slot;
    view.spread = weapons.spread(player.speed(), player.state.crouching, player.state.onGround);
    view.reloading = weapons.state.reloadLeft > 0 ? 1 - weapons.state.reloadLeft / def.reloadSeconds : 0;
    view.crouching = player.state.crouching;
    view.banner = round.state.bannerLeft;
    view.feed = round.state.feed;
    view.result = round.state.result;
    view.hitMarker = feedback.hit;
    view.killMarker = feedback.kill;
    view.hurt = feedback.hurt;
  }

  function step(dt, input) {
    state.tick += 1;
    state.time += dt;

    player.look(input.lookX, input.lookY);
    if (input.pressed.has('Digit1')) weapons.switchTo(0);
    if (input.pressed.has('Digit2')) weapons.switchTo(1);
    if (input.pressed.has('KeyR')) weapons.reload();
    weapons.step(dt, { speed: player.speed(), onGround: player.state.onGround });
    player.step(dt, input.keys);

    if (weapons.triggerHeld(input.firing)) fire();

    bots.step(dt, context);
    effects.step(dt);

    feedback.hit = Math.max(0, feedback.hit - dt);
    feedback.kill = Math.max(0, feedback.kill - dt);
    feedback.hurt = Math.max(0, feedback.hurt - dt);

    const transition = round.step(dt, { enemiesLeft: bots.aliveCount(), playerAlive: player.state.alive });
    if (transition === 'next') setupRound(true);
    syncView();
  }

  setupRound(false);

  return {
    state,
    view,
    player,
    weapons,
    bots,
    round,
    effects,
    bodies,
    weaponModel: weapons.view,
    step,
    fire,
    setupRound,
    damagePlayer,
  };
}
