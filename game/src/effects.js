// Effects: what a firefight leaves behind the shooters — the tracer a round draws, the sparks and
// the dust where it strikes, the mark it burns into the wall, and the flash and the cloud a frag
// makes. Every mesh and sprite is built once at load and then moved, scaled and hidden again, so a
// burst of fire allocates nothing and the frame cost does not depend on how long the round ran.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { tint } from './palette.js';

// A pool of things that appear, live a fixed time and disappear: the one shape every effect in
// this file has, so stepping and resetting them is written once.
function pool(count, build) {
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const object = build(index);
    entries.push({ object, life: 0, max: 0 });
  }
  let cursor = 0;
  return {
    entries,
    take() {
      const entry = entries[cursor];
      cursor = (cursor + 1) % entries.length;
      return entry;
    },
    step(dt, each) {
      for (const entry of entries) {
        if (entry.life <= 0) continue;
        entry.life -= dt;
        if (entry.life <= 0) entry.object.visible = false;
        else each(entry, dt);
      }
    },
    reset() {
      for (const entry of entries) {
        entry.life = 0;
        entry.object.visible = false;
      }
    },
  };
}

export function createEffects(parent, sprites) {
  const tracerMaterial = new THREE.MeshBasicMaterial({
    color: tint('sun'),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const tracerGeometry = new THREE.BoxGeometry(0.032, 0.032, 1);

  const tracers = pool(CONFIG.effects.tracerCount, () => {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  });

  const sparkMaterial = new THREE.SpriteMaterial({
    map: sprites.glow,
    color: tint('hazard'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = pool(CONFIG.effects.sparkCount, () => {
    const sprite = new THREE.Sprite(sparkMaterial.clone());
    sprite.visible = false;
    parent.add(sprite);
    return sprite;
  });

  // Sparks carry a velocity of their own, hung on the pool entry so a spark is stepped without a
  // lookup: nothing in the hot loop searches a list.
  for (const entry of sparks.entries) entry.velocity = new THREE.Vector3();

  const dustMaterial = new THREE.SpriteMaterial({
    map: sprites.glow,
    color: tint('muted'),
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const dust = pool(16, () => {
    const sprite = new THREE.Sprite(dustMaterial.clone());
    sprite.visible = false;
    parent.add(sprite);
    return sprite;
  });

  const decals = pool(CONFIG.effects.decalCount, () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({
        map: sprites.scorch,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    mesh.visible = false;
    parent.add(mesh);
    return mesh;
  });

  const flashes = pool(4, () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sprites.glow,
        color: tint('accent'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.visible = false;
    parent.add(sprite);
    return sprite;
  });

  const blastLight = new THREE.PointLight(tint('accent'), 0, 18, 2);
  parent.add(blastLight);
  let blastLeft = 0;

  function tracer(fromX, fromY, fromZ, toX, toY, toZ) {
    const length = Math.hypot(toX - fromX, toY - fromY, toZ - fromZ);
    if (length < 0.05) return;
    const entry = tracers.take();
    entry.object.position.set((fromX + toX) / 2, (fromY + toY) / 2, (fromZ + toZ) / 2);
    entry.object.lookAt(toX, toY, toZ);
    entry.object.scale.set(1, 1, length);
    entry.object.visible = true;
    entry.object.material.opacity = 0.9;
    entry.max = CONFIG.effects.tracerSeconds;
    entry.life = entry.max;
  }

  // A strike: a handful of sparks off the surface, a puff of dust, and — on the compound and not
  // on a body, which walks away — the mark it leaves, thrown along the surface normal.
  function impact(x, y, z, nx, ny, nz, mark = true) {
    if (mark) {
      const burn = decals.take();
      burn.object.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
      if (Math.abs(ny) > 0.7) {
        burn.object.rotation.set(-Math.PI / 2, 0, 0);
        if (ny < 0) burn.object.rotation.x = Math.PI / 2;
      } else {
        burn.object.lookAt(x + nx * 2, y + ny * 2, z + nz * 2);
      }
      burn.object.scale.setScalar(1);
      burn.object.material.opacity = 0.85;
      burn.object.visible = true;
      burn.max = CONFIG.effects.decalSeconds;
      burn.life = burn.max;
    }

    const hit = flashes.take();
    hit.object.position.set(x, y, z);
    hit.object.scale.setScalar(0.24);
    hit.object.material.opacity = 0.8;
    hit.object.visible = true;
    hit.max = 0.055;
    hit.life = hit.max;

    for (let index = 0; index < 5; index += 1) {
      const entry = sparks.take();
      const velocity = entry.velocity;
      const spread = 2.6;
      velocity.set(nx * spread + (index % 3 - 1) * 1.2, ny * spread + 1.6 + (index % 2) * 1.4, nz * spread + (index % 3 - 1) * 1.2);
      entry.object.position.set(x, y, z);
      entry.object.scale.setScalar(0.05);
      entry.object.material.opacity = 1;
      entry.object.visible = true;
      entry.max = CONFIG.effects.sparkSeconds;
      entry.life = entry.max;
    }

    const puff = dust.take();
    puff.object.position.set(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05);
    puff.object.scale.setScalar(0.16);
    puff.object.material.opacity = 0.34;
    puff.object.visible = true;
    puff.max = CONFIG.effects.impactSeconds;
    puff.life = puff.max;
  }

  // A frag going off: one flare that swells and dies, a light on the concrete and a spread of
  // sparks, so the explosion is read from the other end of the lane it happened in.
  function blast(x, y, z) {
    const entry = flashes.take();
    entry.object.position.set(x, y, z);
    entry.object.scale.setScalar(1.2);
    entry.object.material.opacity = 1;
    entry.object.visible = true;
    entry.max = CONFIG.effects.flashSeconds;
    entry.life = entry.max;

    const puff = dust.take();
    puff.object.position.set(x, y + 0.4, z);
    puff.object.scale.setScalar(1.6);
    puff.object.material.opacity = 0.5;
    puff.object.visible = true;
    puff.max = 0.8;
    puff.life = puff.max;

    for (let index = 0; index < 26; index += 1) {
      const spark = sparks.take();
      const velocity = spark.velocity;
      const angle = (index / 26) * Math.PI * 2;
      const lift = 0.4 + (index % 5) * 0.35;
      velocity.set(Math.cos(angle) * 7, lift * 4, Math.sin(angle) * 7);
      spark.object.position.set(x, y + 0.2, z);
      spark.object.scale.setScalar(0.1);
      spark.object.material.opacity = 1;
      spark.object.visible = true;
      spark.max = 0.6;
      spark.life = spark.max;
    }

    blastLight.position.set(x, y + 1.2, z);
    blastLeft = 0.34;
  }

  function step(dt) {
    tracers.step(dt, (entry) => {
      entry.object.material.opacity = (entry.life / entry.max) * 0.9;
    });

    sparks.step(dt, (entry, delta) => {
      const velocity = entry.velocity;
      velocity.y -= 18 * delta;
      entry.object.position.addScaledVector(velocity, delta);
      entry.object.material.opacity = entry.life / entry.max;
      entry.object.scale.setScalar(0.05 + (1 - entry.life / entry.max) * 0.02);
    });

    dust.step(dt, (entry) => {
      const fade = entry.life / entry.max;
      entry.object.material.opacity = fade * 0.34;
      entry.object.scale.setScalar(entry.object.scale.x + 1.1 * dt);
    });

    decals.step(dt, (entry) => {
      const fade = Math.min(1, entry.life / 2);
      entry.object.material.opacity = fade * 0.85;
    });

    flashes.step(dt, (entry) => {
      const fade = entry.life / entry.max;
      entry.object.material.opacity = fade;
      entry.object.scale.setScalar(1.2 + (1 - fade) * 6);
    });

    if (blastLeft > 0) {
      blastLeft = Math.max(0, blastLeft - dt);
      blastLight.intensity = blastLeft * 120;
    } else if (blastLight.intensity !== 0) {
      blastLight.intensity = 0;
    }
  }

  function reset() {
    tracers.reset();
    sparks.reset();
    dust.reset();
    decals.reset();
    flashes.reset();
    blastLeft = 0;
    blastLight.intensity = 0;
  }

  return { tracer, impact, blast, step, reset };
}
