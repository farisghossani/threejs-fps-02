// The defenders: four bots that walk the lanes, hold a corner and fight what they can see. They
// use the same three-zone body and the same hitscan the player does, so the exchange is symmetric
// — the only thing the game gives them is a reaction time, and the only thing it takes away is
// accuracy that falls as the target moves faster. Every decision is a function of the simulation
// clock and the seeded generator, so a round replays tick for tick.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE } from './palette.js';
import { createZones, moveBody } from './collision.js';
import { aimDirection, hasLineOfSight, muzzlePoint, resolveShot } from './combat.js';
import { clamp, lerp, shortestAngle } from './util.js';

const config = CONFIG.bot;
const GRAVITY = CONFIG.player.gravity;
const STEP_HEIGHT = CONFIG.player.stepUp;

const scratchEye = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchMuzzle = new THREE.Vector3();

function createMaterials() {
  return {
    uniform: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.75, metalness: 0.05 }),
    trim: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hostile), roughness: 0.6, metalness: 0.1 }),
    helmet: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.stone), roughness: 0.55, metalness: 0.2 }),
    gun: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.45, metalness: 0.4 }),
    flash: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  };
}

// One figure, always the same shape: the hostile trim is what the player picks out of the grey,
// and the helmet sits where the head hit zone is.
function buildFigure(materials) {
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), materials.uniform);
  legs.position.set(0, 0.31, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), materials.uniform);
  torso.position.set(0, 0.95, 0);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.34), materials.trim);
  vest.position.set(0, 0.98, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), materials.helmet);
  head.position.set(0, 1.44, 0);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34), materials.trim);
  band.position.set(0, 1.53, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.52), materials.gun);
  gun.position.set(0.17, 1, -0.32);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), materials.flash);
  flash.position.set(0.17, 1.02, -0.62);
  flash.visible = false;
  group.add(legs, torso, vest, head, band, gun, flash);
  group.traverse((part) => {
    if (part.isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  return { group, legs, torso, gun, flash };
}

function yawTowards(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export function createBots({ arena, rng, effects, colliders, parent }) {
  const bots = [];

  for (let index = 0; index < arena.routes.length; index += 1) {
    const route = arena.routes[index];
    const materials = createMaterials();
    const figure = buildFigure(materials);
    parent.add(figure.group);
    const start = route[0];
    const bot = {
      index,
      name: `DEFENDER ${index + 1}`,
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
    scratchDir.set(0, 0, 0);
    aimDirection(scratchDir, state.aimYaw, state.aimPitch);
    const hit = resolveShot(scratchEye, scratchDir, ctx.colliders, ctx.bodies, state, 90);
    const endX = scratchEye.x + scratchDir.x * hit.distance;
    const endY = scratchEye.y + scratchDir.y * hit.distance;
    const endZ = scratchEye.z + scratchDir.z * hit.distance;
    muzzlePoint(scratchMuzzle, scratchEye.x, scratchEye.y, scratchEye.z, state.aimYaw, state.aimPitch, 0.16, 0.08);
    effects.tracer(scratchMuzzle.x, scratchMuzzle.y, scratchMuzzle.z, endX, endY, endZ);
    if (hit.body === ctx.playerBody) {
      // Aim error is what makes a bot miss: the ray goes where the bot was pointing, and only a
      // ray that crosses the player's body does damage.
      ctx.damagePlayer(config.damage[hit.zone], state.position.x, state.position.z);
    } else if (hit.distance < 90) {
      effects.impact(endX, endY, endZ);
    }
  }

  function patrol(bot, dt, ctx) {
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

  function alert(bot, dt, ctx) {
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

  function stepBot(bot, dt, ctx) {
    const state = bot.state;
    const ai = bot.ai;
    const figure = bot.figure;

    if (!state.alive) {
      ai.death = Math.min(1, ai.death + dt / config.deathFallSeconds);
      figure.group.position.set(state.position.x, state.position.y - ai.death * 0.12, state.position.z);
      figure.group.rotation.x = -ai.death * 1.5;
      figure.flash.visible = false;
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

    if (ctx.playerBody.alive && distance > 0 && ai.seen >= config.reactionSeconds) ai.mode = 'engage';
    else if (ai.mode === 'engage' && (ai.lost === 0 || !ctx.playerBody.alive)) ai.mode = 'alert';
    else if (ai.mode === 'alert' && ai.lost === 0 && ai.investigateLeft === 0) ai.mode = 'patrol';

    if (ai.mode === 'engage') {
      const target = ctx.playerBody.position;
      engage(bot, dt, ctx, distance, yawTowards(state.position.x, state.position.z, target.x, target.z));
    } else if (ai.mode === 'alert') {
      alert(bot, dt, ctx);
      fireControl(bot, dt, ctx, false);
    } else {
      patrol(bot, dt, ctx);
      fireControl(bot, dt, ctx, false);
    }

    state.velocity.y = Math.max(-30, state.velocity.y - GRAVITY * dt);
    moveBody(ctx.colliders, state, dt, config.radius, config.height, STEP_HEIGHT);

    // Walk, stand, flash: everything the eye uses to read a bot's state at a glance.
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    ai.step += dt * (2 + speed * 2.6);
    ai.flash = Math.max(0, ai.flash - dt);
    state.hitFlash = Math.max(0, state.hitFlash - dt);
    figure.group.position.set(state.position.x, state.position.y, state.position.z);
    figure.group.rotation.y = state.yaw;
    figure.legs.rotation.x = Math.sin(ai.step) * Math.min(0.45, speed * 0.2);
    figure.gun.rotation.x = -state.aimPitch;
    figure.flash.visible = ai.flash > 0;
    figure.flash.rotation.z = ai.flash * 20;
    bot.materials.uniform.emissive.setScalar(state.hitFlash * 2.4);
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
  }

  function reset(roundIndex) {
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
      ai.lookX = start.x;
      ai.lookZ = start.z;
      ai.investigateLeft = 0;
      ai.death = 0;
      ai.flash = 0;
      bot.figure.group.rotation.x = 0;
      bot.figure.group.position.set(start.x, 0, start.z);
      bot.figure.flash.visible = false;
      bot.materials.uniform.emissive.setScalar(0);
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
      }
      return true;
    }
    return false;
  }

  // A shot is heard, not seen: a bot inside earshot turns for the noise even through a wall. This
  // is the whole of the "reacts to what it hears" behaviour, and it is called for player shots.
  function reportShot(x, z) {
    for (const bot of bots) {
      if (!bot.state.alive) continue;
      const distance = Math.hypot(x - bot.state.position.x, z - bot.state.position.z);
      if (distance > config.hearRange) continue;
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
    reportShot,
    aliveCount,
    bodyOf,
  };
}
