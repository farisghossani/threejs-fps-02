// shots.ts — capture the entry's screenshots from the game itself, headless.
//
// The kit's screenshots are the first thing a judge looks at and the only evidence a dossier has
// that the game in game/ is the game in the pictures. Each one is a query the game understands:
// the capture setups in game/src/shots.js drive the real simulation with scripted input until the
// frame is the state the shot is named for, then stop. So this script only has to serve the entry,
// point a browser at a URL and hand over the image.
//
//   node shots.ts                    # all shots in shots.json, into screenshots/
//   node shots.ts 2-play             # just one, when iterating on a setup
//
// Chromium is run with the software rasteriser so a capture does not depend on a GPU being there,
// at the entry's own capture size: 1280x480, the long side at the scorer's limit.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENTRY_DIR = fileURLToPath(new URL('.', import.meta.url));
const SHOTS = JSON.parse(fs.readFileSync(path.join(ENTRY_DIR, 'shots.json'), 'utf8')) as {
  name: string;
  query: string;
}[];

const PORT = Number(process.env.PORT ?? 8080);
const URL_BASE = `http://localhost:${PORT}/`;
const OUT_DIR = path.join(ENTRY_DIR, 'shots-out');
const SHIPPED_DIR = path.join(ENTRY_DIR, 'screenshots');

const CHROME =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;

const WIDTH = 1280;
const HEIGHT = 480;

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(URL_BASE);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`serve.ts never answered on ${URL_BASE}`);
}

// The rasteriser, spelled out: no GPU, swiftshader through ANGLE, and the entry's own size.
function chromeArgs(pageUrl: string, output: string): string[] {
  return [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--virtual-time-budget=25000',
    `--screenshot=${output}`,
    pageUrl,
  ];
}

const wanted = process.argv.slice(2);
const shots = wanted.length > 0 ? SHOTS.filter((shot) => wanted.includes(shot.name.replace(/\.jpg$/, ''))) : SHOTS;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(SHIPPED_DIR, { recursive: true });

const server = spawn('node', [path.join(ENTRY_DIR, 'serve.ts')], { stdio: 'ignore' });
await waitForServer();

for (const shot of shots) {
  const png = path.join(OUT_DIR, shot.name.replace(/\.jpg$/, '.png'));
  const jpeg = path.join(SHIPPED_DIR, shot.name);
  const code = await run(CHROME, chromeArgs(`${URL_BASE}${shot.query}`, png));
  if (code !== 0 || !fs.existsSync(png)) throw new Error(`${shot.name}: chromium exited ${code}`);
  // 16-bit precision is plenty for a screenshot and a third of the size of a lossless PNG.
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '3', jpeg]);
  const pngBytes = fs.statSync(png).size;
  const jpegBytes = fs.statSync(jpeg).size;
  console.log(`${shot.name}  ${pngBytes} png -> ${jpegBytes} jpeg  ${WIDTH}x${HEIGHT}`);
}

server.kill();
