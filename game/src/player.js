// The player: movement with acceleration and friction, a crouch that lowers the eye and the hit
// box, a jump, and the recoil the guns push into the aim. The body moved here is the same
// three-zone shape the bots shoot at, so what the player sees and what the bots hit agree.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createZones, moveBody, overlapsAny } from './collision.js';
import { clamp, damp, lerp } from './util.js';

const player = CONFIG.player;
const probe = new THREE.Box3();

export function createPlayer(colliders) {
  const state = {
    alive: true,
    health: player.health,
    position: new THREE.Vector3(player.spawnX, 0, player.spawnZ),
    velocity: new THREE.Vector3(),
    yaw: player.spawnYaw,
    pitch: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    height: player.standHeight,
    eye: player.standEye,
    crouching: false,
    onGround: true,
    hurt: 0,
    bobPhase: 0,
    radius: player.radius,
    zones: createZones(player.radius),
  };

  const wish = new THREE.Vector3();

  function look(dx, dy) {
    state.yaw -= dx * player.lookSensitivity;
    state.pitch = clamp(state.pitch - dy * player.lookSensitivity, -player.pitchLimit, player.pitchLimit);
  }

  function applyRecoil(pitchKick, yawKick) {
    state.recoilPitch += pitchKick;
    state.recoilYaw += yawKick;
  }

  // The player only stands back up when there is room: standing up inside a crate would push the
  // head through it.
  function headroomFree() {
    const { x, y, z } = state.position;
    probe.min.set(x - player.radius, y + 0.02, z - player.radius);
    probe.max.set(x + player.radius, y + player.standHeight - 0.02, z + player.radius);
    return overlapsAny(colliders, probe) === null;
  }

  function step(dt, keys) {
    const wantsCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantsCrouch && !state.crouching) {
      state.crouching = true;
      state.height = player.crouchHeight;
    } else if (!wantsCrouch && state.crouching && headroomFree()) {
      state.crouching = false;
      state.height = player.standHeight;
    }
    state.eye = damp(state.eye, state.crouching ? player.crouchEye : player.standEye, 14, dt);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    // Acceleration blends the velocity toward the wish direction instead of setting it, so a
    // strafe has weight and a stop is a slide rather than a wall.
    const speed = state.crouching ? player.crouchSpeed : player.walkSpeed;
    const blend = Math.min(1, ((state.onGround ? player.groundAccel : player.airAccel) * dt) / speed);
    state.velocity.x = lerp(state.velocity.x, wish.x * speed, blend);
    state.velocity.z = lerp(state.velocity.z, wish.z * speed, blend);
    if (state.onGround && wish.lengthSq() === 0) {
      const friction = Math.max(0, 1 - player.friction * dt);
      state.velocity.x *= friction;
      state.velocity.z *= friction;
    }

    if (keys.has('Space') && state.onGround) {
      state.velocity.y = player.jumpSpeed;
      state.onGround = false;
    }
    state.velocity.y = Math.max(-30, state.velocity.y - player.gravity * dt);

    moveBody(colliders, state, dt, player.radius, state.height, player.stepUp);

    // Recoil is a real offset on the aim that settles back over the next fraction of a second: the
    // player has to fight it, exactly as they would in the hand.
    state.recoilPitch = damp(state.recoilPitch, 0, player.recoilRecover, dt);
    state.recoilYaw = damp(state.recoilYaw, 0, player.recoilRecover, dt);

    state.hurt = Math.max(0, state.hurt - dt);
    state.bobPhase += Math.hypot(state.velocity.x, state.velocity.z) * dt * 1.9;
  }

  function aimPitch() {
    return clamp(state.pitch + state.recoilPitch, -player.pitchLimit, player.pitchLimit);
  }

  function aimYaw() {
    return state.yaw + state.recoilYaw;
  }

  function speed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  function viewHeight() {
    const speedFactor = Math.min(1, speed() / player.walkSpeed);
    const bob = state.onGround ? Math.sin(state.bobPhase * 2) * player.bobAmplitude * speedFactor : 0;
    return state.eye + bob;
  }

  function eyePoint(out) {
    out.set(state.position.x, state.position.y + viewHeight(), state.position.z);
    return out;
  }

  function damage(amount) {
    if (!state.alive) return;
    state.health = Math.max(0, state.health - amount);
    state.hurt = 0.5;
    if (state.health === 0) state.alive = false;
  }

  function spawn(x, z, yaw) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    state.health = player.health;
    state.alive = true;
    state.crouching = false;
    state.height = player.standHeight;
    state.eye = player.standEye;
    state.onGround = true;
    state.hurt = 0;
    state.bobPhase = 0;
  }

  return { state, step, look, applyRecoil, aimPitch, aimYaw, eyePoint, viewHeight, speed, damage, spawn };
}
