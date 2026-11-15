// The money: what the player owns, what it costs, what a round pays and what a purchase is worth.
// It is the one place a price or a reward is written down, and it knows nothing about the map, the
// weapons' feel or the HUD — it answers "can this be bought" and "what does this round owe", and
// the simulation spends the answer. Everything about a buy phase lives here and in round.js.
import { CONFIG } from './config.js';

// The shelf. `slot` is the weapon slot a gun occupies, which is how a purchase reaches the
// weapons; `limit` is how many of a thing a player may hold.
export const CATALOG = [
  { id: 'rifle', name: 'AR-11 RIFLE', price: 2700, kind: 'weapon', slot: 0, detail: '33 body · 108 head' },
  { id: 'smg', name: 'MP-9 SMG', price: 1250, kind: 'weapon', slot: 1, detail: '22 body · 62 head · fast' },
  { id: 'pistol', name: 'P-9 SIDEARM', price: 500, kind: 'weapon', slot: 2, detail: '26 body · 88 head' },
  { id: 'frag', name: 'M-67 FRAG', price: 300, kind: 'grenade', limit: 2, detail: 'thrown · 1.5 s fuse' },
  { id: 'kevlar', name: 'KEVLAR VEST', price: 650, kind: 'armour', limit: 1, detail: 'half damage taken' },
];

const ARMOUR_POINTS = 100;

export function createEconomy() {
  const state = {
    money: CONFIG.economy.start,
    lossStreak: 0,
    owned: { rifle: true, smg: false, pistol: true },
    grenades: 0,
    armour: 0,
    spent: 0,
  };

  function add(amount) {
    state.money = Math.min(CONFIG.economy.max, state.money + amount);
    return state.money;
  }

  function owns(id) {
    const item = CATALOG.find((entry) => entry.id === id);
    if (!item) return false;
    if (item.kind === 'weapon') return state.owned[item.id] === true;
    if (item.kind === 'grenade') return state.grenades >= (item.limit ?? 1);
    return state.armour > 0;
  }

  // A refusal names the reason, because the buy menu shows it: the player should never be left
  // wondering why a row did nothing.
  function refusal(item) {
    if (state.money < item.price) return 'not enough money';
    if (item.kind === 'grenade' && state.grenades >= (item.limit ?? 1)) return 'already carrying the limit';
    if (item.kind === 'armour' && state.armour > 0) return 'already wearing one';
    if (item.kind === 'weapon' && state.owned[item.id]) return 'already owned';
    return null;
  }

  function quote(item) {
    const reason = refusal(item);
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      detail: item.detail,
      kind: item.kind,
      owned: item.kind === 'weapon' ? state.owned[item.id] === true : owns(item.id),
      affordable: reason === null,
      reason,
    };
  }

  function rows() {
    return CATALOG.map(quote);
  }

  function buy(id) {
    const item = CATALOG.find((entry) => entry.id === id);
    if (!item) return { ok: false, reason: 'no such item' };
    const reason = refusal(item);
    if (reason) return { ok: false, reason };
    state.money -= item.price;
    state.spent += item.price;
    if (item.kind === 'weapon') state.owned[item.id] = true;
    else if (item.kind === 'grenade') state.grenades += 1;
    else state.armour = ARMOUR_POINTS;
    return { ok: true, item, slot: item.slot ?? null };
  }

  // Damage goes through the vest first: half of it is taken off the armour, half off the health.
  function absorb(amount) {
    if (state.armour <= 0) return amount;
    const absorbed = Math.min(state.armour, amount * CONFIG.player.armourAbsorb);
    state.armour -= absorbed;
    return amount - absorbed;
  }

  function ownsSlot(slot) {
    const item = CATALOG.find((entry) => entry.kind === 'weapon' && entry.slot === slot);
    return item ? state.owned[item.id] === true : false;
  }

  function takeGrenade() {
    if (state.grenades <= 0) return false;
    state.grenades -= 1;
    return true;
  }

  return {
    state,
    rows,
    buy,
    absorb,
    ownsSlot,
    takeGrenade,
    // A kill pays, a head shot pays more, and a round pays by its outcome: a win pays flat, a
    // loss pays a rising bonus so a losing player can still buy their way back in.
    awardKill(headshot) {
      add(CONFIG.economy.kill + (headshot ? CONFIG.economy.headshot : 0));
      return state.money;
    },
    awardPlant() {
      return add(CONFIG.economy.plant);
    },
    awardDefuse() {
      return add(CONFIG.economy.defuse);
    },
    awardRound(won) {
      if (won) {
        state.lossStreak = 0;
        return add(CONFIG.economy.win);
      }
      state.lossStreak += 1;
      const bonus = Math.min(CONFIG.economy.lossCap, CONFIG.economy.lossBase + (state.lossStreak - 1) * CONFIG.economy.lossStep);
      return add(bonus);
    },
  };
}
