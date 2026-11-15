// The guns, as numbers: damage per hit zone, the gap between shots, the reload, the spread it
// trades for moving and the recoil it kicks back at the shooter. The table holds every number the
// gunplay turns on, so the feel of a weapon is one object away from whoever is tuning it; the
// parts of the gun, and the arms holding them, live in viewmodel.js. Nothing here reads the clock
// or the DOM — it answers the simulation and is answered by it.
import { CONFIG } from './config.js';

// Damage is per zone: a rifle head shot is lethal outright, a leg shot is not worth the round.
// spreadStill is the cone when standing, spreadMove is added in full at walking speed, and
// spreadCrouch multiplies the result when the shooter is low and settled.
export const WEAPON_DEFS = {
  rifle: {
    id: 'rifle',
    name: 'AR-11 RIFLE',
    slot: 0,
    key: 'Digit1',
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
  smg: {
    id: 'smg',
    name: 'MP-9 SMG',
    slot: 1,
    key: 'Digit2',
    magSize: 25,
    reserve: 100,
    fireGap: 0.072,
    reloadSeconds: 1.9,
    automatic: true,
    range: 62,
    damage: { head: 62, body: 22, legs: 15 },
    spreadStill: 0.0026,
    spreadMove: 0.013,
    spreadAir: 0.05,
    spreadCrouch: 0.7,
    bloomPerShot: 0.0026,
    bloomMax: 0.02,
    bloomDecay: 0.03,
    recoilPitch: 0.0054,
    recoilPitchGrowth: 0.0008,
    recoilPitchMax: 0.036,
    recoilYaw: 0.0022,
    recoilRecover: 0.42,
    kickViewModel: 0.04,
  },
  pistol: {
    id: 'pistol',
    name: 'P-9 SIDEARM',
    slot: 2,
    key: 'Digit3',
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

export const SLOTS = ['rifle', 'smg', 'pistol'];

export function createWeapons(economy) {
  const ammo = {};
  for (const slot of SLOTS) {
    ammo[slot] = { mag: WEAPON_DEFS[slot].magSize, reserve: WEAPON_DEFS[slot].reserve, owned: false };
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

  // A slot the player has not bought cannot be drawn: switching to it is a refusal, not a swap.
  function owns(slotId) {
    return ammo[slotId].owned;
  }

  function step(dt) {
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
        const pool = ammo[slot];
        const take = Math.min(WEAPON_DEFS[slot].magSize - pool.mag, pool.reserve);
        pool.mag += take;
        pool.reserve -= take;
        state.reloadSlot = null;
      }
    }
  }

  // A new round hands the player everything the money has bought, full.
  function refill() {
    for (const slot of SLOTS) {
      ammo[slot].owned = economy.ownsSlot(WEAPON_DEFS[slot].slot);
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
    state.wasFiring = false;
    if (!owns(SLOTS[state.slot])) {
      const fallback = SLOTS.findIndex(owns);
      if (fallback >= 0) state.slot = fallback;
    }
  }

  return {
    state,
    ammo,
    def,
    current,
    owns,
    step,
    refill,
    // The rising edge is tracked here rather than in the caller, because the sidearm needs a fresh
    // press and the automatics do not.
    triggerHeld(firing) {
      const rising = firing && !state.wasFiring;
      state.wasFiring = firing;
      return firing && (def().automatic || rising);
    },
    canFire() {
      const pool = current();
      return pool.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.swapLeft === 0;
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
      if (index < 0 || index >= SLOTS.length) return false;
      if (index === state.slot || state.swapLeft > 0 || !owns(SLOTS[index])) return false;
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
  };
}
