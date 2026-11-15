// The defenders: four bots that walk the lanes, hold a corner, fight what they can see and go for
// the bomb the moment it is down. They use the same three-zone body and the same hitscan the
// player does, so the exchange is symmetric — the only thing the game gives them is a reaction
// time, and the only thing it takes away is accuracy that falls as the target moves faster. Every
// decision is a function of the simulation clock and the seeded generator, so a round replays tick
// for tick.
//
// What the eye gets from a defender is here too: the hostile trim that marks the other team, the
// outline that keeps a body readable against a wall at forty metres, the tag over its head, and
// the way it goes down.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE, tint } from './palette.js';
import { createZones, moveBody } from './collision.js';
import { aimDirection, hasLineOfSight, resolveShot } from './combat.js';
import { clamp, lerp, shortestAngle } from './util.js';

const config = CONFIG.bot;
const GRAVITY = CONFIG.player.gravity;
const STEP_HEIGHT = CONFIG.player.stepUp;

const scratchEye = new THREE.Vector3();
const scratchDir = new THREE.Vector3();

function createMaterials(sprites, name) {
  return {
    uniform: new THREE.MeshStandardMaterial({ color: tint('fatigues'), roughness: 0.86, metalness: 0.04 }),
    trim: new THREE.MeshStandardMaterial({ color: tint('hostile'), roughness: 0.6, metalness: 0.1 }),
    helmet: new THREE.MeshStandardMaterial({ color: tint('trim', 1.6), roughness: 0.5, metalness: 0.25 }),
    gun: new THREE.MeshStandardMaterial({ color: tint('canvas', 2.2), roughness: 0.45, metalness: 0.4 }),
    // The outline is the same boxes, a little larger, drawn back to front and lit by nothing: the
    // cheapest way to give a shape a rim that survives a dark background.
    outline: new THREE.MeshBasicMaterial({ color: tint('hostile'), side: THREE.BackSide }),
    flash: new THREE.SpriteMaterial({
      map: sprites.glow,
      color: tint('accent'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    tag: new THREE.SpriteMaterial({ map: sprites.tag(name, PALETTE.hostile), transparent: true, depthWrite: false }),
  };
}

// One figure, always the same shape: broader at the shoulders than the hit box so it reads at a
// distance, the hostile trim on the vest and the band, the helmet where the head zone is, and a
// tag over it that says which defender it is.
function buildFigure(materials) {
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.28), materials.uniform);
  legs.position.set(0, 0.33, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.32), materials.uniform);
  torso.position.set(0, 0.94, 0);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.34), materials.uniform);
  shoulders.position.set(0, 1.2, 0);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.34, 0.36), materials.trim);
  vest.position.set(0, 0.98, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), materials.helmet);
  head.position.set(0, 1.45, 0);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.35), materials.trim);
  band.position.set(0, 1.54, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.54), materials.gun);
  gun.position.set(0.18, 1, -0.34);
  const flash = new THREE.Sprite(materials.flash);
  flash.position.set(0.18, 1.03, -0.64);
  flash.scale.setScalar(0.42);
  flash.visible = false;

  // The rim: the same boxes a head taller and a couple of centimetres wider, drawn inside out and
  // unlit, so every defender carries a hostile edge that survives any background.
  const outline = new THREE.Group();
  for (const [width, height, depth, y] of [
    [0.53, 0.74, 0.35, 0.33],
    [0.64, 0.68, 0.4, 0.94],
    [0.78, 0.22, 0.42, 1.2],
    [0.38, 0.38, 0.38, 1.45],
  ]) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials.outline);
    shell.position.set(0, y, 0);
    outline.add(shell);
  }

  const tag = new THREE.Sprite(materials.tag);
  tag.position.set(0, 2.0, 0);
  tag.scale.set(1.35, 0.34, 1);

  group.add(legs, torso, shoulders, vest, head, band, gun, flash, outline, tag);
  for (const part of [legs, torso, shoulders, vest, head, band, gun]) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  return { group, legs, torso, gun, flash, tag, outline };
}

function yawTowards(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export function createBots({ arena, rng, effects, colliders, parent, sprites }) {
  const bots = [];
  const objective = { x: 0, z: 0, active: false };

  for (let index = 0; index < arena.routes.length; index += 1) {
    const route = arena.routes[index];
    const name = `DEFENDER ${index + 1}`;
    const materials = createMaterials(sprites, name);
    const figure = buildFigure(materials);
    parent.add(figure.group);
    const start = route[0];
    const bot = {
      index,
      name,
      route,
      figure,
      materials,
      state: {
        alive: true,
        health: config.health,
        position: new THREE.Vector3(start.x, 0, start.z),
        velocity: new THREE.Vector3(),
        yaw: yawTowards(start.x, start.z, 0, 8),
        aimYaw: 0,
        aimPitch: 0,
        height: config.height,
        radius: config.radius,
        onGround: true,
        hitFlash: 0,
        zones: createZones(config.radius),
      },
      ai: {
        mode: 'patrol',
        waypoint: 0,
        hold: 0,
        scan: 0,
        facing: 0,
        seen: 0,
        lost: 0,
        burstLeft: 0,
        burstGap: 0,
        cooldown: 0,
        mag: config.magSize,
        reserve: config.reserve,
        reloadLeft: 0,
        strafe: 1,
        strafeLeft: 0,
        stuck: 0,
        sidestep: 0,
        sidestepSide: 1,
        lookX: start.x,
        lookZ: start.z,
        investigateLeft: 0,
        death: 0,
        step: 0,
        flash: 0,
      },
    };
    bot.state.aimYaw = bot.state.yaw;
    bots.push(bot);
  }

  function bodyOf(state) {
    for (const bot of bots) if (bot.state === state) return bot;
    return null;
  }

  function setVelocity(bot, dirX, dirZ, speed, dt) {
    const state = bot.state;
    const blend = Math.min(1, (state.onGround ? 14 : 3) * dt);
    state.velocity.x = lerp(state.velocity.x, dirX * speed, blend);
    state.velocity.z = lerp(state.velocity.z, dirZ * speed, blend);
  }

  function turnToward(bot, targetYaw, dt) {
    const state = bot.state;
    const delta = shortestAngle(state.yaw, targetYaw);
    state.yaw += clamp(delta, -config.turnRate * dt, config.turnRate * dt);
  }

  function nextWaypoint(bot) {
    const ai = bot.ai;
    ai.waypoint = (ai.waypoint + 1) % bot.route.length;
    ai.hold = 0;
    ai.scan = 0;
  }

  // Sight: range, the cone in front of the bot, and an unbroken line to the target's chest.
  function canSee(bot, ctx) {
    const state = bot.state;
    const target = ctx.playerBody.position;
    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > config.viewRange) return 0;
    const yaw = yawTowards(state.position.x, state.position.z, target.x, target.z);
    if (Math.abs(shortestAngle(state.yaw, yaw)) > config.viewHalfAngle) return 0;
    const eyeY = state.position.y + config.muzzleHeight;
    const chestY = target.y + ctx.playerBody.height * 0.7;
    if (!hasLineOfSight(ctx.colliders, state.position.x, eyeY, state.position.z, target.x, chestY, target.z)) return 0;
    return distance;
  }

  function fireControl(bot, dt, ctx, mayFire) {
    const ai = bot.ai;
    ai.cooldown = Math.max(0, ai.cooldown - dt);
    if (ai.reloadLeft > 0) {
      ai.reloadLeft = Math.max(0, ai.reloadLeft - dt);
      if (ai.reloadLeft === 0) {
        const take = Math.min(config.magSize - ai.mag, ai.reserve);
        ai.mag += take;
        ai.reserve -= take;
      }
      return;
    }
    if (ai.mag === 0) {
      if (ai.reserve > 0) ai.reloadLeft = config.reloadSeconds;
      return;
    }
    // A bot that has been out of the fight for a moment tops the magazine up rather than walking
    // into the next exchange half empty.
    if (!mayFire) {
      if (ai.mag < config.magSize * 0.5) ai.reloadLeft = config.reloadSeconds;
      return;
    }
    if (ai.burstLeft > 0) {
      if (ai.cooldown === 0) {
        shoot(bot, ctx);
        ai.burstLeft -= 1;
        ai.cooldown = config.shotGap;
        if (ai.burstLeft === 0) ai.burstGap = rng.range(config.burstGap[0], config.burstGap[1]);
      }
      return;
    }
    ai.burstGap -= dt;
    if (ai.burstGap <= 0) {
      ai.burstLeft = rng.int(config.burstShots[0], config.burstShots[1]);
      ai.cooldown = 0;
    }
  }

  function shoot(bot, ctx) {
    const state = bot.state;
    const ai = bot.ai;
    ai.mag -= 1;
    ai.flash = 0.055;
    const eyeY = state.position.y + config.muzzleHeight;
    scratchEye.set(state.position.x, eyeY, state.position.z);
    aimDirection(scratchDir, state.aimYaw, state.aimPitch);
    const hit = resolveShot(scratchEye, scratchDir, ctx.colliders, ctx.bodies, state, 90);
    const endX = scratchEye.x + scratchDir.x * hit.distance;
    const endY = scratchEye.y + scratchDir.y * hit.distance;
    const endZ = scratchEye.z + scratchDir.z * hit.distance;
    // The tracer starts at the muzzle the figure is drawn with, so a defender's fire comes out of
    // its barrel and not out of its chest.
    const muzzleX = state.position.x + scratchDir.x * 0.6 + Math.cos(state.aimYaw) * 0.18;
    const muzzleY = eyeY + scratchDir.y * 0.6;
    const muzzleZ = state.position.z + scratchDir.z * 0.6 - Math.sin(state.aimYaw) * 0.18;
    effects.tracer(muzzleX, muzzleY, muzzleZ, endX, endY, endZ);
    if (hit.body === ctx.playerBody) {
      // Aim error is what makes a bot miss: the ray goes where the bot was pointing, and only a
      // ray that crosses the player's body does damage.
      ctx.damagePlayer(config.damage[hit.zone], state.position.x, state.position.z);
    } else if (hit.distance < 90) {
      effects.impact(endX, endY, endZ, -scratchDir.x, -scratchDir.y, -scratchDir.z);
    }
  }

  function patrol(bot, dt) {
    const state = bot.state;
    const ai = bot.ai;
    const stop = bot.route[ai.waypoint];
    const distance = Math.hypot(stop.x - state.position.x, stop.z - state.position.z);
    state.aimYaw = state.yaw;
    state.aimPitch = 0;
    if (distance < 0.7) {
      ai.hold += dt;
      ai.scan += dt;
      // Holding a corner means watching it: the body sweeps across the approach while it waits.
      turnToward(bot, ai.facing + Math.sin(ai.scan * 1.1) * 0.85, dt);
      setVelocity(bot, 0, 0, 0, dt);
      if (ai.hold >= stop.hold) nextWaypoint(bot);
      return;
    }
    const yaw = yawTowards(state.position.x, state.position.z, stop.x, stop.z);
    ai.facing = yaw;
    turnToward(bot, yaw, dt);
    setVelocity(bot, -Math.sin(yaw), -Math.cos(yaw), config.walkSpeed, dt);
    // A bot pinned on a box gives up on the stop and takes the next one instead of grinding along
    // it for the rest of the round.
    if (distance > 1 && Math.hypot(state.velocity.x, state.velocity.z) < 0.35) {
      ai.stuck += dt;
      if (ai.stuck > config.stuckSeconds) {
        nextWaypoint(bot);
        ai.stuck = 0;
      }
    } else {
      ai.stuck = 0;
    }
  }

  function alert(bot, dt) {
    const state = bot.state;
    const ai = bot.ai;
    const goalX = ai.lookX;
    const goalZ = ai.lookZ;
    const distance = Math.hypot(goalX - state.position.x, goalZ - state.position.z);
    const yaw = yawTowards(state.position.x, state.position.z, goalX, goalZ);
    if (distance > 1.6 && ai.investigateLeft > 0) {
      turnToward(bot, yaw, dt);
      setVelocity(bot, -Math.sin(yaw), -Math.cos(yaw), config.walkSpeed, dt);
      state.aimYaw = state.yaw;
      state.aimPitch = 0;
      return;
    }
    // At the position the noise came from, sweep the approach and wait for the owner of it.
    ai.scan += dt;
    turnToward(bot, yaw + Math.sin(ai.scan * 0.9) * 0.7, dt);
    setVelocity(bot, 0, 0, 0, dt);
    state.aimYaw = state.yaw;
    state.aimPitch = 0;
  }

  // The bomb is down: walk to it, shoot anything on the way, and stand on it. A bot that grinds
  // against a crate sidesteps for a moment rather than leaning on it for the rest of the round.
  function defuseRun(bot, dt) {
    const state = bot.state;
    const ai = bot.ai;
    const dx = objective.x - state.position.x;
    const dz = objective.z - state.position.z;
    const distance = Math.hypot(dx, dz);
    const yaw = yawTowards(state.position.x, state.position.z, objective.x, objective.z);
    turnToward(bot, yaw, dt);
    if (ai.sidestep > 0) {
      ai.sidestep -= dt;
      setVelocity(bot, Math.cos(yaw) * ai.sidestepSide, -Math.sin(yaw) * ai.sidestepSide, config.walkSpeed, dt);
    } else if (distance > CONFIG.bomb.botDefuseRadius * 0.7) {
      setVelocity(bot, -Math.sin(yaw), -Math.cos(yaw), config.walkSpeed, dt);
    } else {
      setVelocity(bot, 0, 0, 0, dt);
    }
    state.aimYaw = state.yaw;
    state.aimPitch = 0;

    if (distance > CONFIG.bomb.botDefuseRadius * 0.7 && Math.hypot(state.velocity.x, state.velocity.z) < 0.3) {
      ai.stuck += dt;
      if (ai.stuck > config.stuckSeconds) {
        ai.stuck = 0;
        ai.sidestep = 0.7;
        ai.sidestepSide *= -1;
      }
    } else {
      ai.stuck = 0;
    }
  }

  function engage(bot, dt, ctx, distance, targetYaw) {
    const state = bot.state;
    const ai = bot.ai;
    const target = ctx.playerBody.position;

    // The aim error starts wide, tightens while the bot keeps eyes on the target and grows again
    // with the target's speed, so a player who keeps moving is harder to hit than one who stands.
    let error = Math.max(config.aimErrorFloor, config.aimErrorStart - ai.seen * config.aimTightenPerSecond);
    error += ctx.playerSpeed() * config.aimErrorPerPlayerSpeed;
    const chestY = target.y + ctx.playerBody.height * 0.7;
    const eyeY = state.position.y + config.muzzleHeight;
    state.aimYaw = targetYaw + rng.signed(error);
    state.aimPitch = Math.atan2(chestY - eyeY, Math.max(1, distance)) + rng.signed(error * 0.6);
    turnToward(bot, targetYaw, dt);

    ai.strafeLeft -= dt;
    if (ai.strafeLeft <= 0) {
      ai.strafeLeft = rng.range(config.strafeSeconds[0], config.strafeSeconds[1]);
      ai.strafe *= -1;
    }
    const forwardX = -Math.sin(targetYaw);
    const forwardZ = -Math.cos(targetYaw);
    const rightX = Math.cos(targetYaw);
    const rightZ = -Math.sin(targetYaw);
    if (distance > config.keepDistance) setVelocity(bot, forwardX, forwardZ, config.engageSpeed, dt);
    else if (distance < config.backOffRange) setVelocity(bot, -forwardX, -forwardZ, config.walkSpeed, dt);
    else setVelocity(bot, rightX * ai.strafe, rightZ * ai.strafe, config.engageSpeed, dt);

    fireControl(bot, dt, ctx, true);
  }

  // Everything the eye reads a bot's state from: where it is, which way it faces, the walk cycle,
  // the muzzle flash and the glow of a body that was just hit.
  function poseFigure(bot, dt) {
    const state = bot.state;
    const ai = bot.ai;
    const figure = bot.figure;
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    ai.step += dt * (2 + speed * 2.6);
    ai.flash = Math.max(0, ai.flash - dt);
    state.hitFlash = Math.max(0, state.hitFlash - dt);
    figure.group.position.set(state.position.x, state.position.y, state.position.z);
    figure.group.rotation.y = state.yaw;
    figure.legs.rotation.x = Math.sin(ai.step) * Math.min(0.45, speed * 0.2);
    figure.gun.rotation.x = -state.aimPitch;
    figure.flash.visible = ai.flash > 0;
    figure.flash.material.opacity = Math.min(1, ai.flash * 22);
    bot.materials.uniform.emissive.setScalar(state.hitFlash * 2.2);
  }

  function stepBot(bot, dt, ctx) {
    const state = bot.state;
    const ai = bot.ai;
    const figure = bot.figure;

    if (!state.alive) {
      ai.death = Math.min(1, ai.death + dt / config.deathFallSeconds);
      figure.group.position.set(state.position.x, state.position.y - ai.death * 0.14, state.position.z);
      figure.group.rotation.x = -ai.death * 1.52;
      figure.flash.visible = false;
      figure.tag.visible = false;
      figure.outline.visible = false;
      return;
    }

    // The buy phase: the defenders are on their marks, sweeping the approach and going nowhere.
    if (ctx.frozen) {
      ai.scan += dt;
      turnToward(bot, ai.facing + Math.sin(ai.scan * 1.1) * 0.85, dt);
      setVelocity(bot, 0, 0, 0, dt);
      state.aimYaw = state.yaw;
      state.aimPitch = 0;
      state.velocity.y = Math.max(-30, state.velocity.y - GRAVITY * dt);
      moveBody(ctx.colliders, state, dt, config.radius, config.height, STEP_HEIGHT);
      poseFigure(bot, dt);
      return;
    }

    const distance = canSee(bot, ctx);
    if (distance > 0) {
      ai.seen += dt;
      ai.lost = config.lostSightSeconds;
      ai.lookX = ctx.playerBody.position.x;
      ai.lookZ = ctx.playerBody.position.z;
      ai.investigateLeft = 0;
    } else {
      ai.seen = Math.max(0, ai.seen - dt * 2);
      ai.lost = Math.max(0, ai.lost - dt);
    }
    ai.investigateLeft = Math.max(0, ai.investigateLeft - dt);

    // The objective outranks a patrol: once the bomb is down, everyone still standing goes for it.
    if (objective.active) ai.mode = 'defuse';
    else if (ctx.playerBody.alive && distance > 0 && ai.seen >= config.reactionSeconds) ai.mode = 'engage';
    else if (ai.mode === 'engage' && (ai.lost === 0 || !ctx.playerBody.alive)) ai.mode = 'alert';
    else if (ai.mode === 'alert' && ai.lost === 0 && ai.investigateLeft === 0) ai.mode = 'patrol';

    if (ai.mode === 'defuse') {
      defuseRun(bot, dt);
      fireControl(bot, dt, ctx, distance > 0);
    } else if (ai.mode === 'engage') {
      const target = ctx.playerBody.position;
      engage(bot, dt, ctx, distance, yawTowards(state.position.x, state.position.z, target.x, target.z));
    } else if (ai.mode === 'alert') {
      alert(bot, dt);
      fireControl(bot, dt, ctx, false);
    } else {
      patrol(bot, dt);
      fireControl(bot, dt, ctx, false);
    }

    state.velocity.y = Math.max(-30, state.velocity.y - GRAVITY * dt);
    moveBody(ctx.colliders, state, dt, config.radius, config.height, STEP_HEIGHT);
    poseFigure(bot, dt);
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
  }

  function reset(roundIndex) {
    objective.active = false;
    for (const bot of bots) {
      // Each round opens with the defenders one stop further along their route, so the same map
      // does not play out identically every time without ever leaving the seeded generator.
      bot.ai.waypoint = (roundIndex - 1) % bot.route.length;
      const start = bot.route[bot.ai.waypoint];
      const state = bot.state;
      const ai = bot.ai;
      state.position.set(start.x, 0, start.z);
      state.velocity.set(0, 0, 0);
      state.alive = true;
      state.health = config.health;
      state.hitFlash = 0;
      state.yaw = yawTowards(start.x, start.z, 0, 8);
      state.aimYaw = state.yaw;
      state.aimPitch = 0;
      state.height = config.height;
      state.onGround = true;
      ai.mode = 'patrol';
      ai.hold = 0;
      ai.scan = 0;
      ai.facing = state.yaw;
      ai.seen = 0;
      ai.lost = 0;
      ai.burstLeft = 0;
      ai.burstGap = 0;
      ai.cooldown = 0;
      ai.mag = config.magSize;
      ai.reserve = config.reserve;
      ai.reloadLeft = 0;
      ai.strafe = 1;
      ai.strafeLeft = 0;
      ai.stuck = 0;
      ai.sidestep = 0;
      ai.lookX = start.x;
      ai.lookZ = start.z;
      ai.investigateLeft = 0;
      ai.death = 0;
      ai.flash = 0;
      bot.materials.uniform.color.copy(tint('fatigues'));
      bot.materials.trim.color.copy(tint('hostile'));
      bot.materials.uniform.emissive.setScalar(0);
      bot.figure.group.rotation.x = 0;
      bot.figure.group.position.set(start.x, 0, start.z);
      bot.figure.flash.visible = false;
      bot.figure.tag.visible = true;
      bot.figure.outline.visible = true;
    }
  }

  function onDamaged(state) {
    state.hitFlash = 0.09;
    const bot = bodyOf(state);
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
      if (bot) {
        bot.ai.death = 0;
        bot.figure.flash.visible = false;
        // A dead defender stops being a colour and starts being a shape on the ground.
        bot.materials.uniform.color.copy(tint('muted', 0.45));
        bot.materials.trim.color.copy(tint('muted', 0.3));
      }
      return true;
    }
    return false;
  }

  // A noise is heard, not seen: a bot inside earshot turns for it even through a wall. This is the
  // whole of the "reacts to what it hears" behaviour, and it is called for player shots and for a
  // frag going off, which is heard further.
  function reportNoise(x, z, range = config.hearRange) {
    for (const bot of bots) {
      if (!bot.state.alive) continue;
      if (Math.hypot(x - bot.state.position.x, z - bot.state.position.z) > range) continue;
      bot.ai.lookX = x;
      bot.ai.lookZ = z;
      bot.ai.investigateLeft = config.investigateSeconds;
      if (bot.ai.mode === 'patrol') bot.ai.mode = 'alert';
    }
  }

  function aliveCount() {
    let count = 0;
    for (const bot of bots) if (bot.state.alive) count += 1;
    return count;
  }

  return {
    bots,
    bodies: bots.map((bot) => bot.state),
    step,
    reset,
    onDamaged,
    reportNoise,
    aliveCount,
    bodyOf,
    // The simulation sets the objective and asks each bot whether it is standing on it, which is
    // the one thing the AI needs to know about the bomb.
    orderDefend(x, z) {
      objective.x = x;
      objective.z = z;
      objective.active = true;
    },
    clearOrder() {
      objective.active = false;
    },
    nearestTo(x, z) {
      let best = null;
      let bestDistance = Infinity;
      for (const bot of bots) {
        if (!bot.state.alive) continue;
        const distance = Math.hypot(x - bot.state.position.x, z - bot.state.position.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = bot;
        }
      }
      return best ? { bot: best, distance: bestDistance } : null;
    },
  };
}
