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
};

const MAX_RANGE = 120;

export function resolveShot(origin, direction, colliders, bodies, shooter, maxDistance = MAX_RANGE) {
  const world = raycastBoxes(colliders, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, maxDistance);
  let distance = world ? world.distance : maxDistance;
  let hitBody = null;
  let hitZone = null;

  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    if (body === shooter || !body.alive) continue;
    updateZones(body.zones, body.position, body.height);
    const head = raycastBox(body.zones.head, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, distance);
    if (head < distance) {
      distance = head;
      hitBody = body;
      hitZone = 'head';
      continue;
    }
    const torso = raycastBox(body.zones.body, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, distance);
    if (torso < distance) {
      distance = torso;
      hitBody = body;
      hitZone = 'body';
      continue;
    }
    const legs = raycastBox(body.zones.legs, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, distance);
    if (legs < distance) {
      distance = legs;
      hitBody = body;
      hitZone = 'legs';
    }
  }

  shotResult.blocked = hitBody === null && distance < maxDistance;
  shotResult.distance = distance;
  shotResult.body = hitBody;
  shotResult.zone = hitZone;
  return shotResult;
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

// The unit vector a pair of aim angles points along, and the muzzle a shot leaves from: a little
// forward, a little down and to the side of the eye, where the weapon model sits. Both write into
// a caller's vector, so a shot costs no allocation.
export function aimDirection(out, yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
}

export function muzzlePoint(out, eyeX, eyeY, eyeZ, yaw, pitch, side, drop) {
  const cosPitch = Math.cos(pitch);
  const forwardX = -Math.sin(yaw) * cosPitch;
  const forwardY = Math.sin(pitch);
  const forwardZ = -Math.cos(yaw) * cosPitch;
  return out.set(
    eyeX + forwardX * 0.5 + Math.cos(yaw) * side,
    eyeY + forwardY * 0.5 - drop,
    eyeZ + forwardZ * 0.5 - Math.sin(yaw) * side,
  );
}
