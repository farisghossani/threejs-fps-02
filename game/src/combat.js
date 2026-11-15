// Hit resolution: one hitscan pass shared by both sides. A shot is a ray from a muzzle against
// the arena's boxes and every live body's three hit zones, whichever is nearest wins, and the
// zone decides the damage the weapon's own table gives it. Head, body and legs are the same
// shape for bots and for the player, so a head shot is worth taking on either side.
import { raycastBox, raycastBoxes, updateZones } from './collision.js';

// The record a resolved shot reads. One shared object: a shot never allocates.
export const shotResult = {
  blocked: false,
  distance: 0,
  body: null,
  zone: null,
  box: null,
};

const MAX_RANGE = 120;

export function resolveShot(origin, direction, colliders, bodies, shooter, maxDistance = MAX_RANGE) {
  const world = raycastBoxes(colliders, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, maxDistance);
  let distance = world ? world.distance : maxDistance;
  let hitBody = null;
  let hitZone = null;
  let hitBox = world ? world.box : null;

  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    if (body === shooter || !body.alive) continue;
    updateZones(body.zones, body.position, body.height);
    const head = raycastBox(body.zones.head, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, distance);
    if (head < distance) {
      distance = head;
      hitBody = body;
      hitZone = 'head';
      hitBox = body.zones.head;
      continue;
    }
    const torso = raycastBox(body.zones.body, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, distance);
    if (torso < distance) {
      distance = torso;
      hitBody = body;
      hitZone = 'body';
      hitBox = body.zones.body;
      continue;
    }
    const legs = raycastBox(body.zones.legs, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, distance);
    if (legs < distance) {
      distance = legs;
      hitBody = body;
      hitZone = 'legs';
      hitBox = body.zones.legs;
    }
  }

  shotResult.blocked = hitBody === null && distance < maxDistance;
  shotResult.distance = distance;
  shotResult.body = hitBody;
  shotResult.zone = hitZone;
  shotResult.box = hitBox;
  return shotResult;
}

// Which way the surface a shot landed on faces: the axis of the box it crossed with the least
// room to spare. A mark laid on the wall therefore lies flat on the wall, and not in the air.
export function surfaceNormal(out, box, x, y, z) {
  const centreX = (box.min.x + box.max.x) / 2;
  const centreY = (box.min.y + box.max.y) / 2;
  const centreZ = (box.min.z + box.max.z) / 2;
  const halfX = Math.max(0.0001, (box.max.x - box.min.x) / 2);
  const halfY = Math.max(0.0001, (box.max.y - box.min.y) / 2);
  const halfZ = Math.max(0.0001, (box.max.z - box.min.z) / 2);
  const dx = (x - centreX) / halfX;
  const dy = (y - centreY) / halfY;
  const dz = (z - centreZ) / halfZ;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ax >= ay && ax >= az) return out.set(Math.sign(dx), 0, 0);
  if (ay >= az) return out.set(0, Math.sign(dy), 0);
  return out.set(0, 0, Math.sign(dz));
}

// Whether a point can be seen from an eye: the ray to it must reach the arena's boxes no sooner
// than the point itself. Used for bot sight, and for the player's own line of fire.
export function hasLineOfSight(colliders, fromX, fromY, fromZ, toX, toY, toZ) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.001) return true;
  const hit = raycastBoxes(colliders, fromX, fromY, fromZ, dx / distance, dy / distance, dz / distance, distance - 0.05);
  return hit === null;
}

// The unit vector a pair of aim angles points along. It writes into a caller's vector, so a shot
// costs no allocation.
export function aimDirection(out, yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
}
