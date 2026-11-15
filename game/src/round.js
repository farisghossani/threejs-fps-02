// The round: a clock, a score, a kill feed and the two ways a round can end. It knows nothing
// about the map or the players; the simulation tells it what happened and it decides which phase
// the match is in, which is the one thing the HUD and the overlay both read.
import { CONFIG } from './config.js';

const match = CONFIG.match;

export function createRound() {
  const state = {
    index: 1,
    phase: 'live',
    timeLeft: match.roundSeconds,
    overLeft: 0,
    bannerLeft: match.bannerSeconds,
    score: 0,
    roundPoints: 0,
    kills: 0,
    headshots: 0,
    shots: 0,
    hits: 0,
    result: null,
    feed: [],
  };

  function accuracy() {
    return state.shots === 0 ? 0 : state.hits / state.shots;
  }

  function addFeed(text, tone) {
    state.feed.unshift({ text, tone, left: match.feedSeconds });
    if (state.feed.length > match.feedLines) state.feed.length = match.feedLines;
  }

  function countShot() {
    state.shots += 1;
  }

  function countHit() {
    state.hits += 1;
  }

  // A kill is worth points the moment it happens, so the score on the HUD answers to the trigger
  // rather than to the end of the round; the round bonus and the time bonus are added when it ends.
  function countKill(headshot) {
    state.kills += 1;
    state.roundPoints += match.killPoints;
    state.score += match.killPoints;
    if (headshot) state.headshots += 1;
  }

  function endRound(won, reason) {
    state.phase = 'over';
    state.overLeft = match.overSeconds;
    const timeBonus = won ? Math.ceil(state.timeLeft) * match.timeBonusPerSecond : 0;
    const bonus = won ? match.roundPoints : 0;
    state.roundPoints += bonus + timeBonus;
    state.score += bonus + timeBonus;
    state.result = {
      won,
      round: state.index,
      kills: state.kills,
      headshots: state.headshots,
      points: state.roundPoints,
      timeBonus,
      score: state.score,
      accuracy: accuracy(),
      timeLeft: state.timeLeft,
      reason,
    };
    addFeed(won ? 'ROUND WON — SITE CLEARED' : 'ROUND LOST', won ? 'win' : 'loss');
  }

  // One tick of the match clock. Returns 'next' on the tick the over-phase ends, which is the
  // simulation's cue to set the next round up.
  function step(dt, context) {
    for (let index = state.feed.length - 1; index >= 0; index -= 1) {
      const line = state.feed[index];
      line.left -= dt;
      if (line.left <= 0) state.feed.splice(index, 1);
    }
    state.bannerLeft = Math.max(0, state.bannerLeft - dt);

    if (state.phase === 'live') {
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      if (context.enemiesLeft === 0) endRound(true, 'Every defender is down.');
      else if (!context.playerAlive) endRound(false, 'You were eliminated.');
      else if (state.timeLeft === 0) endRound(false, 'The clock ran out with defenders still holding the site.');
    } else if (state.phase === 'over') {
      state.overLeft -= dt;
      if (state.overLeft <= 0) return 'next';
    }
    return null;
  }

  function beginRound() {
    state.index += 1;
    state.phase = 'live';
    state.timeLeft = match.roundSeconds;
    state.overLeft = 0;
    state.bannerLeft = match.bannerSeconds;
    state.roundPoints = 0;
    state.kills = 0;
    state.headshots = 0;
    state.shots = 0;
    state.hits = 0;
    state.result = null;
    state.feed.length = 0;
  }

  return { state, step, beginRound, addFeed, countShot, countHit, countKill, accuracy };
}
