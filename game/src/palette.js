// The look plan, in one place: a warm industrial compound at dusk, read as a few values of
// concrete plus painted metal, with the markers the player acts on in one orange and the other
// team in one red. The same names are the CSS custom properties in index.html, so the DOM HUD and
// the 3D scene cannot drift apart, and nothing anywhere in the game names a colour of its own.
import { Color } from 'three';

export const PALETTE = {
  // The air: a dusk sky the compound stands in, the fog that distance fades into, and the page
  // behind the canvas.
  canvas: '#141a20',
  sky: '#2f3a45',
  haze: '#55636f',

  // The compound: floor, walls, cover and the painted steel on top of them. Values far enough
  // apart that a body always has a lighter or a darker surface to be read against.
  floor: '#7b838c',
  wall: '#5a636d',
  stone: '#8d949c',
  panel: '#454e59',
  trim: '#333c46',
  timber: '#7d6a4c',

  // The zones: the ground under each site is poured in its own mix, warm at A and cold at B, so
  // the two halves of the map are told apart by the floor before a marking is read.
  floorA: '#8a7b6a',
  floorB: '#6c7885',

  // Odds and ends a yard is made of: oil-black rubber, a faded olive tarp, rust.
  rubber: '#2b2e31',
  tarp: '#4c5342',
  rust: '#6b4a35',

  // The other team. Their fatigues are deliberately the lightest thing in the compound and their
  // vest the reddest, so a defender is the one value in the frame that neither the concrete nor
  // the steel can be — a body you can pick out before you can read its tag.
  fatigues: '#9aa189',

  // Marking and teams.
  ink: '#eef3f8',
  muted: '#a3b0bd',
  accent: '#ff9f2e',
  signal: '#4fb6cf',
  hostile: '#e0503a',
  hazard: '#e8c245',
  sun: '#ffe8c8',

  // The viewmodel: near-black gunmetal, canvas sleeve, leather glove with the team's colour at the
  // cuff. The gun stays dark on purpose — the only thing in the corner of the frame that is
  // allowed to be the player's colour is the player.
  gun: '#2b3036',
  gunPoly: '#3a4147',
  sleeveFabric: '#3d423a',
  gloveLeather: '#8a6a48',
};

// The scalar a palette name becomes when a material or a light needs a colour object.
export function tint(name, scale = 1) {
  return new Color(PALETTE[name]).multiplyScalar(scale);
}
