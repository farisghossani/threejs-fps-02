// Small numeric helpers the simulation shares. Every one of them takes numbers and returns a
// number, so a fixed step never allocates just to move something.
export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

// Frame-rate independent easing, so the same motion settles in the same time whatever the step.
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

// The signed difference between two angles, always the short way round.
export function shortestAngle(from, to) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}
