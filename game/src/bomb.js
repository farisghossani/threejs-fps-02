// The objective: one bomb, carried by the attacker, planted in a site and then either defused by a
// defender or blown. This file owns where the bomb is and what it is doing — it knows the sites,
// because a site is a piece of ground, and nothing about who is walking or aiming at whom. The
// simulation asks it what the round should do next; the bots are told where it is by the same
// answer.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { tint } from './palette.js';

export function createBomb({ sites, parent }) {
  const state = {
    phase: 'carried',
    site: -1,
    spot: -1,
    x: sites[0].x,
    z: sites[0].z,
    plantLeft: 0,
    plantProgress: 0,
    fuseLeft: 0,
    defuseLeft: 0,
    defuseProgress: 0,
    defuseBy: null,
    beepLeft: 0,
    pulses: 0,
  };

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.14, 0.26),
    new THREE.MeshStandardMaterial({ color: tint('panel'), roughness: 0.6, metalness: 0.35 }),
  );
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: tint('hostile'),
    emissive: tint('hostile'),
    emissiveIntensity: 1.4,
    roughness: 0.5,
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), lampMaterial);
  lamp.position.set(0, 0.09, 0);
  shell.add(lamp);
  shell.visible = false;
  parent.add(shell);

  function siteAt(x, z) {
    for (let index = 0; index < sites.length; index += 1) {
      const site = sites[index];
      if (Math.hypot(x - site.x, z - site.z) <= site.radius) return index;
    }
    return -1;
  }

  // Holding the plant key inside a site, stood still, fills the bar; letting go empties it again.
  // Returns true on the tick the plant completes.
  function plant(dt, holding, x, z, speed) {
    if (state.phase !== 'carried') return false;
    const index = siteAt(x, z);
    state.site = index;
    if (index < 0 || !holding || speed > 0.6) {
      state.plantLeft = CONFIG.bomb.plantSeconds;
      state.plantProgress = 0;
      return false;
    }
    state.plantLeft = Math.max(0, state.plantLeft - dt);
    state.plantProgress = 1 - state.plantLeft / CONFIG.bomb.plantSeconds;
    if (state.plantLeft > 0) return false;

    state.phase = 'planted';
    state.spot = index;
    state.x = x;
    state.z = z;
    state.fuseLeft = CONFIG.bomb.fuseSeconds;
    state.beepLeft = 0;
    state.plantProgress = 1;
    shell.position.set(x, 0.07, z);
    shell.visible = true;
    return true;
  }

  // A defender inside reach of the bomb can undo it; the progress bar fills while they hold and
  // empties the moment they are pushed off or shot.
  function defuseTick(dt, who) {
    if (state.phase !== 'planted') return false;
    if (state.defuseBy !== who) {
      state.defuseBy = who;
      state.defuseLeft = CONFIG.bomb.defuseSeconds;
    }
    state.defuseLeft = Math.max(0, state.defuseLeft - dt);
    state.defuseProgress = 1 - state.defuseLeft / CONFIG.bomb.defuseSeconds;
    if (state.defuseLeft > 0) return false;
    state.phase = 'defused';
    state.defuseProgress = 1;
    return true;
  }

  function clearDefuse() {
    state.defuseBy = null;
    state.defuseLeft = CONFIG.bomb.defuseSeconds;
    state.defuseProgress = 0;
  }

  // The fuse, and the lamp on the case: slow at first and fast at the end, the way a fuse sounds.
  function step(dt) {
    if (state.phase !== 'planted') return;
    state.fuseLeft = Math.max(0, state.fuseLeft - dt);
    if (state.fuseLeft === 0) {
      state.phase = 'exploded';
      shell.visible = false;
      return;
    }
    const urgency = 1 - state.fuseLeft / CONFIG.bomb.fuseSeconds;
    const interval = CONFIG.bomb.beepSeconds[0] + (CONFIG.bomb.beepSeconds[1] - CONFIG.bomb.beepSeconds[0]) * urgency;
    state.beepLeft -= dt;
    if (state.beepLeft <= 0) {
      state.beepLeft += interval;
      state.pulses += 1;
    }
    const blink = state.beepLeft / interval;
    lampMaterial.emissiveIntensity = 0.5 + (1 - blink) * (1 - blink) * 4;
  }

  function reset() {
    state.phase = 'carried';
    state.site = -1;
    state.spot = -1;
    state.plantLeft = CONFIG.bomb.plantSeconds;
    state.plantProgress = 0;
    state.fuseLeft = 0;
    state.defuseLeft = CONFIG.bomb.defuseSeconds;
    state.defuseProgress = 0;
    state.defuseBy = null;
    state.beepLeft = 0;
    shell.visible = false;
  }

  reset();

  return { state, siteAt, plant, defuseTick, clearDefuse, step, reset, siteOf: (index) => sites[index] };
}
