// The look plan, in one place: a cold concrete grey, one warm accent for everything the player
// acts on, and one hostile red reserved for the other side. The same names are the CSS custom
// properties in index.html, so the DOM HUD and the 3D scene cannot drift apart.
export const PALETTE = {
  canvas: '#0c1015',
  surface: '#171d25',
  hairline: '#242e39',
  stone: '#3a4450',
  ink: '#e6ecf2',
  muted: '#8a97a5',
  accent: '#ff9f2e',
  hostile: '#d3523f',
};

export function shade(name) {
  return PALETTE[name];
}
