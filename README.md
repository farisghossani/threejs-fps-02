# BLACKSITE

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/farisghossani/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/farisghossani/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A first-person firefight in three.js. You are one person walking into a bunker
four people are holding, with a rifle, ninety-five seconds and nothing else.

## Playing it

```
node serve.ts          # game/ is on http://localhost:8080
```

Open the page, click **Take the site**, and the mouse is yours.

| Input | Does |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| Click | Fire (hold for automatic) |
| `R` | Reload |
| `Ctrl` | Crouch — slower, quieter, tighter cone |
| `Space` | Jump |
| `1` `2` | Rifle, sidearm |
| `Esc` | Release the mouse |

The HUD reads left to right: round number, round clock, defenders left, score,
your health, your magazine and reserve. The crosshair opens as your cone of
fire widens, so a standing run is visibly less accurate than a crouched stop.

## How it is built

`game/` is plain ES modules the browser loads through an import map — there is
no build step between the source and the game. `main.ts` is the whole toolchain:
it copies `game/` and `screenshots/` to the output directory and writes
`dossier.json`.

The simulation and the renderer are separate on purpose:

- `game/src/sim.js` owns every piece of mutable state and steps at a fixed
  60 Hz. It touches no DOM and no WebGL, so the same code runs in a browser and
  under a test harness, at the same speed whatever the frame rate is doing.
- `game/src/render.js` only draws. A slow frame stretches the picture, never the
  game.

Every random draw goes through a seeded RNG (`rng.js`) and nothing in the game
reads the clock or calls `Math.random`, so a given seed rebuilds the same round
every time.

## The screenshots are captures, not poses

`game/src/shots.js` holds three setups — `?shot=start`, `?shot=play`,
`?shot=end` — and each one drives the *real* simulation with the same input
shape the keyboard produces, then stops. Nothing is placed by hand: the kill,
the damage on the health bar, the ammo count and the round result are what the
simulation itself produced. Because it is seeded and stepped at a fixed rate,
the same query rebuilds the same frame, so the images in `screenshots/` are
reproducible from the code beside them.

## Assembling an entry

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That refuses an entry the scorer would refuse — a `game/` over its file or byte
cap, a screenshot over the dossier's size cap — naming the number that broke it,
rather than shipping it.

MIT licensed.
