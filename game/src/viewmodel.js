// The first-person view: the two weapons, the shooter's arms holding them, and the flash at the
// muzzle. It is a child of the camera, so it is drawn in camera space, and it is posed entirely
// from the weapon state the simulation writes — bob, sway, reload, kick — never from the clock.
// It also answers the one question the firing code needs: where, in the world, the muzzle is
// right now, which is where the tracer has to start from to look like it left the barrel.
import * as THREE from 'three';
import { PALETTE, tint } from './palette.js';
import { CONFIG } from './config.js';

const SLOTS = ['rifle', 'pistol'];

// The muzzle's resting place in camera space, and the point every tracer is drawn from. The
// barrel is built to end here, so the flare, the tracer and the barrel tip are the same spot.
const MUZZLE = { rifle: { x: 0.24, y: -0.155, z: -0.88 }, pistol: { x: 0.26, y: -0.205, z: -0.58 } };

// The gun is near-black gunmetal and the arm is canvas and leather, with the team's colour only at
// the cuff. A bright weapon in the corner of the frame reads as a placeholder, and it fights the
// one thing in the corner that should carry the player's colour: the player.
function materials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: tint('gun'), roughness: 0.46, metalness: 0.52 }),
    steel: new THREE.MeshStandardMaterial({ color: tint('gunPoly'), roughness: 0.32, metalness: 0.72 }),
    sleeve: new THREE.MeshStandardMaterial({ color: tint('sleeveFabric'), roughness: 0.95, metalness: 0.02 }),
    glove: new THREE.MeshStandardMaterial({ color: tint('gloveLeather'), roughness: 0.8, metalness: 0.04 }),
    cuff: new THREE.MeshStandardMaterial({ color: tint('accent', 0.8), roughness: 0.9, metalness: 0.02 }),
  };
}

// A forearm in a sleeve with a glove at the end. The glove sits where the hand would be on the gun
// and the sleeve runs back and down out of the bottom of the frame, which is the whole trick of a
// first-person arm: the camera is the shoulder, so only the last forty centimetres of the arm can
// ever be in shot.
function buildArm(materials, side, placement) {
  const arm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.115, 0.46), materials.sleeve);
  sleeve.position.set(0, 0, 0.22);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.125, 0.06), materials.cuff);
  cuff.position.set(0, 0, 0.02);
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.18), materials.glove);
  glove.position.set(0, 0, -0.07);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.1), materials.glove);
  thumb.position.set(side * -0.06, 0.04, -0.06);
  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.05, 0.07), materials.glove);
  knuckles.position.set(0, 0.06, -0.14);
  arm.add(sleeve, cuff, glove, thumb, knuckles);
  arm.position.set(placement.x, placement.y, placement.z);
  arm.rotation.set(placement.pitch, placement.yaw, placement.roll);
  return arm;
}

function buildRifle(materials) {
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.092, 0.5), materials.body);
  receiver.position.set(0.24, -0.19, -0.44);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.24), materials.steel);
  handguard.position.set(0.24, -0.172, -0.64);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.26), materials.steel);
  barrel.position.set(0.24, -0.158, -0.75);
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), materials.steel);
  brake.position.set(0.24, -0.155, -0.85);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.19, 0.1), materials.body);
  magazine.position.set(0.24, -0.31, -0.4);
  magazine.rotation.x = -0.24;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.24), materials.body);
  stock.position.set(0.24, -0.2, -0.16);
  const optic = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.036, 0.12), materials.steel);
  optic.position.set(0.24, -0.12, -0.44);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), materials.steel);
  rail.position.set(0.24, -0.14, -0.66);
  const grip = buildArm(materials, 1, { x: 0.235, y: -0.27, z: -0.4, pitch: 1.0, yaw: 0.08, roll: 0 });
  const support = buildArm(materials, -1, { x: 0.2, y: -0.245, z: -0.64, pitch: 1.08, yaw: -0.18, roll: 0 });
  model.add(receiver, handguard, barrel, brake, magazine, stock, optic, rail, grip, support);
  return model;
}

function buildPistol(materials) {
  const model = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.078, 0.3), materials.steel);
  slide.position.set(0.26, -0.2, -0.44);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), materials.body);
  frame.position.set(0.26, -0.25, -0.36);
  const grip = buildArm(materials, 1, { x: 0.255, y: -0.28, z: -0.4, pitch: 1.02, yaw: 0.06, roll: 0 });
  const support = buildArm(materials, -1, { x: 0.19, y: -0.3, z: -0.5, pitch: 1.18, yaw: -0.3, roll: 0 });
  model.add(slide, frame, grip, support);
  return model;
}

export function createViewmodel(sprites) {
  const mats = materials();
  const group = new THREE.Group();
  const models = { rifle: buildRifle(mats), pistol: buildPistol(mats) };
  const flashes = {};
  const lights = {};

  for (const slot of SLOTS) {
    const flare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sprites.glow,
        color: tint('sun'),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    flare.position.set(MUZZLE[slot].x, MUZZLE[slot].y, MUZZLE[slot].z + 0.04);
    flare.scale.setScalar(0.001);
    flare.visible = false;
    flare.renderOrder = 6;

    const light = new THREE.PointLight(tint('accent'), 0, 7, 2);
    light.position.set(MUZZLE[slot].x, MUZZLE[slot].y + 0.04, MUZZLE[slot].z + 0.24);

    group.add(models[slot], flare, light);
    flashes[slot] = flare;
    lights[slot] = light;
  }
  models.pistol.visible = false;

  // A short, soft light in the shooter's own corner of the world. Without it the gun is lit only by
  // whatever it happens to be facing, so it goes black against a bright wall and washed out against
  // a dark one — the one surface in the frame that is always in shot has to always be readable. It
  // sits ahead of the stock rather than on the sleeve: a lamp a hand's width from a glove is a
  // blown-out hotspot, not a fill.
  const heldLight = new THREE.PointLight(tint('haze'), 1.5, 3.6, 2);
  heldLight.position.set(0.42, 0.02, -0.18);
  group.add(heldLight);

  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const offset = new THREE.Vector3();
  const state = { swayPhase: 0, sway: 0 };

  // Where the barrel tip is in the world, for the muzzle of the flash, the tracer and the light.
  function muzzleWorld(out, eyeX, eyeY, eyeZ, yaw, pitch) {
    const slot = SLOTS[state.slot ?? 0];
    const tip = MUZZLE[slot];
    const model = models[slot];
    offset.set(tip.x + model.position.x, tip.y + model.position.y, tip.z + model.position.z);
    euler.set(pitch, yaw, 0);
    quaternion.setFromEuler(euler);
    offset.applyQuaternion(quaternion);
    return out.set(eyeX + offset.x, eyeY + offset.y, eyeZ + offset.z);
  }

  // Posed from the weapon state only: the model lags behind a run, drops while reloading and
  // kicks back with each shot; the flash is a flare that fades over two frames.
  function pose(weapon, motion, dt) {
    const slot = SLOTS[weapon.state.slot];
    const model = models[slot];
    state.slot = weapon.state.slot;
    model.visible = weapon.state.reloadLeft <= 0;
    models[slot === 'rifle' ? 'pistol' : 'rifle'].visible = false;

    const speedFactor = motion ? Math.min(1, motion.speed / CONFIG.player.walkSpeed) : 0;
    state.swayPhase += dt * (3 + speedFactor * 6);
    const sway = Math.sin(state.swayPhase) * 0.006 * speedFactor;
    state.sway = sway;

    model.position.set(sway * 0.8, sway + (motion && !motion.onGround ? -0.02 : 0), weapon.state.kick);
    if (weapon.state.reloadLeft > 0) {
      const progress = Math.min(1, (weapon.def().reloadSeconds - weapon.state.reloadLeft) * 3);
      model.rotation.set(-0.7 * progress, 0, 0);
      model.position.y -= 0.12 * progress;
    } else {
      model.rotation.set(weapon.state.kick * 2.4, 0, 0);
    }

    const lit = weapon.state.flash > 0;
    const flare = flashes[slot];
    const light = lights[slot];
    flare.visible = lit;
    light.intensity = lit ? 12 : 0;
    if (lit) {
      const strength = Math.min(1, weapon.state.flash * 20);
      flare.material.opacity = 0.45 + strength * 0.55;
      flare.scale.setScalar(0.12 + strength * 0.1);
      flare.material.rotation = weapon.state.flash * 26;
    }
  }

  function reset() {
    state.swayPhase = 0;
    state.sway = 0;
    for (const slot of SLOTS) {
      models[slot].position.set(0, 0, 0);
      models[slot].rotation.set(0, 0, 0);
      flashes[slot].visible = false;
      lights[slot].intensity = 0;
    }
  }

  return { group, models, muzzleWorld, pose, reset, muzzleOffset: MUZZLE };
}
