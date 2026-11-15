// The map, built from one table of boxes: three lanes round a central mass, a bunker at the far
// end and a raised platform on the right. Every box is a collider for the player and for the
// bots, a surface a bullet stops on and a sightline breaker, so the table alone decides how the
// map plays. Bot routes are waypoints along those lanes, never through a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Materials, by the palette names they use. The look is cold concrete with a little metal, and
// the accent only ever marks something the player acts on.
const MATERIALS = {
  canvas: { color: 'canvas', roughness: 0.95, metalness: 0.02 },
  surface: { color: 'surface', roughness: 0.88, metalness: 0.06 },
  hairline: { color: 'hairline', roughness: 0.82, metalness: 0.08 },
  stone: { color: 'stone', roughness: 0.9, metalness: 0.03 },
  metal: { color: 'hairline', roughness: 0.38, metalness: 0.62 },
  accent: { color: 'accent', roughness: 0.55, metalness: 0.1, emissive: 0.45 },
};

// size [width, height, depth], at [x, y, z] is the box's centre. The south end (positive z) is
// the attacker spawn, the bunker at the north end is what the defenders hold.
const BLOCKS = [
  // Ground and the four walls.
  { size: [40, 0.4, 32], at: [0, -0.2, 0], material: 'stone' },
  { size: [0.8, 5, 32.8], at: [-19.6, 2.5, 0], material: 'surface' },
  { size: [0.8, 5, 32.8], at: [19.6, 2.5, 0], material: 'surface' },
  { size: [40, 5, 0.8], at: [0, 2.5, -15.6], material: 'surface' },
  { size: [40, 5, 0.8], at: [0, 2.5, 15.6], material: 'surface' },

  // The central mass: it cuts the long sightline from the attacker spawn in two, so both lanes
  // have to be watched, and its shoulders are chest-high cover to crouch behind.
  { size: [7.4, 3.4, 6.2], at: [0, 1.7, 0.4], material: 'stone' },
  { size: [4.2, 1.15, 2.2], at: [0, 0.575, -3.9], material: 'hairline' },
  { size: [4.6, 0.95, 2.4], at: [0, 0.475, 4], material: 'hairline' },
  { size: [0.9, 4.4, 0.9], at: [-5.6, 2.2, 0.6], material: 'surface' },
  { size: [0.9, 4.4, 0.9], at: [5.6, 2.2, 0.6], material: 'surface' },

  // West lane: a container, a low wall that splits it from mid, and crates to fight over.
  { size: [4.6, 2.5, 7], at: [-14.9, 1.25, -5.2], material: 'hairline' },
  { size: [0.8, 1.35, 7.2], at: [-9.6, 0.675, -2], material: 'hairline' },
  { size: [2.2, 1.25, 2.2], at: [-12.6, 0.625, 3.4], material: 'stone' },
  { size: [2.2, 1.25, 2.2], at: [-15.6, 0.625, 6.4], material: 'stone' },
  { size: [0.9, 1.1, 0.9], at: [-17.2, 0.55, -12.6], material: 'metal' },

  // East lane: a long alley wall, crates, and a platform reached by two steps.
  { size: [0.8, 3.8, 13], at: [12.7, 1.9, -3], material: 'surface' },
  { size: [5.4, 1.35, 4.6], at: [16.5, 0.675, 10.7], material: 'stone' },
  { size: [5.4, 0.45, 1.4], at: [16.5, 0.225, 6.3], material: 'hairline' },
  { size: [5.4, 0.9, 1.4], at: [16.5, 0.45, 7.7], material: 'hairline' },
  { size: [7, 1.25, 0.8], at: [8.8, 0.625, 6.4], material: 'hairline' },
  { size: [2, 1.2, 2], at: [15.2, 0.6, -0.6], material: 'stone' },
  { size: [0.9, 1.1, 0.9], at: [17.6, 0.55, -6.5], material: 'metal' },

  // The defenders' bunker and its flanks, marked with accent plates so the far end reads as
  // "the place to be" from the attacker spawn.
  { size: [9, 2.6, 3.6], at: [0, 1.3, -13.2], material: 'stone' },
  { size: [3.2, 1.4, 3], at: [-7, 0.7, -11.6], material: 'hairline' },
  { size: [3.2, 1.4, 3], at: [7, 0.7, -11.6], material: 'hairline' },
  { size: [0.6, 0.6, 0.12], at: [-1.3, 1.7, -11.34], material: 'accent' },
  { size: [0.6, 0.6, 0.12], at: [1.3, 1.7, -11.34], material: 'accent' },
  { size: [0.9, 4.4, 0.9], at: [-11, 2.2, -12.4], material: 'surface' },
  { size: [0.9, 4.4, 0.9], at: [11, 2.2, -12.4], material: 'surface' },

  // The attacker half: sandbag lines to spawn behind, a flank wall each side.
  { size: [3.4, 0.95, 0.9], at: [-3.6, 0.475, 9.6], material: 'hairline' },
  { size: [3.4, 0.95, 0.9], at: [3.6, 0.475, 9.6], material: 'hairline' },
  { size: [0.9, 1.1, 0.9], at: [-7.2, 0.55, 11.6], material: 'metal' },
  { size: [0.9, 1.1, 0.9], at: [7.2, 0.55, 11.6], material: 'metal' },
  { size: [0.8, 1.35, 6], at: [-11.6, 0.675, 9], material: 'hairline' },
  { size: [0.8, 1.35, 6], at: [11.6, 0.675, 12], material: 'hairline' },
];

// A route is a loop of stops: the bot walks to each, looks around for `hold` seconds and moves
// on. These four cover the two lanes, mid and the bunker, and none of them crosses a box.
const ROUTES = [
  [
    { x: -8.6, z: -8.6, hold: 1.2 },
    { x: -8.6, z: -3, hold: 0.8 },
    { x: -8.6, z: 2.5, hold: 1 },
    { x: -8.6, z: 7.5, hold: 0.8 },
    { x: -8.6, z: -6, hold: 0.6 },
  ],
  [
    { x: 8.7, z: -8.5, hold: 1 },
    { x: 8.7, z: -2, hold: 0.8 },
    { x: 8.7, z: 4, hold: 1 },
    { x: 10.5, z: -6, hold: 0.8 },
  ],
  [
    { x: 3.2, z: -7.8, hold: 1.2 },
    { x: -3.2, z: -7.4, hold: 0.8 },
    { x: -3.2, z: -5.9, hold: 1 },
    { x: 3.2, z: -5.9, hold: 0.8 },
  ],
  [
    { x: -1.6, z: -9.8, hold: 2 },
    { x: 2.4, z: -9.6, hold: 1.6 },
    { x: 4.2, z: -10.4, hold: 1.2 },
  ],
];

export const PLAYER_SPAWN = { x: 0, z: 13.2, yaw: 0 };

export function createArena() {
  const group = new THREE.Group();
  const materials = {};
  for (const name of Object.keys(MATERIALS)) {
    const spec = MATERIALS[name];
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[spec.color]),
      roughness: spec.roughness,
      metalness: spec.metalness,
      emissive: spec.emissive ? new THREE.Color(PALETTE[spec.color]).multiplyScalar(spec.emissive) : new THREE.Color(0, 0, 0),
    });
  }

  const colliders = [];
  const shootables = [];
  for (const block of BLOCKS) {
    const [width, height, depth] = block.size;
    const [x, y, z] = block.at;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[block.material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromCenterAndSize(mesh.position, new THREE.Vector3(width, height, depth)));
    shootables.push(mesh);
  }

  // One warm key with shadows over the whole compound, a cool fill from the south and a sky
  // gradient: enough to read a body against a wall at forty metres, and nothing more.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.25);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.1);
  key.position.set(11, 17, 9);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 22;
  key.shadow.camera.bottom = -22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0007;
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-10, 11, 14);
  const siteGlow = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 16, 2);
  siteGlow.position.set(0, 2.6, -11);

  return {
    group,
    colliders,
    shootables,
    routes: ROUTES,
    lights: [sky, key, key.target, fill, siteGlow],
  };
}
