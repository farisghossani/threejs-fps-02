// The frag: one thrown projectile, stepped on its own fixed sub-step so a fast throw never passes
// through a wall, bouncing off the compound and going off on a fuse. The damage it does is asked
// of the simulation through a callback, so this file decides how a grenade flies and the
// simulation decides what a body takes. The bodies it can hurt are the ones the caller hands back:
// a grenade does not care whose side anyone is on, which is the point of it.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { tint } from './palette.js';
import { moveBody } from './collision.js';
import { hasLineOfSight } from './combat.js';

const GRAVITY = CONFIG.player.gravity;

export function createGrenades({ colliders, effects, rng, parent }) {
  const geometry = new THREE.SphereGeometry(0.1, 10, 8);
  const material = new THREE.MeshStandardMaterial({ color: tint('panel'), roughness: 0.6, metalness: 0.3 });
  const bandMaterial = new THREE.MeshStandardMaterial({ color: tint('hazard'), roughness: 0.7, metalness: 0.1 });

  const shells = [];
  for (let index = 0; index < 3; index += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.05, 0.21), bandMaterial);
    mesh.add(band);
    mesh.visible = false;
    parent.add(mesh);
    shells.push({
      mesh,
      live: false,
      fuse: 0,
      body: { position: new THREE.Vector3(), velocity: new THREE.Vector3(), onGround: false },
    });
  }
  let cursor = 0;

  function throwAt(originX, originY, originZ, dirX, dirY, dirZ) {
    const shell = shells[cursor];
    cursor = (cursor + 1) % shells.length;
    shell.body.position.set(originX, originY, originZ);
    shell.body.velocity.set(
      dirX * CONFIG.grenade.throwSpeed,
      dirY * CONFIG.grenade.throwSpeed + CONFIG.grenade.upward,
      dirZ * CONFIG.grenade.throwSpeed,
    );
    shell.body.onGround = false;
    shell.fuse = CONFIG.grenade.fuse;
    shell.live = true;
    shell.mesh.visible = true;
    shell.mesh.position.copy(shell.body.position);
    return true;
  }

  // The blast reaches a body if the line from the middle of it is clear: a crate takes the hit, as
  // it should.
  function damageAt(ctx, x, y, z) {
    const falloff = CONFIG.grenade.radius;
    for (const body of ctx.bodies) {
      if (!body.alive) continue;
      const centreY = body.position.y + body.height * 0.5;
      const distance = Math.hypot(body.position.x - x, centreY - y, body.position.z - z);
      if (distance > falloff) continue;
      const clear = hasLineOfSight(ctx.colliders, x, y, z, body.position.x, centreY, body.position.z);
      const shaped = Math.pow(1 - distance / falloff, 1.4) * CONFIG.grenade.damage;
      const amount = clear ? shaped : shaped * 0.45;
      if (amount < 1) continue;
      ctx.damageBody(body, amount);
    }
  }

  function step(dt, ctx) {
    const sub = CONFIG.grenade.step;
    for (const shell of shells) {
      if (!shell.live) continue;
      shell.fuse -= dt;
      let left = dt;
      while (left > 0) {
        const slice = Math.min(sub, left);
        left -= slice;
        const body = shell.body;
        body.velocity.y = Math.max(-40, body.velocity.y - GRAVITY * slice);
        moveBody(colliders, body, slice, 0.1, 0.2, 0);
        if (body.onGround) {
          body.velocity.y = Math.abs(body.velocity.y) * CONFIG.grenade.bounce;
          body.velocity.x *= 0.62;
          body.velocity.z *= 0.62;
          if (body.velocity.y < 0.6) body.velocity.y = 0;
        }
      }
      shell.mesh.position.copy(shell.body.position);
      shell.mesh.rotation.x += dt * 9 * (0.5 + rng.next() * 0.5);
      shell.mesh.rotation.z += dt * 7;

      if (shell.fuse <= 0) {
        shell.live = false;
        shell.mesh.visible = false;
        const { x, y, z } = shell.body.position;
        effects.blast(x, y + 0.2, z);
        damageAt(ctx, x, y + 0.2, z);
      }
    }
  }

  function reset() {
    for (const shell of shells) {
      shell.live = false;
      shell.mesh.visible = false;
    }
  }

  return { throwAt, step, reset };
}
