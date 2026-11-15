// Effects: the tracers and impact puffs a firefight leaves behind. Every mesh is built once and
// then moved and hidden again, so a burst of fire allocates nothing and the frame budget does
// not depend on how long the round has been running.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE } from './palette.js';

export function createEffects(parent) {
  const tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const impactMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.ink),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });

  const tracerGeometry = new THREE.BoxGeometry(0.022, 0.022, 1);
  const impactGeometry = new THREE.SphereGeometry(CONFIG.effects.impactSize, 6, 4);

  const tracers = [];
  for (let index = 0; index < CONFIG.effects.tracerCount; index += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    parent.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;

  const impacts = [];
  for (let index = 0; index < CONFIG.effects.impactCount; index += 1) {
    const mesh = new THREE.Mesh(impactGeometry, impactMaterial.clone());
    mesh.visible = false;
    parent.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactCursor = 0;

  function tracer(fromX, fromY, fromZ, toX, toY, toZ) {
    const entry = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const length = Math.hypot(toX - fromX, toY - fromY, toZ - fromZ);
    if (length < 0.05) return;
    entry.mesh.position.set((fromX + toX) / 2, (fromY + toY) / 2, (fromZ + toZ) / 2);
    entry.mesh.lookAt(toX, toY, toZ);
    entry.mesh.scale.set(1, 1, length);
    entry.mesh.visible = true;
    entry.mesh.material.opacity = 0.85;
    entry.life = CONFIG.effects.tracerSeconds;
  }

  function impact(x, y, z) {
    const entry = impacts[impactCursor];
    impactCursor = (impactCursor + 1) % impacts.length;
    entry.mesh.position.set(x, y, z);
    entry.mesh.scale.setScalar(1);
    entry.mesh.visible = true;
    entry.mesh.material.opacity = 0.8;
    entry.life = CONFIG.effects.impactSeconds;
  }

  function step(dt) {
    for (const entry of tracers) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.material.opacity = (entry.life / CONFIG.effects.tracerSeconds) * 0.85;
    }
    for (const entry of impacts) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.mesh.visible = false;
        continue;
      }
      const fade = entry.life / CONFIG.effects.impactSeconds;
      entry.mesh.material.opacity = fade * 0.8;
      entry.mesh.scale.setScalar(1 + (1 - fade) * 1.6);
    }
  }

  function reset() {
    for (const entry of tracers) {
      entry.life = 0;
      entry.mesh.visible = false;
    }
    for (const entry of impacts) {
      entry.life = 0;
      entry.mesh.visible = false;
    }
  }

  return { tracer, impact, step, reset };
}
