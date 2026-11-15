// The DOM HUD: the readouts the player glances at during a round and the one panel that opens and
// closes one. It holds no game state of its own — every number it shows comes from the
// simulation's view — and each element is written only when its value really changed, so drawing
// the HUD costs nothing while the numbers stand still.
const COPY = {
  start: {
    eyebrow: 'ONE SITE, FOUR DEFENDERS, NINETY-FIVE SECONDS',
    title: 'BLACKSITE',
    copy: 'They hold the bunker at the north end — one on each lane, one in the middle, one on the site. Clear the compound before the clock runs out. They watch the lanes, they hear your shots and they shoot back.',
    action: 'Take the site',
  },
  paused: {
    eyebrow: 'PAUSED',
    title: 'HOLDING',
    copy: 'Nothing moves until you do. The defenders are still on their corners.',
    action: 'Resume',
  },
  won: {
    eyebrow: 'ROUND OVER',
    title: 'SITE CLEARED',
    copy: 'Every defender is down. Top the magazine up and take the next one.',
    action: 'Next round',
  },
  lost: {
    eyebrow: 'ROUND OVER',
    title: 'ROUND LOST',
    copy: 'The defenders still hold the site. Watch the lanes, use the cover, and slow down before you shoot.',
    action: 'Next round',
  },
};

export function createHud() {
  const nodes = {
    overlay: document.getElementById('overlay'),
    eyebrow: document.getElementById('overlay-eyebrow'),
    title: document.getElementById('overlay-title'),
    copy: document.getElementById('overlay-copy'),
    stats: document.getElementById('overlay-stats'),
    play: document.getElementById('play'),
    crosshair: document.getElementById('crosshair'),
    hitmarker: document.getElementById('hitmarker'),
    damage: document.getElementById('damage'),
    banner: document.getElementById('banner'),
    bannerRound: document.getElementById('banner-round'),
    bannerCopy: document.getElementById('banner-copy'),
    round: document.getElementById('round-value'),
    time: document.getElementById('time-value'),
    enemies: document.getElementById('enemy-value'),
    feed: document.getElementById('feed'),
    health: document.getElementById('health'),
    healthValue: document.getElementById('health-value'),
    healthFill: document.getElementById('health-fill'),
    weaponName: document.getElementById('weapon-name'),
    ammo: document.getElementById('ammo'),
    ammoMag: document.getElementById('ammo-mag'),
    ammoReserve: document.getElementById('ammo-reserve'),
    ammoState: document.getElementById('ammo-state'),
    score: document.getElementById('score-value'),
  };

  const shown = {
    round: -1,
    time: '',
    enemies: -1,
    health: -1,
    healthState: '',
    mag: -1,
    reserve: -1,
    weapon: '',
    score: -1,
    banner: '',
    feed: '\u0000',
    crosshair: -1,
    overlay: '',
  };

  function text(node, key, value) {
    if (shown[key] === value) return;
    shown[key] = value;
    node.textContent = value;
  }

  function clock(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function renderFeed(feed) {
    let signature = '';
    for (const line of feed) signature += `${line.tone}:${line.text}\n`;
    if (shown.feed === signature) return;
    shown.feed = signature;
    nodes.feed.textContent = '';
    for (const line of feed) {
      const item = document.createElement('li');
      item.className = line.tone;
      item.textContent = line.text;
      nodes.feed.appendChild(item);
    }
  }

  function renderStats(result) {
    nodes.stats.textContent = '';
    if (!result) return;
    const rows = [
      ['Defenders down', `${result.kills} of 4`],
      ['Headshots', String(result.headshots)],
      ['Accuracy', `${Math.round(result.accuracy * 100)}%`],
      ['Points this round', result.timeBonus > 0 ? `${result.points} (incl. ${result.timeBonus} time bonus)` : String(result.points)],
      ['Total score', String(result.score)],
    ];
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      nodes.stats.append(term, detail);
    }
  }

  function update(view) {
    text(nodes.round, 'round', String(view.roundIndex));
    text(nodes.time, 'time', clock(view.timeLeft));
    text(nodes.enemies, 'enemies', `${view.enemies}/${view.enemiesTotal}`);
    text(nodes.score, 'score', String(view.score));

    if (shown.health !== view.health) {
      shown.health = view.health;
      nodes.healthValue.textContent = String(view.health);
      nodes.healthFill.style.width = `${view.health}%`;
    }
    const healthState = view.health <= 25 ? 'critical' : view.health <= 60 ? 'hurt' : 'ok';
    if (shown.healthState !== healthState) {
      shown.healthState = healthState;
      nodes.health.className = healthState;
    }

    text(nodes.weaponName, 'weapon', view.weapon);
    text(nodes.ammoMag, 'mag', String(view.mag));
    text(nodes.ammoReserve, 'reserve', `/ ${view.reserve}`);
    const ammoState = view.reloading > 0 ? 'reloading' : view.mag === 0 ? 'empty' : view.mag <= 8 ? 'low' : 'ok';
    if (nodes.ammo.dataset.state !== ammoState) {
      nodes.ammo.dataset.state = ammoState;
      nodes.ammoState.textContent = ammoState === 'reloading' ? 'RELOADING' : ammoState === 'empty' ? 'EMPTY — PRESS R' : '';
    }

    // The crosshair is a readout too: it opens with the cone the next round will leave in, so a run
    // looks as inaccurate as it is.
    const gap = Math.round(4 + view.spread * 760);
    if (shown.crosshair !== gap) {
      shown.crosshair = gap;
      nodes.crosshair.style.setProperty('--gap', `${gap}px`);
    }

    if (view.banner > 0) {
      const banner = `ROUND ${view.roundIndex} — ELIMINATE ALL DEFENDERS`;
      if (shown.banner !== banner) {
        shown.banner = banner;
        nodes.bannerRound.textContent = `ROUND ${view.roundIndex}`;
        nodes.bannerCopy.textContent = 'ELIMINATE ALL DEFENDERS HOLDING THE SITE';
      }
      nodes.banner.hidden = false;
    } else if (shown.banner !== '') {
      shown.banner = '';
      nodes.banner.hidden = true;
    }

    nodes.hitmarker.classList.toggle('on', view.hitMarker > 0);
    nodes.hitmarker.classList.toggle('kill', view.killMarker > 0);
    nodes.damage.style.opacity = String(Math.min(1, view.hurt * 2.2).toFixed(2));

    renderFeed(view.feed);
  }

  function show(mode, result) {
    const copy = COPY[mode];
    nodes.eyebrow.textContent = result ? `ROUND ${result.round} OVER` : copy.eyebrow;
    nodes.title.textContent = mode === 'lost' && result && result.timeLeft <= 0 ? 'TIME EXPIRED' : copy.title;
    nodes.copy.textContent = result ? `${result.reason} ${copy.copy}` : copy.copy;
    nodes.play.textContent = copy.action;
    renderStats(result ?? null);
    shown.overlay = mode;
    nodes.overlay.hidden = false;
    nodes.play.focus();
  }

  return {
    update,
    showStart() {
      show('start');
    },
    showPaused() {
      show('paused');
    },
    showResult(result) {
      show(result.won ? 'won' : 'lost', result);
    },
    hide() {
      shown.overlay = '';
      nodes.overlay.hidden = true;
    },
    isOverlayOpen() {
      return shown.overlay !== '';
    },
    onPlay(handler) {
      nodes.play.addEventListener('click', handler);
    },
  };
}
