// Every surface in the game, made once at load from the seeded generator and never touched again:
// the concrete, the painted steel panel, the hazard stripe, the stencils and signs that mark the
// two sites, and the soft sprites the muzzle flash, the lamps and a bullet strike are drawn with.
// Drawing into a canvas keeps the whole look in code — no image files ship — and because the
// generator is seeded, the same seed paints the same compound, byte for byte, which is what the
// screenshots rely on. The greys a texture carries are near white on purpose: a material's colour
// tints its map, so one concrete map is the floor, the walls and the cover at three values.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createRng } from './rng.js';

const MAP = 256;

function surface(size = MAP) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

// A tile that is not square (a sign, a nameplate), with its own two measurements.
function board(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

function texture(canvas, repeat) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 4;
  return map;
}

// Grain over the whole tile, then blotches of damp and dust, then a few cracks. Cheap, but it is
// what stops a flat grey box from reading as a flat grey box.
function concrete(rng, tone) {
  const { canvas, ctx } = surface();
  ctx.fillStyle = `rgb(${tone}, ${tone}, ${tone})`;
  ctx.fillRect(0, 0, MAP, MAP);

  for (let index = 0; index < 150; index += 1) {
    const x = rng.range(0, MAP);
    const y = rng.range(0, MAP);
    const radius = rng.range(8, 58);
    const dark = rng.next() < 0.55;
    const value = dark ? 0 : 255;
    const fade = ctx.createRadialGradient(x, y, 0, x, y, radius);
    fade.addColorStop(0, `rgba(${value}, ${value}, ${value}, ${rng.range(0.02, 0.07).toFixed(3)})`);
    fade.addColorStop(1, `rgba(${value}, ${value}, ${value}, 0)`);
    ctx.fillStyle = fade;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 1;
  for (let index = 0; index < 26; index += 1) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${rng.range(0.03, 0.09).toFixed(3)})`;
    ctx.beginPath();
    let x = rng.range(0, MAP);
    let y = rng.range(0, MAP);
    ctx.moveTo(x, y);
    for (let step = 0; step < 3; step += 1) {
      x += rng.signed(22);
      y += rng.range(4, 24);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Pour joints: the hard edges are what make a surface read as concrete from across the compound.
  // Soft blotches disappear once a wall is more than a few metres away, and so does anything finer
  // than a centimetre — so the joints are a hand's width of dark, the stains are as wide as a
  // forearm and the repairs are a whole panel's worth of different value.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(0, 0, MAP, 9);
  ctx.fillRect(0, 0, 9, MAP);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(0, 9, MAP, 3);
  ctx.fillRect(9, 0, 3, MAP);

  for (const [holeX, holeY] of [
    [MAP * 0.22, MAP * 0.2],
    [MAP * 0.74, MAP * 0.2],
    [MAP * 0.22, MAP * 0.68],
    [MAP * 0.74, MAP * 0.68],
  ]) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.arc(holeX, holeY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(holeX - 2, holeY - 2, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let index = 0; index < 7; index += 1) {
    const x = rng.range(0, MAP);
    const pull = rng.range(0.4, 1);
    const stain = ctx.createLinearGradient(x, 0, x, MAP * pull);
    stain.addColorStop(0, `rgba(0, 0, 0, ${rng.range(0.2, 0.34).toFixed(3)})`);
    stain.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = stain;
    ctx.fillRect(x, 0, rng.range(16, 54), MAP * pull);
  }

  // Patched repairs: a panel of the wall poured in a different week.
  for (let index = 0; index < 3; index += 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${rng.range(0.09, 0.16).toFixed(3)})`;
    ctx.fillRect(rng.range(0, MAP * 0.55), rng.range(0, MAP * 0.55), rng.range(70, 130), rng.range(50, 110));
  }

  // Aggregate in the mix: chips big enough to still be there once the tile has been minified.
  for (let index = 0; index < 220; index += 1) {
    const light = rng.next() < 0.45;
    ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(rng.range(0, MAP), rng.range(0, MAP), rng.range(2, 5.5), rng.range(2, 5.5));
  }

  const image = ctx.getImageData(0, 0, MAP, MAP);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const grain = rng.signed(13);
    data[index] += grain;
    data[index + 1] += grain;
    data[index + 2] += grain;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Painted steel: plate seams, a rivet line down each, and rust running from the seams.
function panel(rng) {
  const { canvas, ctx } = surface();
  ctx.fillStyle = 'rgb(214, 214, 214)';
  ctx.fillRect(0, 0, MAP, MAP);

  for (let index = 0; index < 70; index += 1) {
    const x = rng.range(0, MAP);
    const y = rng.range(0, MAP);
    const radius = rng.range(6, 30);
    ctx.fillStyle = `rgba(0, 0, 0, ${rng.range(0.01, 0.04).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let row = 0; row < 4; row += 1) {
    const y = row * (MAP / 4) + 0.5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(0, y, MAP, 7);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.fillRect(0, y + 7, MAP, 3);
  }
  for (let column = 0; column < 2; column += 1) {
    const x = column * (MAP / 2) + 0.5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
    ctx.fillRect(x, 0, 5, MAP);
  }

  for (let row = 0; row < 4; row += 1) {
    for (let rivet = 0; rivet < 16; rivet += 1) {
      const x = 8 + rivet * 16;
      const y = row * (MAP / 4) + 9;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(x - 0.6, y - 0.6, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let index = 0; index < 16; index += 1) {
    const x = rng.range(0, MAP);
    const y = rng.range(0, MAP);
    const height = rng.range(18, 70);
    const streak = ctx.createLinearGradient(x, y, x, y + height);
    streak.addColorStop(0, 'rgba(58, 38, 22, 0.24)');
    streak.addColorStop(1, 'rgba(58, 38, 22, 0)');
    ctx.fillStyle = streak;
    ctx.fillRect(x, y, rng.range(1.5, 4), height);
  }

  const image = ctx.getImageData(0, 0, MAP, MAP);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const grain = rng.signed(9);
    data[index] += grain;
    data[index + 1] += grain;
    data[index + 2] += grain;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Hazard tape, painted as light and dark bands so a material's colour turns them yellow and
// black. Nothing in the map is bright enough on its own to pull the eye off a body.
function hazard() {
  const { canvas, ctx } = surface(128);
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(24, 24, 24, 0.92)';
  ctx.lineWidth = 18;
  for (let offset = -128; offset < 256; offset += 36) {
    ctx.beginPath();
    ctx.moveTo(offset, 128);
    ctx.lineTo(offset + 128, 0);
    ctx.stroke();
  }
  return canvas;
}

// A painted marking on the floor: the lane arrows, the site outlines, the big stencils. Drawn on
// a transparent tile and laid on the ground as a lit nothing — it is paint, not a light.
function stencil(text, colour, { letter = false } = {}) {
  const { canvas, ctx } = surface(256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 232, 232);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (letter) {
    ctx.font = 'bold 190px sans-serif';
    ctx.fillText(text, 128, 138);
  } else {
    ctx.font = 'bold 62px sans-serif';
    ctx.fillText(text, 128, 128);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

// The plate that hangs over a site and the tag that floats over a defender: a dark panel, one
// coloured rule, and the words that say what the thing in front of you is.
function plate(text, colour, width = 512, height = 128, size = 66) {
  const { canvas, ctx } = board(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(14, 18, 23, 0.86)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, 8);
  ctx.fillStyle = colour;
  ctx.fillRect(0, height - 8, width, 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.fillStyle = PALETTE.ink;
  // A board is only a sign if the whole line is on it: measure the words and take the type down
  // until they fit inside the painted margins, so a long name loses no letter to the edge.
  const room = width - 32;
  const measured = ctx.measureText(text).width;
  if (measured > room) ctx.font = `bold ${Math.max(10, Math.floor((size * room) / measured))}px sans-serif`;
  ctx.fillText(text, width / 2, height / 2 + 2);
  return canvas;
}

// A soft white disc, the one brush every glow in the game is painted with: muzzle flash, lamp
// flare, the flash of a frag going off, a spark off a wall.
function glow() {
  const { canvas, ctx } = surface(128);
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.28, 'rgba(255, 246, 224, 0.72)');
  gradient.addColorStop(0.62, 'rgba(255, 190, 110, 0.22)');
  gradient.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

// A bullet strike: a dark star with a bright core, so it reads as a hole with dust coming off it
// on a surface of any value.
function scorch(rng) {
  const { canvas, ctx } = surface(64);
  ctx.clearRect(0, 0, 64, 64);
  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2;
    const reach = rng.range(12, 30);
    const gradient = ctx.createLinearGradient(32, 32, 32 + Math.cos(angle) * reach, 32 + Math.sin(angle) * reach);
    gradient.addColorStop(0, 'rgba(16, 16, 18, 0.9)');
    gradient.addColorStop(1, 'rgba(16, 16, 18, 0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = rng.range(2, 6);
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(angle) * reach, 32 + Math.sin(angle) * reach);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(10, 10, 12, 0.85)';
  ctx.beginPath();
  ctx.arc(32, 32, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 236, 200, 0.5)';
  ctx.beginPath();
  ctx.arc(32, 32, 2.6, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

// Materials, by the palette name they wear. Roughness and metalness are what separates a wall
// from a container at the same value, so the greys stay three and the surfaces do not.
function standard(map, colour, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    map: texture(map, 1),
    color: new THREE.Color(PALETTE[colour]),
    roughness,
    metalness,
  });
}

// A box face maps the whole tile whatever its size, so a forty metre wall and a crate would wear
// the same four pixels of concrete. This scales each face's coordinates by its own measurements,
// which puts every surface in the compound on one real-world scale: a tile is about a metre and a
// half, so the grain, the seams and the rust read at the size the eye expects.
export function tileBoxUVs(geometry, size, unit = 1.6) {
  const [width, height, depth] = size;
  const uv = geometry.attributes.uv;
  const spans = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  for (let face = 0; face < spans.length; face += 1) {
    const u = spans[face][0] / unit;
    const v = spans[face][1] / unit;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = face * 4 + vertex;
      uv.setXY(index, uv.getX(index) * u, uv.getY(index) * v);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

// The same trick for a flat panel: a fence is a plane, so the tile simply repeats once every `unit`
// metres across and up it.
export function tilePlaneUVs(geometry, width, height, unit = 1.2) {
  const uv = geometry.attributes.uv;
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    uv.setXY(vertex, uv.getX(vertex) * (width / unit), uv.getY(vertex) * (height / unit));
  }
  uv.needsUpdate = true;
  return geometry;
}

// One tile of chain-link: a diamond mesh on nothing at all, drawn diagonally so the pattern can be
// repeated across a panel at about a hand's width a link.
function chainLink() {
  const { canvas, ctx } = surface(128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = '#cfd8e0';
  ctx.lineWidth = 2.2;
  const step = 16;
  for (let offset = -128; offset <= 256; offset += step) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offset, 128);
    ctx.lineTo(offset + 128, 0);
    ctx.stroke();
  }
  return canvas;
}

export function createMaterials(seed) {
  const rng = createRng(seed ^ 0x9e3779b9);
  const concreteMap = concrete(rng, 226);
  const wornConcreteMap = concrete(rng, 208);
  const panelMap = panel(rng);

  const materials = {
    floor: standard(wornConcreteMap, 'floor', 0.94, 0.02),
    floorA: standard(wornConcreteMap, 'floorA', 0.95, 0.02),
    floorB: standard(wornConcreteMap, 'floorB', 0.95, 0.02),
    wall: standard(concreteMap, 'wall', 0.9, 0.04),
    stone: standard(concreteMap, 'stone', 0.92, 0.03),
    panel: standard(panelMap, 'panel', 0.52, 0.42),
    metal: standard(panelMap, 'trim', 0.34, 0.72),
    timber: standard(panelMap, 'timber', 0.86, 0.02),
    hazard: standard(hazard(), 'hazard', 0.7, 0.1),
    rubber: standard(panelMap, 'rubber', 0.96, 0.02),
    tarp: standard(panelMap, 'tarp', 0.88, 0.02),
    rust: standard(concreteMap, 'rust', 0.85, 0.25),
    lamp: new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.ink),
      emissive: new THREE.Color(PALETTE.hazard),
      emissiveIntensity: 1.1,
      roughness: 0.5,
    }),
  };

  // Chain-link: a fence panel with nothing behind it, so the whole compound reads as fenced rather
  // than walled. Alpha-tested instead of blended so it still writes depth and never sorts wrong.
  materials.link = new THREE.MeshStandardMaterial({
    map: texture(chainLink(), 1),
    color: new THREE.Color(PALETTE.trim),
    transparent: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.6,
  });

  // Signs and the objectives: the only surfaces in the compound that put out light of their own,
  // so "the thing you act on" is the thing that glows.
  materials.siteA = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.75,
    roughness: 0.45,
  });
  materials.siteB = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.signal),
    emissive: new THREE.Color(PALETTE.signal),
    emissiveIntensity: 0.75,
    roughness: 0.45,
  });
  materials.board = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.trim),
    roughness: 0.7,
    metalness: 0.2,
  });

  // Painted markings lie flat on a surface: unlit, unaffected by the shading that made the
  // surface, and nudged forward so they never fight with it. A stencil is a site letter, a post
  // number or a lane band, and every one of them is a tile of the same kind.
  const paint = (text, colour, options) => {
    const map = texture(stencil(text, colour, options), 1);
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  };

  materials.paint = {
    siteA: paint('A', PALETTE.accent, { letter: true }),
    siteB: paint('B', PALETTE.signal, { letter: true }),
    band: paint('', PALETTE.hazard),
    post: (index) => paint(String(index), PALETTE.ink),
  };

  const glowMap = texture(glow(), 1);
  glowMap.wrapS = THREE.ClampToEdgeWrapping;
  glowMap.wrapT = THREE.ClampToEdgeWrapping;

  const sprites = {
    glow: glowMap,
    scorch: texture(scorch(rng), 1),
    tag: (name, colour) => texture(plate(name, colour, 320, 80, 44), 1),
    sign: (text, colour) => texture(plate(text, colour, 640, 160, 84), 1),
  };
  sprites.scorch.wrapS = THREE.ClampToEdgeWrapping;
  sprites.scorch.wrapT = THREE.ClampToEdgeWrapping;

  return { materials, sprites };
}
