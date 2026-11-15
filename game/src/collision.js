// Axis-aligned collision and ray casts for the whole game: the arena's boxes, the player and
// every bot share these functions. Rays are slab tests against a box list, so a shot, a line of
// sight and a tracer endpoint all cost a few multiplications and allocate nothing.
import * as THREE from 'three';

const EPSILON = 1e-9;
const probe = new THREE.Box3();
const result = { distance: 0, box: null };

export function boxAt(x, y, z, radius, height, out = probe) {
  out.min.set(x - radius, y, z - radius);
  out.max.set(x + radius, y + height, z + radius);
  return out;
}

export function overlapsAny(boxes, box) {
  for (let index = 0; index < boxes.length; index += 1) {
    if (box.intersectsBox(boxes[index])) return boxes[index];
  }
  return null;
}

// Every body is the same three boxes to a bullet: legs at the bottom, body in the middle, head
// on top. Head shots kill, legs are cheap, and a crouching body simply moves the whole set down.
export function createZones(radius) {
  return { radius, head: new THREE.Box3(), body: new THREE.Box3(), legs: new THREE.Box3() };
}

export function updateZones(zones, position, height) {
  const headBase = position.y + Math.max(0.1, height - 0.26);
  const legTop = position.y + Math.min(0.44, height * 0.3);
  zones.head.min.set(position.x - zones.radius, headBase, position.z - zones.radius);
  zones.head.max.set(position.x + zones.radius, position.y + height, position.z + zones.radius);
  zones.body.min.set(position.x - zones.radius, legTop, position.z - zones.radius);
  zones.body.max.set(position.x + zones.radius, headBase, position.z + zones.radius);
  zones.legs.min.set(position.x - zones.radius, position.y, position.z - zones.radius);
  zones.legs.max.set(position.x + zones.radius, legTop, position.z + zones.radius);
}

function inverse(component) {
  if (Math.abs(component) > EPSILON) return 1 / component;
  return component < 0 ? -1 / EPSILON : 1 / EPSILON;
}

function slab(box, ox, oy, oz, ix, iy, iz, limit) {
  let tmin = (box.min.x - ox) * ix;
  let tmax = (box.max.x - ox) * ix;
  if (tmin > tmax) {
    const swap = tmin;
    tmin = tmax;
    tmax = swap;
  }
  let ty1 = (box.min.y - oy) * iy;
  let ty2 = (box.max.y - oy) * iy;
  if (ty1 > ty2) {
    const swap = ty1;
    ty1 = ty2;
    ty2 = swap;
  }
  if (ty1 > tmin) tmin = ty1;
  if (ty2 < tmax) tmax = ty2;
  let tz1 = (box.min.z - oz) * iz;
  let tz2 = (box.max.z - oz) * iz;
  if (tz1 > tz2) {
    const swap = tz1;
    tz1 = tz2;
    tz2 = swap;
  }
  if (tz1 > tmin) tmin = tz1;
  if (tz2 < tmax) tmax = tz2;
  if (tmax < 0 || tmin > tmax || tmin >= limit) return Infinity;
  return tmin < 0 ? 0 : tmin;
}

// One box: the form a shot uses, or a body facing a wall, where the caller already knows the
// box and only wants the distance. Returns Infinity when the ray misses or lands past `limit`.
export function raycastBox(box, ox, oy, oz, dx, dy, dz, limit) {
  return slab(box, ox, oy, oz, inverse(dx), inverse(dy), inverse(dz), limit);
}

export function raycastBoxes(boxes, ox, oy, oz, dx, dy, dz, maxDistance) {
  const ix = inverse(dx);
  const iy = inverse(dy);
  const iz = inverse(dz);
  let best = maxDistance;
  let bestBox = null;
  for (let index = 0; index < boxes.length; index += 1) {
    const distance = slab(boxes[index], ox, oy, oz, ix, iy, iz, best);
    if (distance < best) {
      best = distance;
      bestBox = boxes[index];
    }
  }
  if (!bestBox) return null;
  result.distance = best;
  result.box = bestBox;
  return result;
}

// The horizontal test ignores the feet and the crown, so standing on the floor never reads as
// walking into a wall.
function blocked(boxes, x, y, z, radius, height, lift) {
  return overlapsAny(boxes, boxAt(x, y + lift, z, radius, Math.max(0.05, height - lift * 2)));
}

// A ledge no taller than stepUp is walked over instead of blocking: the body is lifted to the
// first clear height and the next gravity step settles it onto the surface.
function stepUp(boxes, body, x, z, radius, height, limit) {
  for (let rise = 0.18; rise <= limit + 1e-6; rise += 0.18) {
    if (!blocked(boxes, x, body.position.y + rise, z, radius, height, 0.06)) {
      body.position.y += rise;
      return true;
    }
  }
  return false;
}

// Moves a body by its velocity, one axis at a time so a wall never swallows it, then resolves
// the vertical move against the box it landed on. Gravity is the caller's business.
export function moveBody(boxes, body, dt, radius, height, stepHeight) {
  const position = body.position;
  const velocity = body.velocity;
  const lift = 0.06;
  const limit = stepHeight ?? 0.45;

  const nextX = position.x + velocity.x * dt;
  if (!blocked(boxes, nextX, position.y, position.z, radius, height, lift)) {
    position.x = nextX;
  } else if (body.onGround && limit > 0 && stepUp(boxes, body, nextX, position.z, radius, height, limit)) {
    position.x = nextX;
  } else {
    velocity.x = 0;
  }

  const nextZ = position.z + velocity.z * dt;
  if (!blocked(boxes, position.x, position.y, nextZ, radius, height, lift)) {
    position.z = nextZ;
  } else if (body.onGround && limit > 0 && stepUp(boxes, body, position.x, nextZ, radius, height, limit)) {
    position.z = nextZ;
  } else {
    velocity.z = 0;
  }

  position.y += velocity.y * dt;
  body.onGround = false;
  const hit = overlapsAny(boxes, boxAt(position.x, position.y, position.z, radius, height));
  if (hit) {
    if (velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      body.onGround = true;
    } else {
      position.y = hit.min.y - height;
      velocity.y = 0;
    }
  } else if (position.y <= 0) {
    position.y = 0;
    velocity.y = 0;
    body.onGround = true;
  }
  return body;
}
