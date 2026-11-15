// The two weapons, from one table each: a rifle and a sidearm. The table holds every number the
// gunplay turns on — damage per hit zone, the gap between shots, the reload, the spread it trades
// for moving, and the recoil it kicks back at the shooter — so the feel of a weapon is one object
// away from whoever is tuning it. The view models are built once from primitives and animated by
// state the simulation writes; nothing here reads the clock or the DOM.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE } from './palette.js';

// Damage is per zone: a rifle head shot is lethal outright, a leg shot is not worth the round.
// spreadStill is the cone when standing, spreadMove is added in full at walking speed, and
// spreadCrouch multiplies the result when the shooter is low and settled.
export const WEAPON_DEFS = {
  rifle: {
    name: 'AR-11 RIFLE',
    slot: 1,
    magSize: 30,
    reserve: 120,
    fireGap: 0.096,
    reloadSeconds: 2.15,
    automatic: true,
    range: 90,
    damage: { head: 108, body: 33, legs: 22 },
    spreadStill: 0.0014,
    spreadMove: 0.02,
    spreadAir: 0.045,
    spreadCrouch: 0.62,
    bloomPerShot: 0.0015,
    bloomMax: 0.01,
    bloomDecay: 0.022,
    recoilPitch: 0.0072,
    recoilPitchGrowth: 0.0011,
    recoilPitchMax: 0.05,
    recoilYaw: 0.0019,
    recoilRecover: 0.35,
    kickViewModel: 0.055,
  },
  pistol: {
    name: 'P-9 SIDEARM',
    slot: 2,
    magSize: 20,
    reserve: 80,
    fireGap: 0.15,
    reloadSeconds: 1.5,
    automatic: false,
    range: 60,
    damage: { head: 88, body: 26, legs: 17 },
    spreadStill: 0.0018,
    spreadMove: 0.024,
    spreadAir: 0.05,
    spreadCrouch: 0.7,
    bloomPerShot: 0.0022,
    bloomMax: 0.014,
    bloomDecay: 0.028,
    recoilPitch: 0.014,
    recoilPitchGrowth: 0.0024,
    recoilPitchMax: 0.06,
    recoilYaw: 0.0026,
    recoilRecover: 0.3,
    kickViewModel: 0.032,
  },
};

export const SLOTS = ['rifle', 'pistol'];

const MUZZLE_LOCAL = { x: 0.24, y: -0.155, z: -0.9 };

function buildRifle(materials) {
  const model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.09, 0.52), materials.hairline);
  body.position.set(0.24, -0.19, -0.48);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.36), materials.metal);
  barrel.position.set(0.24, -0.155, -0.86);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.068, 0.22), materials.metal);
  handguard.position.set(0.24, -0.168, -0.66);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.17, 0.1), materials.hairline);
  magazine.position.set(0.24, -0.3, -0.42);
  magazine.rotation.x = -0.22;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.076, 0.22), materials.hairline);
  stock.position.set(0.24, -0.2, -0.22);
  const optic = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.032, 0.1), materials.metal);
  optic.position.set(0.24, -0.12, -0.5);
  model.add(body, barrel, handguard, magazine, stock, optic);
  return model;
}

function buildPistol(materials) {
  const model = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.072, 0.28), materials.metal);
  slide.position.set(0.26, -0.21, -0.44);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), materials.hairline);
  grip.position.set(0.26, -0.32, -0.33);
  grip.rotation.x = 0.18;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.02), materials.metal);
  sight.position.set(0.26, -0.17, -0.55);
  model.add(slide, grip, sight);
  return model;
}

export function createWeapons() {
  const materials = {
    hairline: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.45, metalness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.stone), roughness: 0.3, metalness: 0.75 }),
  };

  const view = new THREE.Group();
  const models = { rifle: buildRifle(materials), pistol: buildPistol(materials) };
  const flashes = {};
  const flashLights = {};
  for (const slot of SLOTS) {
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.accent),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    flash.position.set(MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z + 0.06);
    flash.visible = false;
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
    light.position.set(MUZZLE_LOCAL.x, MUZZLE_LOCAL.y + 0.04, MUZZLE_LOCAL.z + 0.2);
    view.add(models[slot], flash, light);
    flashes[slot] = flash;
    flashLights[slot] = light;
  }
  models.pistol.visible = false;

  const ammo = {};
  for (const slot of SLOTS) {
    ammo[slot] = { mag: WEAPON_DEFS[slot].magSize, reserve: WEAPON_DEFS[slot].reserve };
  }

  const state = {
    slot: 0,
    cooldown: 0,
    reloadLeft: 0,
    reloadSlot: null,
    swapLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    burst: 0,
    burstIdle: 0,
    wasFiring: false,
  };

  const def = () => WEAPON_DEFS[SLOTS[state.slot]];
  const current = () => ammo[SLOTS[state.slot]];

  function visibleModels() {
    models.rifle.visible = state.slot === 0 && state.reloadLeft <= 0;
    models.pistol.visible = state.slot === 1 && state.reloadLeft <= 0;
  }

  function step(dt, motion) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.swapLeft = Math.max(0, state.swapLeft - dt);
    state.bloom = Math.max(0, state.bloom - dt * def().bloomDecay);
    state.burstIdle += dt;
    if (state.burstIdle > 0.3) state.burst = 0;
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);

    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0 && state.reloadSlot) {
        const slot = state.reloadSlot;
        const reloadDef = WEAPON_DEFS[slot];
        const pool = ammo[slot];
        const take = Math.min(reloadDef.magSize - pool.mag, pool.reserve);
        pool.mag += take;
        pool.reserve -= take;
        state.reloadSlot = null;
      }
    }

    // The view model answers to the same state the trigger does: it drops while reloading, lags
    // behind while running, and kicks back with each shot.
    const slot = SLOTS[state.slot];
    const model = models[slot];
    visibleModels();
    const speedFactor = motion ? Math.min(1, motion.speed / CONFIG.player.walkSpeed) : 0;
    const sway = Math.sin(state.swayPhase += dt * (3 + speedFactor * 6)) * 0.006 * speedFactor;
    model.position.z = state.kick;
    model.position.y = sway + (motion && !motion.onGround ? -0.02 : 0);
    model.position.x = sway * 0.8;
    if (state.reloadLeft > 0) {
      const progress = Math.min(1, (def().reloadSeconds - state.reloadLeft) * 3);
      model.rotation.x = -0.7 * progress;
      model.position.y = -0.12 * progress;
    } else {
      model.rotation.x = state.kick * 2.4;
    }

    const flashing = state.flash > 0;
    flashes[slot].visible = flashing;
    flashes[slot].rotation.z = state.flash * 24;
    flashes[slot].material.opacity = 0.35 + state.flash * 12;
    flashLights[slot].intensity = flashing ? 14 : 0;
  }

  state.swayPhase = 0;

  return {
    view,
    state,
    def,
    current,
    ammo,
    step,
    canFire() {
      const pool = current();
      return pool.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.swapLeft === 0;
    },
    // Automatic weapons fire while the trigger is held; the sidearm needs a fresh press, which is
    // why the rising edge is tracked here rather than in the caller.
    triggerHeld(firing) {
      const rising = firing && !state.wasFiring;
      state.wasFiring = firing;
      return firing && (def().automatic || rising);
    },
    fire() {
      const slot = SLOTS[state.slot];
      const gun = WEAPON_DEFS[slot];
      const pool = ammo[slot];
      pool.mag -= 1;
      state.cooldown = gun.fireGap;
      state.flash = 0.055;
      state.kick = gun.kickViewModel;
      state.bloom = Math.min(gun.bloomMax, state.bloom + gun.bloomPerShot);
      state.burst = Math.min(state.burst + 1, 12);
      state.burstIdle = 0;
      const climb = Math.min(gun.recoilPitchMax, gun.recoilPitch + gun.recoilPitchGrowth * state.burst);
      return { pitch: -climb, yaw: (state.burst % 2 === 0 ? 1 : -1) * gun.recoilYaw };
    },
    reload() {
      if (state.reloadLeft > 0 || state.swapLeft > 0) return false;
      const slot = SLOTS[state.slot];
      const pool = ammo[slot];
      if (pool.mag >= WEAPON_DEFS[slot].magSize || pool.reserve <= 0) return false;
      state.reloadLeft = WEAPON_DEFS[slot].reloadSeconds;
      state.reloadSlot = slot;
      return true;
    },
    switchTo(index) {
      if (index === state.slot || index < 0 || index >= SLOTS.length || state.swapLeft > 0) return false;
      state.slot = index;
      state.swapLeft = 0.42;
      state.reloadLeft = 0;
      state.reloadSlot = null;
      state.cooldown = Math.max(state.cooldown, 0.42);
      state.burst = 0;
      return true;
    },
    // The cone the next round leaves in, given how fast the shooter is moving and whether they are
    // crouched and on the ground. Running is punished, crouching and standing are rewarded.
    spread(speed, crouching, onGround) {
      const gun = def();
      const moveFactor = Math.min(1, speed / CONFIG.player.walkSpeed);
      let value = gun.spreadStill + gun.spreadMove * moveFactor * moveFactor;
      if (!onGround) value += gun.spreadAir;
      if (crouching) value *= gun.spreadCrouch;
      return value + state.bloom;
    },
    recoilRecover() {
      return def().recoilRecover;
    },
    refill() {
      for (const slot of SLOTS) {
        ammo[slot].mag = WEAPON_DEFS[slot].magSize;
        ammo[slot].reserve = WEAPON_DEFS[slot].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.reloadSlot = null;
      state.swapLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.burst = 0;
      state.slot = 0;
      state.wasFiring = false;
    },
  };
}
