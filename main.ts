// main.ts — the program the grader runs (Node 22, standard library only).
//
// It takes the entry sitting beside this file and assembles the output the judge reads:
//
//   <output>/game/         the playable game, copied verbatim — plain ES modules the browser
//                          loads through an import map, so there is no bundler in the way
//   <output>/screenshots/  the captures of that game actually running
//   <output>/dossier.json  the summary the judge opens first
//
// The scorer's caps are enforced here as well as on the site. Breaching one there is a zero, so a
// cap breached here stops the run and names the number that broke it rather than shipping it.
//
// Assemble an entry the way the grader does:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Play the game locally with:
//
//   node serve.ts          # then open http://localhost:8080

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const ENTRY_DIR = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_DIR = path.join(ENTRY_DIR, 'game');
const CAPTURE_DIR = path.join(ENTRY_DIR, 'screenshots');

const OUTPUT_GAME = path.join(OUTPUT_DIR, 'game');
const OUTPUT_CAPTURES = path.join(OUTPUT_DIR, 'screenshots');

// The scorer's own numbers (reference/gate.json). Only text_max_bytes shapes the dossier; the
// rest refuse here an entry the scorer would refuse, before a byte of it is spent.
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// A tree's two capped numbers: how many files it holds and how many bytes they add up to.
function measure(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const pending: string[] = [dir];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(full).size;
      }
    }
  }
  return { files, bytes };
}

// Read the output back and return the one thing about it the scorer would refuse, or null.
function objectionTo(outputGame: string, outputCaptures: string): string | null {
  const game = measure(outputGame);
  if (game.files > GATE.game_max_files) return `game/ holds ${game.files} files, over the ${GATE.game_max_files} the scorer reads`;
  if (game.bytes > GATE.game_max_bytes) return `game/ holds ${game.bytes} bytes, over the ${GATE.game_max_bytes} the scorer reads`;

  const shots = fs.readdirSync(outputCaptures).filter((name) => /\.(png|jpe?g)$/i.test(name));
  if (shots.length === 0) return 'screenshots/ holds no PNG or JPEG: the entry has nothing to show';
  if (shots.length > GATE.screenshots.max) return `screenshots/ holds ${shots.length} images, over the ${GATE.screenshots.max} a dossier holds`;
  for (const name of shots) {
    const bytes = fs.statSync(path.join(outputCaptures, name)).size;
    if (bytes > GATE.screenshots.max_bytes) return `screenshot ${name} is ${bytes} bytes, over the ${GATE.screenshots.max_bytes} a dossier holds`;
  }
  return null;
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

fs.cpSync(GAME_DIR, OUTPUT_GAME, { recursive: true });

fs.mkdirSync(OUTPUT_CAPTURES, { recursive: true });
if (fs.existsSync(CAPTURE_DIR)) fs.cpSync(CAPTURE_DIR, OUTPUT_CAPTURES, { recursive: true });

const dossier = buildDossier(OUTPUT_DIR, GATE);
fs.writeFileSync(path.join(OUTPUT_DIR, 'dossier.json'), dossier);

// After the copy, never before: the caps describe what was handed over, not what was meant to be.
const objection = objectionTo(OUTPUT_GAME, OUTPUT_CAPTURES);
if (objection !== null) throw new Error(`the scorer would refuse this entry: ${objection}`);

const game = measure(OUTPUT_GAME);
const shots = fs.readdirSync(OUTPUT_CAPTURES).filter((name) => /\.(png|jpe?g)$/i.test(name));
console.log(
  `entry assembled in ${OUTPUT_DIR}: ${game.files} game files (${(game.bytes / 1048576).toFixed(2)} MiB), ` +
    `${shots.length} screenshots, dossier ${dossier.length} bytes`,
);
