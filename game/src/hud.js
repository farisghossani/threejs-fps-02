// The DOM HUD: the readouts the player glances at during a round, the objective panel and the shop
// that opens between rounds. It holds no game state of its own — every number it shows comes from
// the simulation's view — and each element is written only when its value really changed, so
// drawing the HUD costs nothing while the numbers stand still.
const COPY = {
  start: {
    eyebrow: 'TWO SITES, FOUR DEFENDERS, ONE BOMB',
    title: 'BLACKSITE',
    copy: 'They hold the bunker at the north end — one on each lane, one in the middle, one on each site. Plant the bomb at A or B, or clear the compound before the clock runs out. They watch the lanes, they hear your shots and they shoot back.',
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
    copy: 'The round is yours. Collect, buy, and take the next one.',
    action: 'Next round',
  },
  lost: {
    eyebrow: 'ROUND OVER',
    title: 'ROUND LOST',
    copy: 'The defenders still hold the site. Watch the lanes, use the cover, and slow down before you shoot.',
    action: 'Next round',
  },
};

const SLOT_LABELS = ['1 RIFLE', '2 SMG', '3 SIDEARM'];

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
    timeLabel: document.getElementById('time-label'),
    timer: document.getElementById('timer'),
    enemies: document.getElementById('enemy-value'),
    feed: document.getElementById('feed'),
    health: document.getElementById('health'),
    healthValue: document.getElementById('health-value'),
    healthFill: document.getElementById('health-fill'),
    armourValue: document.getElementById('armour-value'),
    weaponName: document.getElementById('weapon-name'),
    ammo: document.getElementById('ammo'),
    ammoMag: document.getElementById('ammo-mag'),
    ammoReserve: document.getElementById('ammo-reserve'),
    ammoState: document.getElementById('ammo-state'),
    slots: [document.getElementById('slot-1'), document.getElementById('slot-2'), document.getElementById('slot-3')],
    grenade: document.getElementById('slot-4'),
    score: document.getElementById('score-value'),
    cash: document.getElementById('cash-value'),
    bomb: document.getElementById('bomb'),
    bombLine: document.getElementById('bomb-line'),
    bombBar: document.getElementById('bomb-bar'),
    bombFill: document.getElementById('bomb-fill'),
    bombSub: document.getElementById('bomb-sub'),
    plant: document.getElementById('plant'),
    plantFill: document.getElementById('plant-fill'),
    buy: document.getElementById('buy'),
    buyRows: document.getElementById('buy-rows'),
    buyCash: document.getElementById('buy-cash'),
    buyNote: document.getElementById('buy-note'),
  };

  const shown = {
    round: -1,
    time: '',
    timeLabel: '',
    enemies: '',
    health: -1,
    armour: -1,
    healthState: '',
    mag: -1,
    reserve: -1,
    weapon: '',
    score: -1,
    cash: -1,
    banner: '',
    feed: '\u0000',
    crosshair: -1,
    overlay: '',
    bomb: '',
    bombSub: '',
    plant: -1,
    buy: '',
    buyNote: '',
    slots: '',
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
      ['Points this round', result.timeBonus > 0 || result.bombBonus ? `${result.points} (incl. bonuses)` : String(result.points)],
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

  // The shop, written from the same rows the simulation buys from: a row is owned, affordable or
  // refused, and a refusal says why.
  function renderBuy(rows) {
    let signature = '';
    for (const row of rows) signature += `${row.id}:${row.owned}:${row.affordable}:${row.reason ?? ''}\n`;
    if (shown.buy === signature) return;
    shown.buy = signature;
    nodes.buyRows.textContent = '';
    rows.forEach((row, index) => {
      const line = document.createElement('div');
      line.className = `buy-row${row.owned ? ' owned' : row.affordable ? '' : ' locked'}`;
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(index + 1);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = row.name;
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = row.owned ? `owned — ${row.detail}` : row.affordable ? row.detail : `${row.detail} — ${row.reason}`;
      name.appendChild(detail);
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = row.owned ? 'OWNED' : `$${row.price}`;
      line.append(key, name, price);
      nodes.buyRows.appendChild(line);
    });
  }

  // The objective: what the bomb is doing, and what to do about it. One line, one fuse bar while it
  // is armed, and the site it went down in.
  function renderBomb(view) {
    const bomb = view.bomb;
    let key = '';
    let line = '';
    let sub = '';
    if (bomb.phase === 'planted') {
      key = 'armed';
      line = `BOMB ARMED — ${bomb.siteName} — ${clock(bomb.fuseLeft)}`;
      sub = bomb.defuseProgress > 0
        ? `A DEFENDER IS CUTTING IT — ${Math.round(bomb.defuseProgress * 100)}%`
        : 'DEFENDERS ARE MOVING ON IT';
    } else if (bomb.phase === 'exploded') {
      key = 'armed';
      line = 'BOMB DETONATED';
      sub = 'THE SITE IS GONE';
    } else if (bomb.phase === 'defused') {
      key = 'lost';
      line = 'BOMB DEFUSED';
      sub = 'A DEFENDER GOT TO IT IN TIME';
    } else if (view.phase === 'buy') {
      key = 'hidden';
    } else {
      key = bomb.inSite >= 0 ? `carried-${bomb.inSite}` : 'carried';
      line = bomb.inSite >= 0 ? 'BOMB CARRIED — STAND AND HOLD E TO PLANT' : 'CARRY THE BOMB — HOLD E INSIDE A OR B';
      sub = bomb.inSite >= 0 ? `IN ${bomb.carrySite}` : 'SITE A IS THE NORTH BUNKER, B THE EAST YARD';
    }
    const signature = `${key}|${line}|${sub}`;
    if (shown.bomb !== signature) {
      shown.bomb = signature;
      nodes.bombLine.textContent = line;
      nodes.bombSub.textContent = sub;
      nodes.bomb.hidden = key === 'hidden';
      nodes.bomb.className = key === 'armed' ? 'armed' : key === 'lost' ? 'lost' : '';
    }
    const fuse = bomb.planted ? 1 - bomb.fuseLeft / bomb.fuseTotal : 0;
    if (nodes.bombBar.hidden === bomb.planted) nodes.bombBar.hidden = !bomb.planted;
    nodes.bombFill.style.width = `${Math.max(0, Math.min(1, fuse)) * 100}%`;
  }

  function renderKit(view) {
    const signature = `${view.slots.join()}|${view.slot}|${view.grenades}`;
    if (shown.slots === signature) return;
    shown.slots = signature;
    view.slots.forEach((owned, index) => {
      const slot = nodes.slots[index];
      slot.className = owned ? `slot${index === view.slot ? ' held' : ''}` : 'slot';
      slot.style.opacity = owned ? '1' : '.38';
      slot.textContent = SLOT_LABELS[index];
    });
    nodes.grenade.textContent = `G FRAG ×${view.grenades}`;
    nodes.grenade.style.opacity = view.grenades > 0 ? '1' : '.38';
  }

  function update(view) {
    text(nodes.round, 'round', String(view.roundIndex));
    const buying = view.phase === 'buy';
    text(nodes.time, 'time', buying ? clock(view.buyLeft) : clock(view.timeLeft));
    const timeLabel = buying ? 'Buy time' : 'Round time';
    if (shown.timeLabel !== timeLabel) {
      shown.timeLabel = timeLabel;
      nodes.timeLabel.textContent = timeLabel;
    }
    const timerClass = buying ? 'buy' : view.timeLeft <= 15 ? 'critical' : '';
    if (nodes.timer.className !== timerClass) nodes.timer.className = timerClass;

    text(nodes.enemies, 'enemies', `${view.enemies}/${view.enemiesTotal}`);
    text(nodes.score, 'score', String(view.score));
    text(nodes.cash, 'cash', `$${view.money}`);

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
    if (shown.armour !== view.armour) {
      shown.armour = view.armour;
      nodes.armourValue.hidden = view.armour <= 0;
      nodes.armourValue.textContent = `ARMOUR ${view.armour}`;
    }

    text(nodes.weaponName, 'weapon', view.weapon);
    text(nodes.ammoMag, 'mag', String(view.mag));
    text(nodes.ammoReserve, 'reserve', `/ ${view.reserve}`);
    const ammoState = view.reloading > 0 ? 'reloading' : view.mag === 0 ? 'empty' : view.mag <= 8 ? 'low' : 'ok';
    if (nodes.ammo.dataset.state !== ammoState) {
      nodes.ammo.dataset.state = ammoState;
      nodes.ammoState.textContent = ammoState === 'reloading' ? 'RELOADING' : ammoState === 'empty' ? 'EMPTY — PRESS R' : '';
    }
    renderKit(view);

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
        nodes.bannerCopy.textContent = 'PLANT AT A OR B — OR CLEAR EVERY DEFENDER';
      }
      nodes.banner.hidden = false;
    } else if (shown.banner !== '') {
      shown.banner = '';
      nodes.banner.hidden = true;
    }

    renderBomb(view);

    if (shown.plant !== view.planting) {
      shown.plant = view.planting;
      nodes.plant.hidden = view.planting <= 0;
      nodes.plantFill.style.width = `${Math.round(view.planting * 100)}%`;
    }

    nodes.hitmarker.classList.toggle('on', view.hitMarker > 0);
    nodes.hitmarker.classList.toggle('kill', view.killMarker > 0);
    nodes.damage.style.opacity = String(Math.min(1, view.hurt * 2.2).toFixed(2));

    nodes.buy.hidden = !view.buyOpen;
    if (view.buyOpen) {
      nodes.buyCash.textContent = `$${view.money}`;
      renderBuy(view.buyRows);
      text(nodes.buyNote, 'buyNote', view.buyNote);
    }

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
