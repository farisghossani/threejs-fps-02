// The simulation: one fixed step that moves the player, the bots, the bullets, the grenades, the
// bomb and the round, and one derived view object that the HUD and the capture setups read. It owns
// every piece of mutable state in the game and touches no DOM and no WebGL, so the same code runs
// in a browser and under a test harness, at the same speed whatever the frame rate is doing.
//
// It is also the only place the parts meet: the objective tells the bots where to go, the economy
// tells the weapons what the player owns, and a grenade or a bomb asks the same damage path a
// bullet does.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createRound } from './round.js';
import { CATALOG, createEconomy } from './economy.js';
import { createBomb } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createViewmodel } from './viewmodel.js';
import { PLAYER_SPAWN } from './arena.js';
import { aimDirection, resolveShot, surfaceNormal } from './combat.js';

const scratchEye = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchMuzzle = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const NO_KEYS = new Set();

// How much of a blast a body takes: full at the middle, nothing at the rim.
const BLAST = { radius: 7.5, damage: 320 };

export function createSim({ arena, scene, seed }) {
  const rng = createRng(seed);
  const effects = createEffects(scene, arena.sprites);
  const economy = createEconomy();
  const player = createPlayer(arena.colliders);
  const weapons = createWeapons(economy);
  const viewmodel = createViewmodel(arena.sprites);
  const round = createRound();
  const bomb = createBomb({ sites: arena.sites, parent: scene });
  const grenades = createGrenades({ colliders: arena.colliders, effects, rng, parent: scene });
  const bots = createBots({
    arena,
    rng,
    effects,
    colliders: arena.colliders,
    parent: scene,
    sprites: arena.sprites,
  });

  // Transient feedback: how long a hit marker, a kill marker and the damage vignette still show.
  const feedback = { hit: 0, kill: 0, hurt: 0 };
  const state = { tick: 0, time: 0, buyOpen: false, buyNote: '', detonated: false };
  const bodies = [player.state, ...bots.bodies];

  const context = {
    colliders: arena.colliders,
    bodies,
    playerBody: player.state,
    playerSpeed: player.speed,
    damagePlayer: (amount) => applyDamage(player.state, amount),
    damageBody: (body, amount) => applyDamage(body, amount),
    frozen: false,
  };

  const view = {
    phase: 'buy',
    roundIndex: 1,
    timeLeft: CONFIG.match.roundSeconds,
    buyLeft: CONFIG.match.buySeconds,
    score: 0,
    kills: 0,
    headshots: 0,
    accuracy: 0,
    enemies: bots.bots.length,
    enemiesTotal: bots.bots.length,
    health: CONFIG.player.health,
    armour: 0,
    money: CONFIG.economy.start,
    grenades: 0,
    alive: true,
    mag: 0,
    reserve: 0,
    weapon: '',
    slot: 0,
    slots: [],
    spread: 0,
    reloading: 0,
    crouching: false,
    banner: CONFIG.match.bannerSeconds,
    feed: [],
    result: null,
    hitMarker: 0,
    killMarker: 0,
    hurt: 0,
    planting: 0,
    buyOpen: false,
    buyRows: [],
    buyNote: '',
    bomb: {
      phase: 'carried',
      planted: false,
      defused: false,
      exploded: false,
      siteIndex: -1,
      siteId: '',
      siteName: '',
      carrySite: '',
      inSite: -1,
      fuseLeft: 0,
      fuseTotal: CONFIG.bomb.fuseSeconds,
      plantProgress: 0,
      defuseProgress: 0,
    },
  };

  function setupRound(advance) {
    if (advance) round.beginRound();
    bots.reset(round.state.index);
    player.spawn(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
    weapons.refill();
    effects.reset();
    grenades.reset();
    bomb.reset();
    feedback.hit = 0;
    feedback.kill = 0;
    feedback.hurt = 0;
    state.buyOpen = false;
    state.buyNote = '';
    state.detonated = false;
    view.buyRows = [];
    syncView();
  }

  // One damage path for every source: a bullet names the zone it crossed, a grenade and a bomb ask
  // for a number. The vest takes half of it, a kill pays the bounty, and the player's own hits are
  // the only ones that raise a marker.
  function applyDamage(body, amount, zone = null) {
    if (!body.alive) return false;
    if (body === player.state) {
      player.damage(economy.absorb(amount));
      feedback.hurt = 0.55;
      return false;
    }
    body.health -= amount;
    feedback.hit = 0.4;
    if (bots.onDamaged(body)) {
      const victim = bots.bodyOf(body);
      const head = zone === 'head';
      round.countKill(head);
      economy.awardKill(head);
      feedback.kill = 0.7;
      round.addFeed(`${victim ? victim.name : 'DEFENDER'} DOWN${head ? ' — HEADSHOT' : ''}`, 'kill');
      return true;
    }
    return false;
  }

  function explode(x, y, z, radius, damage) {
    effects.blast(x, y, z);
    for (const body of bodies) {
      if (!body.alive) continue;
      const centreY = body.position.y + body.height * 0.5;
      const distance = Math.hypot(body.position.x - x, centreY - y, body.position.z - z);
      if (distance > radius) continue;
      applyDamage(body, Math.pow(1 - distance / radius, 1.4) * damage);
    }
    bots.reportNoise(x, z, 40);
  }

  // One round from the gun: the ray leaves the eye, which is where the crosshair points, and the
  // tracer is drawn from the muzzle of the model in the hands, which is where the weapon is.
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

    viewmodel.muzzleWorld(scratchMuzzle, scratchEye.x, scratchEye.y, scratchEye.z, yaw, pitch);
    const hit = resolveShot(scratchEye, scratchDir, arena.colliders, bodies, player.state, def.range);
    const endX = scratchEye.x + scratchDir.x * hit.distance;
    const endY = scratchEye.y + scratchDir.y * hit.distance;
    const endZ = scratchEye.z + scratchDir.z * hit.distance;
    effects.tracer(scratchMuzzle.x, scratchMuzzle.y, scratchMuzzle.z, endX, endY, endZ);

    if (hit.body) {
      round.countHit();
      applyDamage(hit.body, def.damage[hit.zone], hit.zone);
    } else if (hit.distance < def.range) {
      if (hit.box) surfaceNormal(scratchNormal, hit.box, endX, endY, endZ);
      else scratchNormal.copy(scratchDir).multiplyScalar(-1);
      effects.impact(endX, endY, endZ, scratchNormal.x, scratchNormal.y, scratchNormal.z);
    }
    bots.reportNoise(scratchEye.x, scratchEye.z);
    return true;
  }

  // The buy menu is a real state of the round: it opens with one key, it is only open while the
  // round is still in its buy phase, and everything it sells is a line in economy.js.
  function setBuy(open) {
    state.buyOpen = open;
    state.buyNote = open ? 'BUY PHASE' : '';
    view.buyRows = open ? economy.rows() : [];
  }

  function toggleBuy() {
    setBuy(!state.buyOpen);
  }

  // Everything the keyboard does that is not walking or firing: the shop, the weapon slots and the
  // frag. Captures drive the same keys the keyboard produces, so there is one path here.
  function useInput(input) {
    if (input.pressed.has('KeyB')) toggleBuy();

    if (state.buyOpen && round.state.phase === 'buy') {
      for (let index = 0; index < CATALOG.length; index += 1) {
        if (!input.pressed.has(`Digit${index + 1}`)) continue;
        const item = CATALOG[index];
        const result = economy.buy(item.id);
        state.buyNote = result.ok ? `BOUGHT ${item.name}` : `${item.name} — ${result.reason.toUpperCase()}`;
        if (result.ok) weapons.refill();
      }
      view.buyRows = economy.rows();
      return;
    }

    for (let index = 0; index < 3; index += 1) {
      if (input.pressed.has(`Digit${index + 1}`)) weapons.switchTo(index);
    }

    // The reload is the one key the capturing setups hold as well: an empty magazine is never a
    // dead end, it is a two second pause.
    if (input.pressed.has('KeyR')) weapons.reload();

    const wantsFrag = input.pressed.has('KeyG') || input.pressed.has('Digit4');
    if (wantsFrag && round.state.phase === 'live' && economy.takeGrenade()) {
      player.eyePoint(scratchEye);
      aimDirection(scratchDir, player.aimYaw(), player.aimPitch());
      grenades.throwAt(scratchEye.x, scratchEye.y, scratchEye.z, scratchDir.x, scratchDir.y, scratchDir.z);
    }
  }

  function syncView() {
    const def = weapons.def();
    const pool = weapons.current();
    const bombState = bomb.state;
    view.phase = round.state.phase;
    view.roundIndex = round.state.index;
    view.timeLeft = round.state.timeLeft;
    view.buyLeft = round.state.buyLeft;
    view.score = round.state.score;
    view.kills = round.state.kills;
    view.headshots = round.state.headshots;
    view.accuracy = round.accuracy();
    view.enemies = bots.aliveCount();
    view.enemiesTotal = bots.bots.length;
    view.health = Math.ceil(player.state.health);
    view.armour = Math.round(economy.state.armour);
    view.money = economy.state.money;
    view.grenades = economy.state.grenades;
    view.alive = player.state.alive;
    view.mag = pool.mag;
    view.reserve = pool.reserve;
    view.weapon = def.name;
    view.slot = def.slot;
    view.slots[0] = weapons.owns('rifle');
    view.slots[1] = weapons.owns('smg');
    view.slots[2] = weapons.owns('pistol');
    view.spread = weapons.spread(player.speed(), player.state.crouching, player.state.onGround);
    view.reloading = weapons.state.reloadLeft > 0 ? 1 - weapons.state.reloadLeft / def.reloadSeconds : 0;
    view.crouching = player.state.crouching;
    view.banner = round.state.bannerLeft;
    view.feed = round.state.feed;
    view.result = round.state.result;
    view.hitMarker = feedback.hit;
    view.killMarker = feedback.kill;
    view.hurt = feedback.hurt;
    view.planting = bombState.phase === 'carried' ? bombState.plantProgress : 0;
    view.buyOpen = state.buyOpen;
    view.buyNote = state.buyNote;

    const carriedSite = bombState.site >= 0 ? arena.sites[bombState.site] : null;
    view.bomb.phase = bombState.phase;
    view.bomb.planted = bombState.phase === 'planted';
    view.bomb.defused = bombState.phase === 'defused';
    view.bomb.exploded = bombState.phase === 'exploded';
    view.bomb.siteIndex = bombState.spot;
    view.bomb.siteId = bombState.spot >= 0 ? arena.sites[bombState.spot].id : '';
    view.bomb.siteName = bombState.spot >= 0 ? arena.sites[bombState.spot].name : '';
    view.bomb.carrySite = carriedSite ? carriedSite.id : '';
    view.bomb.inSite = bombState.site;
    view.bomb.fuseLeft = bombState.fuseLeft;
    view.bomb.plantProgress = bombState.plantProgress;
    view.bomb.defuseProgress = bombState.defuseProgress;
  }

  function step(dt, input) {
    state.tick += 1;
    state.time += dt;
    const buying = round.state.phase === 'buy';

    player.look(input.lookX, input.lookY);
    useInput(input);
    weapons.step(dt);

    // During the buy phase the player stands in the spawn with the menu open: the round has not
    // started and the defenders are still on their marks.
    player.step(dt, buying ? NO_KEYS : input.keys);
    if (buying) player.state.velocity.set(0, 0, 0);
    viewmodel.pose(weapons, { speed: player.speed(), onGround: player.state.onGround }, dt);

    if (weapons.triggerHeld(input.firing && !buying)) fire();

    context.frozen = buying;
    bots.step(dt, context);
    grenades.step(dt, context);
    effects.step(dt);

    // The bomb: a key held inside a site plants it, the nearest defender walks onto it and holds,
    // and the fuse runs either way until one of them is done.
    if (bomb.plant(dt, input.keys.has('KeyE'), player.state.position.x, player.state.position.z, player.speed())) {
      round.state.planted = true;
      round.addFeed(`BOMB PLANTED AT ${arena.sites[bomb.state.spot].id}`, 'win');
      economy.awardPlant();
    }
    bomb.step(dt);

    if (bomb.state.phase === 'planted') {
      bots.orderDefend(bomb.state.x, bomb.state.z);
      const near = bots.nearestTo(bomb.state.x, bomb.state.z);
      if (near && near.distance <= CONFIG.bomb.botDefuseRadius) {
        if (bomb.defuseTick(dt, near.bot.index)) round.addFeed('BOMB DEFUSED', 'loss');
      } else {
        bomb.clearDefuse();
      }
    } else if (bomb.state.phase === 'exploded' && !state.detonated) {
      state.detonated = true;
      bots.clearOrder();
      round.addFeed('BOMB DETONATED', 'win');
      explode(bomb.state.x, 0.4, bomb.state.z, BLAST.radius, BLAST.damage);
    }

    feedback.hit = Math.max(0, feedback.hit - dt);
    feedback.kill = Math.max(0, feedback.kill - dt);
    feedback.hurt = Math.max(0, feedback.hurt - dt);

    const wasOver = round.state.result !== null;
    const transition = round.step(dt, {
      enemiesLeft: bots.aliveCount(),
      playerAlive: player.state.alive,
      planted: round.state.planted,
      bombPhase: bomb.state.phase,
    });
    if (!wasOver && round.state.result) economy.awardRound(round.state.result.won);
    if (transition === 'next') setupRound(true);
    syncView();
  }

  setupRound(false);

  return {
    state,
    view,
    player,
    weapons,
    economy,
    bots,
    round,
    bomb,
    grenades,
    effects,
    bodies,
    weaponModel: viewmodel.group,
    step,
    fire,
    setupRound,
    // The capture setups drive the game the way the keyboard does, so a setup that needs the buy
    // menu open asks for it here rather than reaching for the DOM.
    setBuyOpen(open) {
      setBuy(open);
      syncView();
    },
    setBuyNote(note) {
      state.buyNote = note;
      syncView();
    },
    syncView,
  };
}
