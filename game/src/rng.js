// The game's only source of randomness: a seeded generator, created once per match and stepped
// by the simulation itself. Nothing in the game calls Math.random or reads the clock, so the
// same seed plays the same round, tick for tick, which is what makes a screenshot repeatable.
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    signed(magnitude) {
      return (next() * 2 - 1) * magnitude;
    },
    int(min, max) {
      return Math.min(max, min + Math.floor(next() * (max - min + 1)));
    },
    unitVector(out) {
      // A direction on the unit sphere with a slight bias to the horizontal, which keeps aim
      // error readable as left/right and up/down rather than as a constant radius.
      const yaw = next() * Math.PI * 2;
      const pitch = (next() * 2 - 1) * 0.5;
      return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    },
  };
}
