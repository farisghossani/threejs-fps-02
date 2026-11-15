// The map: one table of boxes, cylinders and painted markings, built once. Everything solid in it
// is a collider for the player and the bots, a surface a bullet stops on and a sightline breaker,
// so the table alone decides how the compound plays — and because the markings, the two sites and
// the routes are in the same file, the way it looks and the way it reads are the same decision.
//
// The compound is a walled yard with three ways north from the attacker spawn (west lane, mid and
// east lane) into two bomb sites: A on the bunker at the north-centre, B in the northeast yard,
// split by a screen wall with one gap between them. Mid is cut in two by the central mass, so no
// single lane watches the whole map.
import * as THREE from 'three';
import { PALETTE, tint } from './palette.js';
import { createMaterials, tileBoxUVs, tilePlaneUVs } from './textures.js';

export const PLAYER_SPAWN = { x: 0, z: 13.2, yaw: 0, pitch: 0.02 };

// Where a bomb can be planted, and where the HUD points a player left holding it. The radius is
// the paint on the ground: you can stand on the marking, not outside it.
export const BOMB_SITES = [
  {
    id: 'A',
    name: 'SITE A — BUNKER',
    x: 0,
    z: -11,
    radius: 3.6,
    material: 'siteA',
    colour: 'accent',
    markers: [[-2.2, -13.3], [2.2, -13.3]],
  },
  {
    id: 'B',
    name: 'SITE B — EAST YARD',
    x: 13.6,
    z: -11.8,
    radius: 3,
    material: 'siteB',
    colour: 'signal',
    markers: [[14.6, -9.75], [18.2, -9.75]],
  },
];

// Every solid, as [width, height, depth] at [x, y, z] with y the centre. The compound is 40 by 32
// metres; the attacker spawn is the south end, the defenders' half is north of z = 0.
const SOLIDS = [
  // Ground and perimeter.
  { size: [40, 0.4, 32], at: [0, -0.2, 0], material: 'floor' },
  { size: [0.8, 5, 32.8], at: [-19.6, 2.5, 0], material: 'wall' },
  { size: [0.8, 5, 32.8], at: [19.6, 2.5, 0], material: 'wall' },
  { size: [40, 5, 0.8], at: [0, 2.5, -15.6], material: 'wall' },
  { size: [40, 5, 0.8], at: [0, 2.5, 15.6], material: 'wall' },

  // Mid: a mass tall enough to break the long sightline, a shoulder of cover at each end of it and
  // a column either side of the mouth.
  { size: [8.4, 3.6, 6.4], at: [0, 1.8, 0.5], material: 'stone' },
  { size: [4.4, 1.15, 2.2], at: [0, 0.575, -3.8], material: 'stone' },
  { size: [4.8, 0.95, 2.6], at: [0, 0.475, 5.0], material: 'panel' },
  { size: [1.1, 4.6, 1.1], at: [-6.4, 2.3, 0.6], material: 'wall' },
  { size: [1.1, 4.6, 1.1], at: [6.4, 2.3, 0.6], material: 'wall' },

  // West lane: a shipping container to fight round, the low wall that splits it from mid, two
  // crate stacks and the sandbag line that guards the approach to A.
  { size: [5.0, 2.6, 7.0], at: [-14.8, 1.3, -4.8], material: 'panel' },
  { size: [0.8, 1.4, 7.4], at: [-10.2, 0.7, -2.0], material: 'wall' },
  { size: [2.4, 1.3, 2.4], at: [-13.4, 0.65, 3.8], material: 'timber' },
  { size: [1.8, 1.1, 1.8], at: [-13.4, 1.85, 3.8], material: 'timber' },
  { size: [2.4, 1.3, 2.4], at: [-16.4, 0.65, 6.8], material: 'timber' },
  { size: [4.2, 1.0, 0.9], at: [-16.6, 0.5, -9.6], material: 'stone' },
  { size: [0.9, 1.15, 0.9], at: [-17.0, 0.575, -12.6], material: 'metal', shape: 'drum' },
  { size: [0.9, 1.15, 0.9], at: [-15.9, 0.575, -13.4], material: 'metal', shape: 'drum' },

  // East lane: the alley wall that separates it from mid, its own low cover, and the platform at
  // the south end with the steps up to it.
  { size: [0.8, 4.0, 10.0], at: [11.6, 2.0, -5.5], material: 'wall' },
  { size: [5.0, 1.3, 0.8], at: [15.6, 0.65, -1.2], material: 'stone' },
  { size: [6.0, 1.3, 5.0], at: [16.0, 0.65, 6.6], material: 'stone' },
  { size: [2.0, 0.5, 2.4], at: [12.0, 0.25, 7.6], material: 'trim' },
  { size: [2.2, 1.3, 2.2], at: [17.4, 1.95, 7.4], material: 'timber' },
  { size: [0.9, 1.15, 0.9], at: [18.4, 0.575, -5.4], material: 'metal', shape: 'drum' },

  // A site: the bunker's back wall, a crate on each shoulder, cover to plant behind, a column at
  // each flank, and the screen wall that splits A from B with one gap left open between them.
  { size: [13.0, 2.9, 1.0], at: [0, 1.45, -13.9], material: 'wall' },
  { size: [3.4, 1.5, 3.2], at: [-8.0, 0.75, -11.0], material: 'timber' },
  { size: [3.4, 1.5, 3.2], at: [8.0, 0.75, -11.0], material: 'timber' },
  { size: [3.2, 1.15, 1.4], at: [-3.0, 0.575, -10.2], material: 'stone' },
  { size: [3.2, 1.15, 1.4], at: [3.0, 0.575, -10.2], material: 'stone' },
  { size: [1.1, 4.6, 1.1], at: [-10.2, 2.3, -14.2], material: 'wall' },
  { size: [1.1, 4.6, 1.1], at: [10.2, 2.3, -14.2], material: 'wall' },
  { size: [1.0, 3.2, 4.0], at: [11.6, 1.6, -13.6], material: 'wall' },

  // B site: the yard in the northeast, its container and crate cover.
  { size: [4.6, 2.7, 4.8], at: [16.4, 1.35, -12.2], material: 'panel' },
  { size: [2.2, 1.4, 2.2], at: [13.2, 0.7, -7.6], material: 'timber' },
  { size: [2.6, 1.5, 2.6], at: [17.8, 0.75, -8.0], material: 'timber' },

  // The attacker half: the sandbag line to spawn behind, a flank wall each side and its own boxes.
  { size: [3.6, 1.0, 0.9], at: [-4.2, 0.5, 10.6], material: 'stone' },
  { size: [3.6, 1.0, 0.9], at: [4.2, 0.5, 10.6], material: 'stone' },
  { size: [0.8, 1.4, 6.0], at: [-12.4, 0.7, 9.8], material: 'wall' },
  { size: [0.8, 1.4, 6.0], at: [12.4, 0.7, 11.2], material: 'wall' },
  { size: [2.4, 1.3, 2.4], at: [-6.4, 0.65, 13.6], material: 'timber' },
  { size: [2.4, 1.3, 2.4], at: [6.4, 0.65, 13.6], material: 'timber' },
  { size: [0.9, 1.15, 0.9], at: [-7.6, 0.575, 12.2], material: 'metal', shape: 'drum' },
  { size: [0.9, 1.15, 0.9], at: [7.6, 0.575, 12.2], material: 'metal', shape: 'drum' },

  // Paint, not structure: the hazard band round the foot of every wall, the dark dado above it and
  // the striped edge on the things you can stand on. It is what tells a wall from a hole at a
  // glance, and none of it stops a bullet or a body.
  { size: [0.06, 0.34, 32], at: [-19.16, 0.17, 0], material: 'hazard', collider: false, unit: 0.7 },
  { size: [0.06, 0.34, 32], at: [19.16, 0.17, 0], material: 'hazard', collider: false, unit: 0.7 },
  { size: [40, 0.34, 0.06], at: [0, 0.17, -15.16], material: 'hazard', collider: false, unit: 0.7 },
  { size: [40, 0.34, 0.06], at: [0, 0.17, 15.16], material: 'hazard', collider: false, unit: 0.7 },
  { size: [0.06, 0.16, 32], at: [-19.15, 0.5, 0], material: 'panel', collider: false, unit: 1.6 },
  { size: [0.06, 0.16, 32], at: [19.15, 0.5, 0], material: 'panel', collider: false, unit: 1.6 },
  { size: [40, 0.16, 0.06], at: [0, 0.5, -15.15], material: 'panel', collider: false, unit: 1.6 },
  { size: [40, 0.16, 0.06], at: [0, 0.5, 15.15], material: 'panel', collider: false, unit: 1.6 },
  { size: [5.0, 0.2, 0.06], at: [-14.8, 0.3, -1.34], material: 'hazard', collider: false, unit: 0.7 },
  { size: [0.06, 0.2, 5.0], at: [14.4, 1.45, 6.6], material: 'hazard', collider: false, unit: 0.7 },
  { size: [0.06, 0.2, 4.6], at: [13.06, 1.45, 6.6], material: 'hazard', collider: false, unit: 0.7 },
  { size: [0.2, 0.7, 0.06], at: [0, 0.35, -3.0], material: 'hazard', collider: false, unit: 0.7 },
  { size: [0.2, 0.7, 0.06], at: [0, 0.35, 4.2], material: 'hazard', collider: false, unit: 0.7 },
  // A pipe run along each flank and a cable tray over mid: the small horizontals that make a wall
  // look like a place something is done in.
  { size: [0.12, 0.12, 26], at: [-19.0, 3.2, 2], material: 'metal', collider: false, shape: 'drum', unit: 1 },
  { size: [0.12, 0.12, 26], at: [19.0, 3.2, 2], material: 'metal', collider: false, shape: 'drum', unit: 1 },
  { size: [8.4, 0.14, 0.14], at: [0, 3.75, 0.5], material: 'metal', collider: false, unit: 1 },
  // Downpipes and a conduit run along the north and south walls: the verticals that stop a wall
  // being one unbroken plane from the spawn to the site.
  { size: [0.16, 4.6, 0.16], at: [-16.0, 2.3, -15.02], material: 'rust', collider: false, unit: 0.9 },
  { size: [0.16, 4.6, 0.16], at: [-6.6, 2.3, -15.02], material: 'rust', collider: false, unit: 0.9 },
  { size: [0.16, 4.6, 0.16], at: [6.6, 2.3, -15.02], material: 'rust', collider: false, unit: 0.9 },
  { size: [0.16, 4.6, 0.16], at: [16.0, 2.3, -15.02], material: 'rust', collider: false, unit: 0.9 },
  { size: [0.16, 4.6, 0.16], at: [-9.0, 2.3, 15.02], material: 'rust', collider: false, unit: 0.9 },
  { size: [0.16, 4.6, 0.16], at: [9.0, 2.3, 15.02], material: 'rust', collider: false, unit: 0.9 },
  { size: [14.0, 0.14, 0.14], at: [-11.0, 2.6, -15.05], material: 'metal', collider: false, unit: 1 },
  { size: [14.0, 0.14, 0.14], at: [11.0, 2.6, -15.05], material: 'metal', collider: false, unit: 1 },
  { size: [16.0, 0.14, 0.14], at: [0, 2.6, 15.05], material: 'metal', collider: false, unit: 1 },

  // The compound as a yard rather than a floor plan: chain-link run along the top of every wall
  // with a post between the panels, tyres stacked out of the way at the flanks, tarps over the
  // stacks, a ladder up the bunker's back wall and rust on the steel that has been there longest.
  // All of it is either out of reach above the wall line or tucked into the strips beside the
  // perimeter, so the geometry the simulation plays in is exactly the geometry it played in before.
  { size: [11.6, 2.2, 0.06], at: [-13.0, 5.9, -15.1], material: 'link', shape: 'fence', collider: false },
  { size: [11.6, 2.2, 0.06], at: [13.0, 5.9, -15.1], material: 'link', shape: 'fence', collider: false },
  { size: [11.6, 2.2, 0.06], at: [-13.0, 5.9, 15.1], material: 'link', shape: 'fence', collider: false },
  { size: [11.6, 2.2, 0.06], at: [13.0, 5.9, 15.1], material: 'link', shape: 'fence', collider: false },
  { size: [26.0, 2.2, 0.06], at: [-19.1, 5.9, 1.0], material: 'link', shape: 'fence', facing: 'x', collider: false },
  { size: [26.0, 2.2, 0.06], at: [19.1, 5.9, 1.0], material: 'link', shape: 'fence', facing: 'x', collider: false },
  { size: [0.18, 7.2, 0.18], at: [-19.0, 3.6, -14.6], material: 'metal', collider: false, unit: 0.9 },
  { size: [0.18, 7.2, 0.18], at: [19.0, 3.6, -14.6], material: 'metal', collider: false, unit: 0.9 },
  { size: [0.18, 7.2, 0.18], at: [-19.0, 3.6, 14.6], material: 'metal', collider: false, unit: 0.9 },
  { size: [0.18, 7.2, 0.18], at: [19.0, 3.6, 14.6], material: 'metal', collider: false, unit: 0.9 },
  { size: [0.18, 7.2, 0.18], at: [-19.0, 3.6, -5.0], material: 'metal', collider: false, unit: 0.9 },
  { size: [0.18, 7.2, 0.18], at: [19.0, 3.6, -5.0], material: 'metal', collider: false, unit: 0.9 },

  // Tyres and a tarp, on the strips beside the walls where no route goes.
  { size: [1.15, 1.5, 1.15], at: [-18.0, 0.75, -7.4], material: 'rubber', shape: 'drum', collider: false },
  { size: [1.15, 1.2, 1.15], at: [-17.1, 0.6, -8.6], material: 'rubber', shape: 'drum', collider: false },
  { size: [1.15, 1.5, 1.15], at: [18.0, 0.75, 1.8], material: 'rubber', shape: 'drum', collider: false },
  { size: [1.15, 1.2, 1.15], at: [17.1, 0.6, 2.9], material: 'rubber', shape: 'drum', collider: false },
  { size: [3.0, 1.7, 2.4], at: [-17.6, 0.85, 9.4], material: 'tarp', collider: false, unit: 1.1 },
  { size: [3.2, 1.85, 2.6], at: [17.4, 0.92, -1.4], material: 'tarp', collider: false, unit: 1.1 },
  { size: [2.2, 1.2, 1.8], at: [-17.4, 0.6, 12.6], material: 'rust', collider: false, unit: 1.1 },

  // A ladder up the bunker's back wall, in the corner a defender would climb from.
  { size: [0.1, 3.0, 0.1], at: [-5.6, 1.5, -13.3], material: 'rust', collider: false, unit: 0.9 },
  { size: [0.1, 3.0, 0.1], at: [-4.9, 1.5, -13.3], material: 'rust', collider: false, unit: 0.9 },
  ...[0.5, 1.0, 1.5, 2.0, 2.5].map((y) => ({
    size: [0.8, 0.08, 0.08],
    at: [-5.25, y, -13.3],
    material: 'rust',
    collider: false,
    unit: 0.9,
  })),

  // Sandbags along the top of the shoulder at the mouth of mid, and bollards on the lane lines.
  ...[0, 1, 2, 3, 4, 5].map((index) => ({
    size: [0.7, 0.34, 0.9],
    at: [-1.85 + index * 0.74, 1.32, -3.5],
    material: 'timber',
    collider: false,
    unit: 0.6,
  })),
  ...[0, 1, 2].map((index) => ({
    size: [0.22, 0.9, 0.22],
    at: [-10.4, 0.45, -6.2 + index * 2.4],
    material: 'rust',
    collider: false,
    unit: 0.8,
  })),

  // Gate posts at the mouth of each lane, one boom arm raised on its hinge: the checkpoint a
  // compound this size would have, and a sightline anchor in the two longest lines in the map.
  { size: [0.22, 2.2, 0.22], at: [-13.4, 1.1, 6.0], material: 'rust', collider: false, unit: 0.8 },
  { size: [0.22, 2.2, 0.22], at: [-9.0, 1.1, 6.0], material: 'rust', collider: false, unit: 0.8 },
  { size: [0.16, 2.6, 0.16], at: [-13.4, 3.3, 6.18], material: 'hazard', collider: false, unit: 0.6 },
  { size: [0.34, 0.34, 0.3], at: [-13.4, 1.9, 6.0], material: 'metal', collider: false, unit: 0.6 },
  { size: [0.22, 2.2, 0.22], at: [12.4, 1.1, -2.0], material: 'rust', collider: false, unit: 0.8 },
  { size: [0.22, 2.2, 0.22], at: [17.0, 1.1, -2.0], material: 'rust', collider: false, unit: 0.8 },
  { size: [0.16, 2.6, 0.16], at: [17.0, 3.3, -1.82], material: 'hazard', collider: false, unit: 0.6 },
  { size: [0.34, 0.34, 0.3], at: [17.0, 1.9, -2.0], material: 'metal', collider: false, unit: 0.6 },

  // The poured ground under each site: A warm, B cold, so the two halves of the map are told apart
  // by the floor before a single marking is read.
  { size: [9.6, 0.04, 8.6], at: [0, 0.02, -11], material: 'floorA', collider: false, unit: 2.4 },
  { size: [7.6, 0.04, 7.6], at: [13.6, 0.02, -11.8], material: 'floorB', collider: false, unit: 2.4 },
  { size: [3.8, 0.04, 21.0], at: [-11.2, 0.02, 1.5], material: 'floorB', collider: false, unit: 2.4 },
  { size: [3.8, 0.04, 19.6], at: [12.8, 0.02, 2.2], material: 'floorA', collider: false, unit: 2.4 },
];

// Painted on the ground and hung on the walls: the lane dashes, the site outlines and letters,
// the numbered posts the defenders hold, and the plate over each site. None of it collides; all
// of it is what makes the compound legible from the spawn.
const MARKINGS = [
  { kind: 'letter', site: 0, size: [6.2, 6.2] },
  { kind: 'letter', site: 1, size: [5.2, 5.2] },
  { kind: 'band', at: [0, 0.06, -11], size: [9.4, 8.4] },
  { kind: 'band', at: [13.6, 0.06, -11.8], size: [7.4, 7.4] },
  ...[
    [-11.2, -8],
    [-11.2, -4],
    [-11.2, 0],
    [-11.2, 4],
    [12.8, -6],
    [12.8, -2],
    [12.8, 2],
    [12.8, 6],
    [0, 8],
    [4, 8],
  ].map(([x, z]) => ({ kind: 'dash', at: [x, 0.06, z], size: [1.7, 1.7] })),
  ...[
    [-11.2, -4],
    [0, -6.6],
    [-8.0, -9.4],
    [15.0, -7.0],
  ].map(([x, z], index) => ({ kind: 'post', at: [x, 0.06, z], size: [1.5, 1.5], index: index + 1 })),
];

const SIGNS = [
  { text: 'SITE A — BOMBSITE', colour: 'accent', at: [0, 3.3, -13.32], yaw: 0, size: [6.0, 1.5] },
  { text: 'SITE B — BOMBSITE', colour: 'signal', at: [19.16, 3.3, -10.4], yaw: -Math.PI / 2, size: [5.4, 1.35] },
  { text: 'PLANT AT A OR B', colour: 'hazard', at: [0, 3.3, 15.16], yaw: Math.PI, size: [6.0, 1.5] },
  { text: 'WEST LANE', colour: 'hazard', at: [-19.16, 2.6, 4.0], yaw: Math.PI / 2, size: [4.2, 1.05] },
  { text: 'EAST LANE', colour: 'hazard', at: [19.16, 2.6, 4.0], yaw: -Math.PI / 2, size: [4.2, 1.05] },
  { text: 'MID', colour: 'hazard', at: [0, 3.35, 3.78], yaw: 0, size: [2.6, 0.75] },
  // Wayfinding at the mouth of mid: which lane takes you to which site, at the height a player
  // looks when he is deciding where to go.
  { text: '← A', colour: 'accent', at: [-3.1, 2.3, 3.8], yaw: 0, size: [1.7, 0.8] },
  { text: 'B →', colour: 'signal', at: [3.1, 2.3, 3.8], yaw: 0, size: [1.7, 0.8] },
  { text: 'NO ENTRY', colour: 'hostile', at: [-19.14, 2.4, -6.2], yaw: Math.PI / 2, size: [2.6, 0.65] },
  { text: 'KEEP CLEAR', colour: 'hazard', at: [19.14, 2.4, -6.2], yaw: -Math.PI / 2, size: [2.6, 0.65] },
  { text: 'HARD HATS', colour: 'hazard', at: [-19.14, 2.4, 11.0], yaw: Math.PI / 2, size: [2.6, 0.65] },
];

// Two of the columns carry a lamp: a plate that puts out light of its own, and the pool of light
// it throws on the concrete, so the middle of the compound is not a hole in the frame.
const LAMPS = [
  { at: [-6.4, 4.5, 0.6], colour: 'sun', intensity: 9, distance: 17 },
  { at: [6.4, 4.5, 0.6], colour: 'sun', intensity: 9, distance: 17 },
  // One over each site: a walled-in bomb site lit only by the overcast gets flat, and a flat corner
  // of the map is a corner nobody can read a body in.
  { at: [-3.0, 3.7, -12.6], colour: 'sun', intensity: 11, distance: 15 },
  { at: [12.2, 3.7, -12.4], colour: 'signal', intensity: 10, distance: 15 },
];

// A route is a loop of stops: the bot walks to each, looks around for `hold` seconds and moves on.
// Between them the four cover the two lanes, the middle and both sites, and every stop is in open
// ground so a bot never starts a round inside a crate.
const ROUTES = [
  [
    { x: -11.2, z: -4, hold: 1.4 },
    { x: -11.2, z: -8.8, hold: 0.9 },
    { x: -11.2, z: 0, hold: 0.9 },
    { x: -11.2, z: 4, hold: 0.8 },
  ],
  [
    { x: 0, z: -6.6, hold: 1.6 },
    { x: 3.4, z: -7.6, hold: 0.7 },
    { x: 3.0, z: -12.6, hold: 1.2 },
    { x: -3.0, z: -12.6, hold: 1.0 },
    { x: -3.4, z: -7.6, hold: 0.7 },
  ],
  [
    { x: -8.0, z: -9.4, hold: 1.8 },
    { x: -8.0, z: -6.4, hold: 0.9 },
    { x: -11.2, z: -8.8, hold: 0.9 },
  ],
  [
    { x: 15.0, z: -7.0, hold: 1.5 },
    { x: 13.6, z: -11.8, hold: 1.2 },
    { x: 12.8, z: -2.0, hold: 0.9 },
    { x: 12.8, z: -6.0, hold: 0.8 },
  ],
];

function buildSolid(solid, materials) {
  const [width, height, depth] = solid.size;
  const [x, y, z] = solid.at;
  const material = materials[solid.material];
  if (solid.shape === 'fence') {
    const geometry = tilePlaneUVs(new THREE.PlaneGeometry(width, height), width, height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (solid.facing === 'x') mesh.rotation.y = Math.PI / 2;
    return { mesh, size: [width, height, 0.08] };
  }
  if (solid.shape === 'drum') {
    const radius = Math.min(width, depth) / 2;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), material);
    mesh.position.set(x, y, z);
    return { mesh, size: [radius * 2, height, radius * 2] };
  }
  const geometry = tileBoxUVs(new THREE.BoxGeometry(width, height, depth), solid.size, solid.unit ?? 1.6);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return { mesh, size: solid.size };
}

// A marking is a plane lying flat on the ground, drawn in the palette and lit by nothing: paint,
// not a surface. The site letters sit on the sites themselves; every other marking carries its
// own spot.
function buildMarking(marking, sites, materials, group) {
  const paint = materials.paint;
  const [width, depth] = marking.size;
  let material;
  let at;
  if (marking.kind === 'letter') {
    material = marking.site === 0 ? paint.siteA : paint.siteB;
    at = [sites[marking.site].x, 0.08, sites[marking.site].z];
  } else if (marking.kind === 'post') {
    material = paint.post(marking.index);
    at = marking.at;
  } else {
    material = paint.band;
    at = marking.at;
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  plane.position.set(at[0], at[1], at[2]);
  plane.rotation.x = -Math.PI / 2;
  group.add(plane);
  return plane;
}

export function createArena(seed) {
  const { materials, sprites } = createMaterials(seed);
  const group = new THREE.Group();
  const colliders = [];

  for (const solid of SOLIDS) {
    const { mesh, size } = buildSolid(solid, materials);
    if (solid.collider !== false) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      colliders.push(
        new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(solid.at[0], solid.at[1], solid.at[2]), new THREE.Vector3(size[0], size[1], size[2])),
      );
    }
    group.add(mesh);
  }

  for (const marking of MARKINGS) buildMarking(marking, BOMB_SITES, materials, group);

  for (const sign of SIGNS) {
    const map = sprites.sign(sign.text, PALETTE[sign.colour]);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(sign.size[0], sign.size[1]),
      new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide }),
    );
    plate.position.set(sign.at[0], sign.at[1], sign.at[2]);
    plate.rotation.y = sign.yaw;
    group.add(plate);
  }

  // The objectives get a lit plate each, mounted either side of the site letter, in the colour the
  // rest of the game marks that site with.
  for (const site of BOMB_SITES) {
    for (const [x, z] of site.markers) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.14), materials[site.material]);
      plate.position.set(x, 2.6, z);
      group.add(plate);
    }
  }

  // An overcast dusk: enough sky in it that no wall is a black plane, but low enough that the key
  // still decides which faces are bright — flat ambient light is what makes a compound look like a
  // grey box, so most of the light here comes from one direction on purpose.
  const sky = new THREE.HemisphereLight(tint('haze'), tint('wall', 0.55), 0.62);

  // Key with the shadows, a cool fill from the north-west and a rim from the south: the three
  // directions that keep a wall from being a black plane and a body from being a silhouette.
  const key = new THREE.DirectionalLight(tint('sun'), 3.1);
  key.position.set(16, 22, 12);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 2.5;

  const fill = new THREE.DirectionalLight(tint('signal'), 0.62);
  fill.position.set(-16, 12, -12);
  fill.target.position.set(0, 0, -2);

  const rim = new THREE.DirectionalLight(tint('haze'), 0.78);
  rim.position.set(0, 9, 26);
  rim.target.position.set(0, 0, -6);

  const lights = [sky, key, key.target, fill, fill.target, rim, rim.target];

  for (const site of BOMB_SITES) {
    const glow = new THREE.PointLight(tint(site.colour), 13, 20, 2);
    glow.position.set(site.x, 3.4, site.z);
    lights.push(glow);
  }
  for (const lamp of LAMPS) {
    const light = new THREE.PointLight(tint(lamp.colour), lamp.intensity, lamp.distance, 2);
    light.position.set(lamp.at[0], lamp.at[1], lamp.at[2]);
    lights.push(light);
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), materials.lamp);
    fixture.position.set(lamp.at[0], lamp.at[1] - 0.2, lamp.at[2]);
    group.add(fixture);
  }

  return {
    group,
    colliders,
    routes: ROUTES,
    sites: BOMB_SITES,
    lights,
    materials,
    sprites,
  };
}
