
// === storage.js (local-only, per-utente) ===
const STORAGE_PREFIX = 'mitharia_';

// --- low-level helpers ---
function _sget(k) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + k)); }
  catch { return null; }
}
function _sset(k, v) { localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v)); }
function _srem(k) { localStorage.removeItem(STORAGE_PREFIX + k); }

// --- current user (HTML sets window.currentUser during login/register) ---
function _cu() { return (typeof currentUser === 'string' && currentUser) ? currentUser : null; }

// --- userStore: namespaced by user ---
const userStore = {
  _k(key) {
    const u = _cu();
    // Se non c'è un utente loggato, ritorniamo null (niente errori in console)
    if (!u) return null;
    return `u:${u}:${key}`;
  },
  get(key) {
    const k = this._k(key);
    if (!k) return null;
    return _sget(k);
  },
  set(key, val) {
    const k = this._k(key);
    if (!k) return;
    _sset(k, val);
  },
  remove(key) {
    const k = this._k(key);
    if (!k) return;
    _srem(k);
  }
};


// === Motto personale (per eroe) ==============================================
// Ritorna il motto corrente dell'eroe (stringa, oppure "" se non impostato)
function getHeroMotto(){
  const v = userStore.get('hero_motto');
  return (typeof v === 'string') ? v : '';
}
// Imposta il motto corrente (taglia a 45 chars di sicurezza)
function setHeroMotto(text){
  const t = String(text || '').slice(0, 45);
  userStore.set('hero_motto', t);

  // 🔁 Specchia il motto nella directory eroi (così è visibile ai profili altrui)
  try {
    const me = (typeof currentUser === 'string' && currentUser) ? currentUser : null;
    if (me && typeof getHeroDirectory === 'function' && typeof setHeroDirectory === 'function') {
      const list = (getHeroDirectory() || []).slice();
      const myId = 'user:' + me;
      const idx = list.findIndex(h => h && h.id === myId);
      if (idx >= 0) {
        // preserva i campi esistenti e aggiunge/aggiorna "motto"
        list[idx] = { ...list[idx], motto: t };
        setHeroDirectory(list);
      }
    }
  } catch (_) {}

  return t;
}

// Storico motti (array di { text, when })
function listHeroMottoHistory(){
  const arr = userStore.get('hero_motto_hist');
  return Array.isArray(arr) ? arr : [];
}
function addHeroMottoHistory(text){
  const arr = listHeroMottoHistory();
  arr.push({ text: String(text || '').slice(0,45), when: Date.now() });
  userStore.set('hero_motto_hist', arr);
}
// (opzionale) esponi in window se ti serve altrove
window.getHeroMotto = getHeroMotto;
window.setHeroMotto = setHeroMotto;
window.listHeroMottoHistory = listHeroMottoHistory;
window.addHeroMottoHistory = addHeroMottoHistory;

// --- numeric helpers ---
function getNum(key, def=0){ const v = userStore.get(key); return typeof v === 'number' ? v : (Number(v) || def); }
function setNum(key, val){ userStore.set(key, Number(val)||0); }
function addNum(key, delta){ setNum(key, getNum(key,0) + (Number(delta)||0)); }
// --- Abilità & Punti Abilità (per-utente) ---
const ABILITIES_LIST = [
  'Forza','Destrezza','Costituzione','Tecnica',
  'Arte Marziale','Saggezza','Furtività','Schivare','Magia', 'Legame Creatura'
];

/* =========================
   CHESTS / KEYS – CORE STORAGE
   ========================= */

/** ID stabili dei tier (usali ovunque) */
const KEY_META = {
  ottone:  { label: 'Chiave d’Ottone',  tier: 1, fragKey: 'ottone',  fragmentsPerKey: 20 },
  argento: { label: 'Chiave d’Argento', tier: 2, fragKey: 'argento', fragmentsPerKey: 30 },
  oro:     { label: 'Chiave d’Oro',     tier: 3, fragKey: 'oro',     fragmentsPerKey: 50 },
  runica:  { label: 'Chiave Runica',    tier: 4, fragKey: 'runica',  fragmentsPerKey: 100 },
};
const KEY_IDS = Object.keys(KEY_META);

/** Inizializza/migra mappe 'keys' e 'keyFragments' nel salvataggio */
function ensureKeyStores() {
  let keys = userStore.get('keys');
  if (!keys || typeof keys !== 'object') keys = {};
  KEY_IDS.forEach(id => { if (!Number.isFinite(+keys[id])) keys[id] = 0; });
  userStore.set('keys', keys);

  let frags = userStore.get('keyFragments');
  if (!frags || typeof frags !== 'object') frags = {};
  KEY_IDS.forEach(id => { if (!Number.isFinite(+frags[id])) frags[id] = 0; });
  userStore.set('keyFragments', frags);
}

/** ——— GETTERS ——— */
function getKeys() { ensureKeyStores(); return userStore.get('keys'); }
function getKeyFragments() { ensureKeyStores(); return userStore.get('keyFragments'); }
function getKeyCount(id) { ensureKeyStores(); return Number(getKeys()?.[id]) || 0; }
function getFragmentCount(id) { ensureKeyStores(); return Number(getKeyFragments()?.[id]) || 0; }

/** ——— MUTATORS (aggiungi/togli) ——— */
function addKey(id, n = 1) {
  if (!KEY_META[id]) return;
  ensureKeyStores();
  const map = getKeys();
  map[id] = (Number(map[id]) || 0) + Math.max(0, n|0);
  userStore.set('keys', map);
}

function spendKey(id, n = 1) {
  if (!KEY_META[id]) return false;
  ensureKeyStores();
  const have = getKeyCount(id);
  if (have < n) return false;
  const map = getKeys();
  map[id] = have - n;
  userStore.set('keys', map);
  return true;
}

function addKeyFragments(id, n = 1) {
  if (!KEY_META[id]) return;
  ensureKeyStores();
  const map = getKeyFragments();
  map[id] = (Number(map[id]) || 0) + Math.max(0, n|0);
  userStore.set('keyFragments', map);
}

function spendKeyFragments(id, n = 1) {
  if (!KEY_META[id]) return false;
  ensureKeyStores();
  const have = getFragmentCount(id);
  if (have < n) return false;
  const map = getKeyFragments();
  map[id] = have - n;
  userStore.set('keyFragments', map);
  return true;
}

/** ——— FORGIA (frammenti → chiave) ———
 * Ritorna true se ha forgiato almeno 1 chiave.
 * Se passi `max=true`, consuma tutti i set possibili.
 */
function forgeKey(id, max = false) {
  if (!KEY_META[id]) return false;
  ensureKeyStores();
  const need = KEY_META[id].fragmentsPerKey;
  let have = getFragmentCount(id);
  if (have < need) return false;

  if (!max) {
    spendKeyFragments(id, need);
    addKey(id, 1);
    return true;
  } else {
    const qty = Math.floor(have / need);
    if (qty <= 0) return false;
    spendKeyFragments(id, qty * need);
    addKey(id, qty);
    return true;
  }
}
// === POZIONI (consumabili stackabili) ===
function ensurePotionStore(){
  let map = userStore.get('potions');
  if (!map || typeof map !== 'object') {
    map = {};
    userStore.set('potions', map);
  }
  return map;
}
function getPotions(){ return ensurePotionStore(); }
function getPotionCount(id){ const m = ensurePotionStore(); return Number(m[id]||0); }
function addPotion(id, n=1){
  const m = ensurePotionStore();
  m[id] = Number(m[id]||0) + (Number(n)||0);
  userStore.set('potions', m);
}
function spendPotion(id, n=1){
  const m = ensurePotionStore();
  const have = Number(m[id]||0);
  const need = Number(n)||0;
  if (have < need) return false;
  m[id] = have - need;
  if (m[id] <= 0) delete m[id];
  userStore.set('potions', m);
  return true;
}
window.getPotions = getPotions;
window.getPotionCount = getPotionCount;
window.addPotion = addPotion;
window.spendPotion = spendPotion;

/** ——— Helper comodo per quest/ricompense ———
 * Esempi:
 *   grantKeys({ runica: 1 })                  // +1 Chiave Runica
 *   grantKeyFragments({ oro: 7, argento: 3 }) // +7 frammenti ORO, +3 ARGENTO
 */
function grantKeys(obj) {
  if (!obj || typeof obj !== 'object') return;
  Object.entries(obj).forEach(([id, n]) => addKey(id, Number(n)||0));
}
function grantKeyFragments(obj) {
  if (!obj || typeof obj !== 'object') return;
  Object.entries(obj).forEach(([id, n]) => addKeyFragments(id, Number(n)||0));
}

/** (opzionale) pronto per UI: ritorna oggetto compatto */
function getKeySummary() {
  ensureKeyStores();
  const keys = getKeys();
  const frags = getKeyFragments();
  const out = {};
  KEY_IDS.forEach(id => {
    out[id] = {
      label: KEY_META[id].label,
      tier: KEY_META[id].tier,
      keys: Number(keys[id])||0,
      fragments: Number(frags[id])||0,
      fragmentsPerKey: KEY_META[id].fragmentsPerKey
    };
  });
  return out;
}

// Esponi globalmente (se nel tuo progetto usi funzioni globali)
window.ensureKeyStores = ensureKeyStores;
window.getKeys = getKeys;
window.getKeyFragments = getKeyFragments;
window.getKeyCount = getKeyCount;
window.getFragmentCount = getFragmentCount;
window.addKey = addKey;
window.spendKey = spendKey;
window.addKeyFragments = addKeyFragments;
window.spendKeyFragments = spendKeyFragments;
window.forgeKey = forgeKey;
window.grantKeys = grantKeys;
window.grantKeyFragments = grantKeyFragments;
window.getKeySummary = getKeySummary;
window.KEY_META = KEY_META;
window.KEY_IDS = KEY_IDS;
// === Polvere Arcana (numero) ===
window.getArcaneDust = function(){ return getNum('arcaneDust', 0); };
window.addArcaneDust = function(n){ addNum('arcaneDust', Number(n)||0); };

// === Pity per forzieri (GLOBALE) ===
function ensureChestStores(){
  const pity = userStore.get('chestPity');

  // Valori correnti (formato nuovo)
  const curAvv = (pity && typeof pity === 'object' && 'avv' in pity)
    ? Math.max(0, Number(pity.avv) || 0)
    : 0;
  const curRe  = (pity && typeof pity === 'object' && 're' in pity)
    ? Math.max(0, Number(pity.re) || 0)
    : 0;

  // Struttura legacy presente? (armi/armature/magie/creature)
  const hasLegacy = pity && typeof pity === 'object' &&
                   (pity.armi || pity.armature || pity.magie || pity.creature);

  let legacyAvv = 0, legacyRe = 0;
  if (hasLegacy) {
    const sum = (k) => ['armi','armature','magie','creature']
      .reduce((acc, cat) => acc + (Number(pity?.[cat]?.[k]) || 0), 0);
    legacyAvv = sum('avv');
    legacyRe  = sum('re');
  }

  // Merge SICURO: mai diminuire
  const merged = {
    avv: Math.max(0, curAvv, legacyAvv),
    re:  Math.max(0, curRe,  legacyRe),
  };

  // Scrive solo il formato nuovo (ripulisce eventuali chiavi legacy)
  userStore.set('chestPity', merged);
  return merged;
}
window.ensureChestStores = ensureChestStores;

window.getChestPity = function(tier){
  const p = ensureChestStores();
  if (tier === 'avventuriero') return p.avv | 0;
  if (tier === 're')           return p.re  | 0;
  return 0;
};

window.setChestPity = function(tier, val){
  const p = ensureChestStores();
  if (tier === 'avventuriero') p.avv = Math.max(0, val | 0);
  if (tier === 're')           p.re  = Math.max(0, val | 0);
  userStore.set('chestPity', p);
};


/* =========================
   CHESTS – DEFINITIONS (Tiers, odds, level)
   ========================= */
const CHEST_TIERS = {
  mercante: {
    label: 'Cofanetto del Mercante',
    keyId: 'ottone',
    minLevel: 10,
    odds: { rara: 0.80, epica: 0.18, leggendaria: 0.019, mitica: 0.001 }
  },
  avventuriero: {
    label: 'Scrigno dell’Avventuriero',
    keyId: 'argento',
    minLevel: 15,
    odds: { rara: 0.00, epica: 0.75, leggendaria: 0.24, mitica: 0.01 }
  },
  re: {
    label: 'Forziere dei Re',
    keyId: 'oro',
    minLevel: 20,
    odds: { rara: 0.00, epica: 0.00, leggendaria: 0.85, mitica: 0.15 }
  },
  arcano: {
    label: 'Reliquiario Arcano',
    keyId: 'runica',
    minLevel: 30,
    odds: { rara: 0.00, epica: 0.00, leggendaria: 0.00, mitica: 1.00 }
  }
};
window.CHEST_TIERS = CHEST_TIERS;

function getArcaneDust(){ return Number(userStore.get('arcaneDust')) || 0; }

window.ensureChestStores = ensureChestStores;
window.getArcaneDust    = getArcaneDust;

// Inizializza (se mancante) e restituisce l'oggetto abilità { nome: valore }
function getAbilities() {
  let a = userStore.get('abilities');
  if (!a || typeof a !== 'object') {
    a = {};
    ABILITIES_LIST.forEach(n => { a[n] = 0; });
    userStore.set('abilities', a);
  }
  return a;
}
function setAbilities(obj) {
  userStore.set('abilities', obj);
}

// Punti Abilità non spesi
function getAbilityPoints() { return getNum('abilityPoints', 0); }
function addAbilityPoints(n) { addNum('abilityPoints', Number(n)||0); }
function spendAbilityPoints(n) { addNum('abilityPoints', -(Number(n)||0)); }
// === Caratteristiche fisse Creature (1..15) ===
const CREATURE_TRAITS = {
  'Licantropo':       { Forza: 10, Agilità: 11, Astuzia: 7,  Aggressività: 13, Dimensioni: 9  },
  'Drago':            { Forza: 16, Agilità: 8,  Astuzia: 12, Aggressività: 14, Dimensioni: 15 },
  'Tigre':            { Forza: 10, Agilità: 13, Astuzia: 8,  Aggressività: 11, Dimensioni: 8  },
  'Non Morto':        { Forza: 8,  Agilità: 5,  Astuzia: 7,  Aggressività: 10,  Dimensioni: 6  },
  'Goblin':           { Forza: 4,  Agilità: 9,  Astuzia: 10, Aggressività: 7,  Dimensioni: 3  },
  'Fenice':           { Forza: 10,  Agilità: 18, Astuzia: 14, Aggressività: 9,  Dimensioni: 8  },
  'Grifone':          { Forza: 12, Agilità: 16, Astuzia: 10,  Aggressività: 11, Dimensioni: 10 },
  'Golem di Pietra':  { Forza: 22, Agilità: 3,  Astuzia: 5,  Aggressività: 9,  Dimensioni: 13 },
  'Serpente marino':  { Forza: 14, Agilità: 16,  Astuzia: 12,  Aggressività: 11, Dimensioni: 12 },
  'Cavaliere spettrale': { Forza: 12, Agilità: 9, Astuzia: 10, Aggressività: 9, Dimensioni: 8 }
};

// Helper per leggere le caratteristiche di una creatura dal suo nome
function getCreatureTraits(name) {
  const raw = String(name || '').trim();
  const m = raw.match(/\[(Rara|Epica|Leggendaria|Mitica)\]$/i);
  const base = raw.replace(/\s\[(Rara|Epica|Leggendaria|Mitica)\]$/i, '').trim();

  // base traits (case-insensitive)
  let baseTraits = CREATURE_TRAITS[base];
  if (!baseTraits) {
    const n = base.toLowerCase();
    for (const k in CREATURE_TRAITS) {
      if (k.toLowerCase() === n) { baseTraits = CREATURE_TRAITS[k]; break; }
    }
  }
  if (!baseTraits) return null;

  // bonus rarità
  const upMap = { rara:2, epica:4, leggendaria:6, mitica:8 };
  const up = m ? (upMap[m[1].toLowerCase()] || 0) : 0;

  // ritorno una copia “potenziata” (mai mutare l’originale in mappa)
  return {
    Forza: baseTraits.Forza + up,
    Agilità: baseTraits.Agilità + up,
    Astuzia: baseTraits.Astuzia + up,
    Aggressività: baseTraits.Aggressività + up,
    Dimensioni: baseTraits.Dimensioni + up
  };
}


function addCreatureXp(name, amount) {
  ensureCreatureXpMap();
  const xp = userStore.get('creatureXp') || {};
  xp[name] = (xp[name] || 0) + (Number(amount) || 0);
  userStore.set('creatureXp', xp);
  return xp[name];
}

function ensureCreatureXpMap() {
  if (!userStore.get('creatureXp')) userStore.set('creatureXp', {}); // mappa vuota
}
function getCreatureXp(name) {
  const xp = userStore.get('creatureXp') || {};
  return xp[name] || 0;
}


// --- accountStore with salted SHA-256 ---
const accountStore = {
  _userKey(u){ return `acc:${u}`; },
  _emailKey(u){ return `accEmail:${u}`; },

  async setPassword(username, password){
    const salt = accountStore._randomSalt();
    const hash = await accountStore._hash(password, salt);
    _sset(this._userKey(username), { salt, hash });
  },
  async verifyPassword(username, password){
    const rec = _sget(this._userKey(username));
    if (!rec || !rec.salt || !rec.hash) return false;
    const test = await accountStore._hash(password, rec.salt);
    return test === rec.hash;
  },
  setEmail(username, email){ _sset(this._emailKey(username), email); },
  getEmail(username){ return _sget(this._emailKey(username)) || null; },

  // Elimina le credenziali e i metadati dell'account
  deleteAccount(username) {
    _srem(this._userKey(username));   // acc:<username>
    _srem(this._emailKey(username));  // accEmail:<username>
  },

  _randomSalt(){
    const arr = new Uint8Array(16); crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  },
  async _hash(password, saltHex){
    const enc = new TextEncoder();
    const data = enc.encode(saltHex + ':' + password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(buf);
    return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  }
};

// --- migration: move legacy flat keys into user namespace (idempotente) ---
function migrateLegacyToUserStore(){
  const u = _cu(); if (!u) return;
  const legacyKeys = ['hero','gold','magics','weapons','armors','creatures','level','xpProgress','xpTotal',
                      'rightHand','leftHand','magic',
                      'missionActive','missionEndTime','activeMissionRewards','activeMissionId','missionStartTime',
                      'missionCooldowns','lastMissionResult','messages'];
  for (const k of legacyKeys){
    const flat = _sget(k);
    const namespaced = _sget(`u:${u}:${k}`);
    if (flat != null && namespaced == null){
      userStore.set(k, flat);
      _srem(k);
    }
  }
}

// --- wipe user data (estesa: namespace + directory eroi + gilde) ---
function wipeUser(){
  const u = _cu(); if (!u) return;

  // 1) Cancella tutte le chiavi namespaced dell'utente
  const prefix = STORAGE_PREFIX + 'u:' + u + ':';
  const rm = [];
  for (let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) rm.push(key);
  }
  rm.forEach(k => localStorage.removeItem(k));

  // 2) Rimuovi l’eroe dalla directory globale (Sfide / Sala degli Eroi)
  try {
    const list = _sget('heroDirectory_global') || [];
    const myId = 'user:' + u;
    const filtered = list.filter(h => !(h && (h.id === myId || h.name === u)));
    _sset('heroDirectory_global', filtered);
  } catch(e){ /* no-op */ }

  // 3) Rimuovi l’utente da tutte le gilde globali
  try {
    if (typeof ensureGuildStores === 'function') ensureGuildStores();

    const guilds = (typeof getGuilds === 'function') ? getGuilds() : {};
    const memMap = (typeof getGuildMembersMap === 'function') ? getGuildMembersMap() : {};

    // 3a) togli dalle liste membri
    Object.keys(memMap).forEach(gid => {
      const arr = Array.isArray(memMap[gid]) ? memMap[gid] : [];
      const newArr = arr.filter(m => m && m.user !== u);
      memMap[gid] = newArr;
    });

    // 3b) se era leader: promuovi il primo membro rimasto, altrimenti elimina la gilda vuota
    Object.keys(guilds).forEach(gid => {
      const g = guilds[gid];
      if (!g) return;
      if (g.owner === u) {
        const members = memMap[gid] || [];
        if (members.length > 0) {
          const newLeader = members[0].user;
          g.owner = newLeader;
          // assicura il ruolo "leader" al nuovo proprietario
          members.forEach(m => { if (m.user === newLeader) m.role = 'leader'; });
          memMap[gid] = members;
        } else {
          // nessun membro: elimina gilda e relativa lista
          delete guilds[gid];
          delete memMap[gid];
        }
      }
    });

    if (typeof setGuilds === 'function') setGuilds(guilds);
    if (typeof setGuildMembersMap === 'function') setGuildMembersMap(memMap);
  } catch(e){ /* no-op */ }
}

// === Catalogo Bottega delle Pozioni ===
window.potionCatalog = [
  {
    id: 'pot_small',
    name: 'Pozione Salute Piccola',
    heal: 2,
    price: 800,
    desc: 'Un sorso ristoratore distillato dai guaritori di Mitharia. Ripristina un po’ di vigore dopo le esplorazioni.'
  },
  {
    id: 'pot_medium',
    name: 'Pozione Salute Media',
    heal: 5,
    price: 1500,
    desc: 'Miscela bilanciata di erbe rare. Riporta in forze gli avventurieri provati dalle prime sfide.'
  },
  {
    id: 'pot_large',
    name: 'Pozione Salute Grande',
    heal: 12,
    price: 3200,
    desc: 'Elisir potente preparato nelle cucine delle gilde. Ricuce ferite superficiali e ridona slancio.'
  },
  {
    id: 'pot_extra',
    name: 'Pozione Salute Extra',
    heal: 20,
    price: 5000,
    desc: 'Preparato magistrale dei maestri alchimisti. Riporta in forma anche i veterani allo stremo.'
  }
];

// prezzo di vendita: 2/3 del prezzo d’acquisto, arrotondato per eccesso
window.potionSellPrice = function(price){
  const p = Number(price)||0;
  return Math.ceil(p * 2 / 3);
};

// === CREATURES (catalogo + helper) ===

// Catalogo bottega creature (visibile come window.creatureShop)
window.creatureShop = [
  {
    id:'c1',
    name:'Licantropo',
    cost:6000,
    description:'Un guerriero maledetto che si trasforma sotto la luna piena. La sua forza e velocità superano di gran lunga quelle di un normale umano. Perfetto per missioni notturne e battaglie ravvicinate. La sua presenza incute timore nei nemici.',
    img:'https://tse1.mm.bing.net/th/id/OIP.H6qSKsNVRfgh5VbgqT8c2wHaHa?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c2',
    name:'Drago',
    cost:7000,
    description:'La creatura leggendaria per eccellenza. Padrone del cielo e del fuoco, può ridurre in cenere interi eserciti. Imponente e maestoso, è la più ambita. Richiede grande coraggio e rispetto per essere domato.',
    img:'https://tse3.mm.bing.net/th/id/OIP.8G5vjkY_qf344nqa9LeHFgHaHa?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c3',
    name:'Tigre',
    cost:5500,
    description:'Un felino potente e silenzioso, capace di scattare e abbattere la preda in un lampo. Fedele e letale, perfetto per chi ama muoversi nell’ombra. La sua agilità è ineguagliabile e i suoi artigli non perdonano.',
    img:'https://tse3.mm.bing.net/th/id/OIP.6KroiM6kIGoKgXcxc-f0fwHaHa?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c4',
    name:'Non Morto',
    cost:5000,
    description:'Risorto dalle tenebre, non sente dolore e non conosce paura. Un avversario implacabile e instancabile, che logora i nemici con attacchi continui. Un patto oscuro, ma efficace.',
    img:'https://tse2.mm.bing.net/th/id/OIP.kmE5TXA8LjDzJI_YNGz6xQHaKk?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c5',
    name:'Goblin',
    cost:4200,
    description:'Piccolo e subdolo, ma estremamente astuto. Usa trappole e imboscate per sopraffare avversari più grandi. Sottovalutarlo è un errore che costa caro.',
    img:'https://tse4.mm.bing.net/th/id/OIP.ZEK-770wKwxbRnMFrNyWQwHaHa?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c6',
    name:'Fenice',
    cost:6500,
    description:'Creatura di fuoco immortale che rinasce dalle ceneri. Porta speranza e distruzione allo stesso tempo. La sua fiamma purifica e incenerisce.',
    img:'https://tse1.mm.bing.net/th/id/OIP.STNPkalAuDsc0omVoZyH4gHaJy?r=0&w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c7',
    name:'Grifone',
    cost:7000,
    description:'Metà leone e metà aquila, signore dei cieli e delle terre. Veloce, potente e maestoso, simbolo di nobiltà e forza. Un alleato prezioso in ogni battaglia.',
    img:'https://tse4.mm.bing.net/th/id/OIP.WKcpDxd12qEAR5FjwYH90gHaJ4?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c8',
    name:'Golem di Pietra',
    cost:8000,
    description:'Un colosso di roccia e magma. La sua forza è inarrestabile e può erigere barriere di pietra a protezione. Ogni suo colpo fa tremare il terreno.',
    img:'https://tse2.mm.bing.net/th/id/OIP.KLUjOfLlQydAI0QHpX0eFgHaE7?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c9',
    name:'Serpente Marino',
    cost:7500,
    description:'Creatura mitica che regna sulle profondità. Agile e letale in acqua, può affondare navi con un solo assalto. Il suo sibilo è presagio di tempesta.',
    img:'https://tse3.mm.bing.net/th/id/OIP.QxG61Vu99Pr16anB52b3FQHaE7?r=0&w=474&h=474&c=7&p=0',
  rarity: 'comune'
  },
  {
    id:'c10',
    name:'Cavaliere Spettrale',
    cost:7800,
    description:'Guerriero fantasma in armatura nera, legato da un giuramento infranto. Inarrestabile e silenzioso, semina terrore sul campo. Solo i più temerari possono stringere un patto con lui.',
    img:'https://tse3.mm.bing.net/th/id/OIP.ePk-a3gGFJu9CbJIepmnUAHaJj?w=474&h=474&c=7&p=0',
  rarity: 'comune'
  }
];


// Manteniamo compatibilità con il tuo inventario creature esistente:
// - chiave userStore: 'creatures' (array di nomi)
// - creatura equipaggiata: 'equippedCreature' (nome)
window.getOwnedCreatures = function () {
  return userStore.get('creatures') || [];
};
window.isCreatureOwned = function (name) {
  return window.getOwnedCreatures().includes(name);
};
window.addOwnedCreature = function (name) {
  if (!name) return; // guard

  const arr = window.getOwnedCreatures();
  if (!arr.includes(name)) {
    arr.push(name);
    userStore.set('creatures', arr);

    // Inizializza XP della nuova creatura a 0 (solo se non esiste già)
    if (typeof window.ensureCreatureXpMap === 'function') {
      window.ensureCreatureXpMap();
    }
    const map = userStore.get('creatureXp') || {};
    if (map[name] == null) { // copre undefined/null
      map[name] = 0;
      userStore.set('creatureXp', map);
    }
  }
};

window.getEquippedCreature = function () {
  return userStore.get('equippedCreature') || null;
};
window.setEquippedCreature = function (nameOrNull) {
  if (nameOrNull) {
    userStore.set('equippedCreature', nameOrNull);
  } else {
    userStore.remove('equippedCreature');
  }
};
// === XP Creature (per-utente) ===
window.ensureCreatureXpMap = function () {
  const map = userStore.get('creatureXp');
  if (!map || typeof map !== 'object') userStore.set('creatureXp', {});
};
window.getCreatureXp = function (name) {
  const map = userStore.get('creatureXp') || {};
  return Number(map?.[name]) || 0;
};
window.addCreatureXp = function (name, amount) {
  if (!name) return;
  const map = userStore.get('creatureXp') || {};
  const cur = Number(map?.[name]) || 0;
  map[name] = cur + (Number(amount) || 0);
  userStore.set('creatureXp', map);
};

// ====== ARMATURE ======
window.armorCatalog = [
  {
    id: 'a1',
    name: 'Cotta del Viandante',
    cost: 2800,
    desc: 'Armatura in cuoio rinforzato, leggera e confortevole. Ideale per lunghi viaggi e battaglie veloci. Offre protezione basilare senza sacrificare la mobilità. Perfetta per chi preferisce colpire e schivare.',
    traits: { Difesa: 6, Resistenza: 4, Agilità: 10, Peso: 5 },
  rarity: 'comune'
  },
  {
    id: 'a2',
    name: 'Corazza del Guardiano',
    cost: 3000,
    desc: 'Pettorale d’acciaio forgiato per la difesa delle mura. Resiste a colpi contundenti e fendenti. Più pesante delle armature leggere, ma garantisce ottima protezione in mischia. Consigliata ai difensori.',
    traits: { Difesa: 16, Resistenza: 10, Agilità: 4, Peso: 11 },
  rarity: 'comune'
  },
  {
    id: 'a3',
    name: 'Veste dell’Ombra',
    cost: 2500,
    desc: 'Tunica scura con inserti rinforzati. Silenziosa nei movimenti, favorisce imboscate e fughe. Protezione moderata, ma eccezionale per agilità. Prediletta da assassini e ricognitori.',
    traits: { Difesa: 3, Resistenza: 2, Agilità: 13, Peso: 3 },
  rarity: 'comune'
  },
  {
    id: 'a4',
    name: 'Bastione di Ferro',
    cost: 2700,
    desc: 'Piastre metalliche sovrapposte che formano una barriera ambulante. Riduce drasticamente i danni frontali. Ingombrante, ma quasi inespugnabile in duelli prolungati.',
    traits: { Difesa: 15, Resistenza: 10, Agilità: 4, Peso: 12 },
  rarity: 'comune'
  },
  {
    id: 'a5',
    name: 'Maglia del Cacciatore',
    cost: 2800,
    desc: 'Maglia a scaglie sottili, pensata per muoversi nei boschi. Mantiene un buon equilibrio tra difesa e libertà d’azione. Ottima contro frecce e colpi rapidi.',
    traits: { Difesa: 6, Resistenza: 5, Agilità: 9, Peso: 5 },
  rarity: 'comune'
  },
  {
    id: 'a6',
    name: 'Carapace del Titano',
    cost: 3000,
    desc: 'Lastre spesse come la roccia, forgiate nei forni dei monti. Attutisce anche gli impatti più violenti. Rallenta i movimenti, ma rende temibile chi la indossa.',
    traits: { Difesa: 15, Resistenza: 12, Agilità: 3, Peso: 15 },
  rarity: 'comune'
  },
  {
    id: 'a7',
    name: 'Veste Runica',
    cost: 2400,
    desc: 'Tessuto arcano inciso con rune di protezione. Leggera come un mantello, respinge parte dei danni magici. Molto apprezzata da maghi e incantatori.',
    traits: { Difesa: 3, Resistenza: 6, Agilità: 9, Peso: 3 },
  rarity: 'comune'
  },
  {
    id: 'a8',
    name: 'Panoplia del Paladino',
    cost: 3200,
    desc: 'Set sacro di piastre benedette. Brilla alla luce e infonde coraggio agli alleati. Difesa eccezionale, particolarmente efficace contro energie oscure.',
    traits: { Difesa: 14, Resistenza: 9, Agilità: 5, Peso: 11 },
  rarity: 'comune'
  }
];


// inventario armature = array di nomi (come magie)
window.getArmors = () => userStore.get('armors') || [];
window.setArmors = (arr) => userStore.set('armors', arr);

// possesso
window.isArmorOwned = (name) => (window.getArmors()).includes(name);
window.addArmor = (name) => {
  const arr = window.getArmors();
  if (!arr.includes(name)) {
    arr.push(name);
    window.setArmors(arr);
  }
};

// equip
window.getEquippedArmor = () => userStore.get('equippedArmor') || null;
window.setEquippedArmor = (name) => userStore.set('equippedArmor', name);
window.clearEquippedArmor = () => userStore.remove('equippedArmor');

// === Gilde (globali, condivise tra gli account sul dispositivo) ===============
function ensureGuildStores(){
  if (_sget('guilds') == null) _sset('guilds', {});
  if (_sget('guildMembers') == null) _sset('guildMembers', {});
  if (_sget('guildAutoInc') == null) _sset('guildAutoInc', 1);
}
function getGuilds(){ ensureGuildStores(); return _sget('guilds') || {}; }
function setGuilds(m){ _sset('guilds', m || {}); }
function getGuildGold(gid){
  const all = getGuilds();
  const g = all[gid];
  return Number((g && g.gold) != null ? g.gold : 0);
}
function setGuildGold(gid, amount){
  const all = getGuilds();
  if (!all[gid]) return false;
  all[gid].gold = Number(amount) || 0;
  setGuilds(all);
  return true;
}
function getGuildBuildings(gid){
  const all = getGuilds();
  const g = all[gid];
  return (g && g.buildings) ? g.buildings : {};
}
function getGuildBuildingLevel(gid, key){
  const b = getGuildBuildings(gid);
  const v = b[key];
  return Number.isFinite(v) ? v : 0;
}
function setGuildBuildingLevel(gid, key, level){
  const all = getGuilds();
  if (!all[gid]) return false;
  if (!all[gid].buildings) all[gid].buildings = {};
  all[gid].buildings[key] = Math.max(0, Math.min(5, Number(level)||0));
  setGuilds(all);
  return true;
}

function addGuildGold(gid, delta){
  return setGuildGold(gid, getGuildGold(gid) + (Number(delta)||0));
}

function getGuildMembersMap(){ ensureGuildStores(); return _sget('guildMembers') || {}; }
function setGuildMembersMap(m){ _sset('guildMembers', m || {}); }

function nextGuildId(){
  ensureGuildStores();
  const n = Number(_sget('guildAutoInc') || 1);
  _sset('guildAutoInc', n+1);
  return 'g'+n;
}

function findGuildByName(name){
  const target = String(name||'').trim().toLowerCase();
  const all = getGuilds();
  return Object.values(all).find(g => (g?.name||'').toLowerCase() === target) || null;
}
function findGuildByTag(tag){
  const target = String(tag||'').trim().toUpperCase();
  const all = getGuilds();
  return Object.values(all).find(g => (g?.tag||'').toUpperCase() === target) || null;
}

function getUserGuildId(){ return userStore.get('guildId') || null; }
function setUserGuildId(gid){ if (gid==null) userStore.remove('guildId'); else userStore.set('guildId', gid); }

function addGuildMember(gid, username, role){
  const map = getGuildMembersMap();
  const arr = map[gid] || [];
  if (!arr.find(m => m.user === username)){
    arr.push({ user: username, role: role || 'member', joinedAt: Date.now() });
    map[gid] = arr;
    setGuildMembersMap(map);
  }
}
function removeGuildMember(gid, username){
  const map = getGuildMembersMap();
  let arr = map[gid] || [];
  arr = arr.filter(m => m.user !== username);
  map[gid] = arr;
  setGuildMembersMap(map);
}
function getGuildMembers(gid){
  const map = getGuildMembersMap();
  return map[gid] || [];
}
function getGuildMemberRole(gid, username){
  const arr = getGuildMembers(gid);
  const m = arr.find(x => x.user === username);
  return m ? m.role : null;
}
function countGuildMembers(gid){ return getGuildMembers(gid).length; }

function createGuildRecord({name, tag, desc, privacy, banner, owner}){
  ensureGuildStores();
  if (findGuildByName(name)) return { ok:false, error:'Nome già esistente' };
  if (findGuildByTag(tag))  return { ok:false, error:'Tag già esistente' };

  const id = nextGuildId();
  const rec = {
    id, name: String(name).trim(),
    tag: String(tag).trim().toUpperCase(),
    desc: desc||'',
    privacy: (privacy==='invite' ? 'invite' : 'open'),
    banner: banner||{},
    owner, createdAt: Date.now(),
    limit: 60,
    gold: 0,
  buildings: {
    // Edificio "Sala delle Leggende": parte a livello 0 (non costruito)
    hall_of_legends: 0
  },  
creature_sanctum: { level: 0 },

  };
  const g = getGuilds();
  g[id] = rec; setGuilds(g);
  addGuildMember(id, owner, 'leader');
  return { ok:true, id, guild: rec };
}

// === Diplomazia Gilde (globali) ==============================================
function ensureGuildDiplomacyStore(){
  if (_sget('guildDiplomacy') == null) _sset('guildDiplomacy', {}); // { gid: { allies:[], wars:[], pendingAlliances:[{from,to,when}] } }
}
function _getDipMap(){ ensureGuildDiplomacyStore(); return _sget('guildDiplomacy') || {}; }
function _setDipMap(m){ _sset('guildDiplomacy', m || {}); }

function _getRelations(gid){
  const map = _getDipMap();
  if (!map[gid]) map[gid] = { allies: [], wars: [], pendingAlliances: [] };
  _setDipMap(map);
  return map[gid];
}
function _setRelations(gid, rel){
  const map = _getDipMap();
  map[gid] = rel || { allies: [], wars: [], pendingAlliances: [] };
  _setDipMap(map);
}

function areAllied(a,b){
  const r = _getRelations(a);
  return r.allies.includes(b);
}
function atWar(a,b){
  const r = _getRelations(a);
  return r.wars.includes(b);
}

// --- Alleanze (sempre bidirezionali) ---
function addAlliance(a,b){
  if (a===b) return;
  const ra=_getRelations(a), rb=_getRelations(b);

  if (!ra.allies.includes(b)) ra.allies.push(b);
  if (!rb.allies.includes(a)) rb.allies.push(a);

  // rimuovi eventuali pendenti tra le due gilde
  ra.pendingAlliances = ra.pendingAlliances.filter(p => !( (p.from===a&&p.to===b) || (p.from===b&&p.to===a) ));
  rb.pendingAlliances = rb.pendingAlliances.filter(p => !( (p.from===a&&p.to===b) || (p.from===b&&p.to===a) ));

  _setRelations(a, ra); 
  _setRelations(b, rb);

  // 🔎 Cronologia (entrambe le gilde)
  try {
    _addDipHist(a, { type:'ally_start', with:String(b), dir:'out' });
    _addDipHist(b, { type:'ally_start', with:String(a), dir:'in'  });
  } catch(_) {}
}

function removeAlliance(a,b){
  if (a===b) return;
  const ra=_getRelations(a), rb=_getRelations(b);

  ra.allies = ra.allies.filter(x=>x!==b);
  rb.allies = rb.allies.filter(x=>x!==a);

  _setRelations(a, ra); 
  _setRelations(b, rb);

  // 🔎 Cronologia (entrambe le gilde)
  try {
    _addDipHist(a, { type:'ally_end', with:String(b), dir:'out' });
    _addDipHist(b, { type:'ally_end', with:String(a), dir:'in'  });
  } catch(_) {}
}


// --- Guerre (sempre bidirezionali) ---
function declareWar(a, b) {
  if (a === b) return;

  // relazioni sicure
  const ra = _getRelations(a) || { wars: [] };
  const rb = _getRelations(b) || { wars: [] };
  ra.wars = Array.isArray(ra.wars) ? ra.wars : [];
  rb.wars = Array.isArray(rb.wars) ? rb.wars : [];

  // imposta stato "in guerra" in entrambi i versi (senza duplicati)
  if (!ra.wars.includes(b)) ra.wars.push(b);
  if (!rb.wars.includes(a)) rb.wars.push(a);

  _setRelations(a, ra);
  _setRelations(b, rb);

  // 📜 Cronologia (entrambe le gilde)
  try {
    _addDipHist(a, { type:'war_start', with:String(b), dir:'out' });
    _addDipHist(b, { type:'war_start', with:String(a), dir:'in'  });
  } catch (_) {}

  // 🧹 SAFETY NET: nuova guerra = progress da zero
  // Se esiste un vecchio record (anche chiuso), eliminalo per ripartire puliti.
  try {
    if (typeof _getWarsMap === 'function' &&
        typeof _warKey     === 'function' &&
        typeof _resetWarDataNow === 'function') {

      const m = _getWarsMap();
      const k = _warKey(a, b);
      const rec = m && k ? m[k] : null;

      if (rec) {
        // sempre reset: una nuova dichiarazione implica nuovo contatore
        _resetWarDataNow(a, b);
      }
    }
  } catch (_) {}

  // Notifiche UI / altre tab
  try {
    window.dispatchEvent && window.dispatchEvent(new Event('diplomacy:updated'));
    window.dispatchEvent && window.dispatchEvent(new Event('wars:updated'));
    // due scritture = due segnali cross-tab
    localStorage.setItem('mitharia_signal', 'diplomacy:' + Date.now());
    localStorage.setItem('mitharia_signal', 'wars:' + (Date.now() + 1));
  } catch (_) {}
}

// === Hook: assegna Reliquie alla gilda vincente in caso di RESA ============
(function(){
  const _origEndWar = window.endWar;
  if (typeof _origEndWar === 'function'){
    window.endWar = function(a, b){
      // a si arrende a b → b è il vincitore
      try { _origEndWar(a, b); } catch(e){}
      try { _awardWarRelicsToGuildMembers(b, a, 'surrender'); } catch(_){}
    };
  }
})();

function endWar(a, b) { 
  if (a === b) return;

  // relazioni sicure
  const ra = _getRelations(a) || { wars: [] };
  const rb = _getRelations(b) || { wars: [] };
  ra.wars = Array.isArray(ra.wars) ? ra.wars : [];
  rb.wars = Array.isArray(rb.wars) ? rb.wars : [];

  // verifica stato prima della modifica (per evitare doppioni in cronologia)
  const hadWar = ra.wars.includes(b) && rb.wars.includes(a);

  // togli lo stato "in guerra" in entrambi i versi (idempotente)
  ra.wars = ra.wars.filter(x => x !== b);
  rb.wars = rb.wars.filter(x => x !== a);

  _setRelations(a, ra);
  _setRelations(b, rb);

  // 📜 Cronologia (solo se erano davvero in guerra)
  if (hadWar) {
    try {
      _addDipHist(a, { type:'war_end', with:String(b), dir:'out' });
      _addDipHist(b, { type:'war_end', with:String(a), dir:'in'  });
    } catch (_) {}
  }

  // ▶ reset totale dell'andamento (vittorie/sconfitte, limiti giornalieri, ecc.)
  if (typeof _resetWarDataNow === 'function') _resetWarDataNow(a, b);

  // Notifiche UI / altre tab
  try {
    window.dispatchEvent && window.dispatchEvent(new Event('diplomacy:updated'));
    window.dispatchEvent && window.dispatchEvent(new Event('wars:updated'));
    // due scritture = due segnali cross-tab
    const t = Date.now();
    localStorage.setItem('mitharia_signal', 'diplomacy:' + t);
    localStorage.setItem('mitharia_signal', 'wars:' + (t + 1));
  } catch (_) {}
}


// === Cronologia Diplomazia (per gilda) =======================================
// mappa: { [gid]: [ {type:'ally_start'|'ally_end'|'war_start'|'war_end', with:'<otherGid>', dir:'out'|'in', when:<ts>} ] }
function _getDipHistMap(){ return _sget('guildDiploHistory') || {}; }
function _setDipHistMap(m){ _sset('guildDiploHistory', m || {}); }

function _addDipHist(gid, entry){
  const m = _getDipHistMap();
  if (!m[gid]) m[gid] = [];
  m[gid].push(Object.assign({ when: Date.now() }, entry));
  _setDipHistMap(m);
}

function listDiplomacyHistory(gid){
  const m = _getDipHistMap();
  const arr = (m[gid] || []).slice();
  // più recenti in alto
  arr.sort((a,b)=> Number(b.when||0) - Number(a.when||0));
  return arr;
}
window.listDiplomacyHistory = listDiplomacyHistory;

// --- Pendenze alleanza (richieste da accettare/rifiutare) ---
function addPendingAlliance(from, to){
  if (from===to) return;
  const rt = _getRelations(to);
  const exists = rt.pendingAlliances.some(p => p.from===from && p.to===to);
  if (!exists) {
    rt.pendingAlliances.push({ from, to, when: Date.now() });
    _setRelations(to, rt);
  }
}
function removePendingAlliance(from, to){
  const rt = _getRelations(to);
  rt.pendingAlliances = rt.pendingAlliances.filter(p => !(p.from===from && p.to===to));
  _setRelations(to, rt);
}

// --- Helpers elenco per UI ---
function listAllies(gid){ return _getRelations(gid).allies.slice(); }
function listWars(gid){ return _getRelations(gid).wars.slice(); }
function listPendingFor(gid){ return _getRelations(gid).pendingAlliances.slice(); }
function listPendingFrom(gid){
  // tutte le richieste che HO inviato (presenti come 'to' negli altri)
  const map = _getDipMap();
  const out = [];
  Object.entries(map).forEach(([other, rel])=>{
    rel.pendingAlliances.forEach(p=>{
      if (p.from===gid) out.push({ from: gid, to: other, when: p.when });
    });
  });
  return out;
}

// Esponi globalmente
window.ensureGuildDiplomacyStore = ensureGuildDiplomacyStore;
window.areAllied = areAllied; window.atWar = atWar;
window.addAlliance = addAlliance; window.removeAlliance = removeAlliance;
window.declareWar = declareWar; window.endWar = endWar;
window.addPendingAlliance = addPendingAlliance; window.removePendingAlliance = removePendingAlliance;
window.listAllies = listAllies; window.listWars = listWars;
window.listPendingFor = listPendingFor; window.listPendingFrom = listPendingFrom;
// === Messaggi Gilda: invio al capogilda destinatario =========================
function sendGuildMessage(toGuildId, msg){
  try{
    const guilds = (typeof getGuilds === 'function') ? getGuilds() : {};
    const leader = guilds[toGuildId]?.owner;
    if (!leader) return false;

    const payload = Object.assign({
      id: 'm' + Date.now() + '_' + Math.floor(Math.random()*1e6),
      when: Date.now(),
      unread: true
    }, msg || {});

    if (typeof deliverMessageToUser === 'function') {
      deliverMessageToUser(leader, payload);
    }

    // aggiorna eventuale badge messaggi
    if (typeof updateMessagesBadge === 'function') updateMessagesBadge();

    // notifica generica (se la usi altrove)
    try { dispatchEvent(new CustomEvent('messages_changed')); } catch(_){}

    return true;
  }catch(_){ return false; }
}
window.sendGuildMessage = sendGuildMessage;

// --- Gestione Risposte Diplomatiche (Accetta / Rifiuta Alleanza) ---
function acceptAlliance(from, to){
  // rimuove la richiesta pendente e crea l'alleanza reciproca
  removePendingAlliance(from, to);
  addAlliance(from, to);

  // messaggi automatici ai capigilda
  try {
    const guilds = getGuilds();
    const gFrom = guilds[from], gTo = guilds[to];
    const leaderFrom = gFrom?.owner, leaderTo = gTo?.owner;

    const msgAccepted = {
      id: 'm'+Date.now()+'_'+Math.floor(Math.random()*1e6),
      title: 'Richiesta di alleanza accettata',
      body: `La gilda "${gTo?.name}" [${gTo?.tag}] ha accettato la tua proposta di alleanza.`,
      type: 'guild_alliance_accept',
      when: Date.now(),
      unread: true
    };
    if (leaderFrom && typeof deliverMessageToUser==='function') deliverMessageToUser(leaderFrom, msgAccepted);

    const msgConfirm = {
      id: 'm'+Date.now()+'_'+Math.floor(Math.random()*1e6),
      title: 'Nuova alleanza',
      body: `Hai stretto un’alleanza con la gilda "${gFrom?.name}" [${gFrom?.tag}].`,
      type: 'guild_alliance_new',
      when: Date.now(),
      unread: true
    };
    if (leaderTo && typeof deliverMessageToUser==='function') deliverMessageToUser(leaderTo, msgConfirm);
  } catch(e) {}
}

function rejectAlliance(from, to){
  // solo rimuove la pendenza
  removePendingAlliance(from, to);

  try {
    const guilds = getGuilds();
    const gFrom = guilds[from], gTo = guilds[to];
    const leaderFrom = gFrom?.owner;

    const msgRejected = {
      id: 'm'+Date.now()+'_'+Math.floor(Math.random()*1e6),
      title: 'Richiesta di alleanza rifiutata',
      body: `La gilda "${gTo?.name}" [${gTo?.tag}] ha rifiutato la tua proposta di alleanza.`,
      type: 'guild_alliance_reject',
      when: Date.now(),
      unread: true
    };
    if (leaderFrom && typeof deliverMessageToUser==='function') deliverMessageToUser(leaderFrom, msgRejected);
  } catch(e) {}
}

// esporta globalmente
window.acceptAlliance = acceptAlliance;
window.rejectAlliance = rejectAlliance;

// === ARCHIVIO EROI (persistente — GLOBALE) ===
// Salviamo in una chiave globale, non in userStore.
// Così tutti gli utenti vedono la stessa lista.

function ensureHeroDirectory(){
  let list = _sget('heroDirectory_global');
  if (!Array.isArray(list)) {
    list = [];
    _sset('heroDirectory_global', list);
  }
  return list;
}
function getHeroDirectory(){ return ensureHeroDirectory(); }
function setHeroDirectory(arr){
  _sset('heroDirectory_global', Array.isArray(arr) ? arr : []);
}
window.getHeroDirectory = getHeroDirectory;
window.setHeroDirectory = setHeroDirectory;

// ============================================================
// 🛡️ SCUDO (protezione PvP) — 30 scudi da 5 ore ogni mese
// - blocca: inviare/ricevere Sfide tra eroi
// - consente: missioni, dungeon, torre
// ============================================================
const SHIELD_UNITS_PER_MONTH = 30;
const SHIELD_HOURS_PER_UNIT  = 5;
const SHIELD_MS_PER_UNIT     = SHIELD_HOURS_PER_UNIT * 60 * 60 * 1000;

function _shieldMonthKey(ts = Date.now()){
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`; // es. "2025-12"
}

function ensureShieldState(){
  try {
    if (typeof userStore === 'undefined') return;

    const nowKey = _shieldMonthKey(Date.now());
    const curKey = String(userStore.get('shieldMonthKey') || '');

    // init se mancante
    if (!curKey) {
      userStore.set('shieldMonthKey', nowKey);
      userStore.set('shieldUnitsLeft', SHIELD_UNITS_PER_MONTH);
      if (userStore.get('shieldEndAt') == null) userStore.set('shieldEndAt', 0);
      return;
    }

    // reset mensile
    if (curKey !== nowKey) {
      userStore.set('shieldMonthKey', nowKey);
      userStore.set('shieldUnitsLeft', SHIELD_UNITS_PER_MONTH);
      // NON resettiamo shieldEndAt: se uno aveva uno scudo attivo a cavallo mese,
      // resta attivo fino a scadenza (scelta più naturale e “player-friendly”).
      if (userStore.get('shieldEndAt') == null) userStore.set('shieldEndAt', 0);
    }

    // normalizza
    if (userStore.get('shieldUnitsLeft') == null) userStore.set('shieldUnitsLeft', SHIELD_UNITS_PER_MONTH);
    if (userStore.get('shieldEndAt') == null) userStore.set('shieldEndAt', 0);
  } catch(_) {}
}

function getShieldUnitsLeft(){
  ensureShieldState();
  return Math.max(0, Number(userStore.get('shieldUnitsLeft') || 0));
}

function getShieldEndAt(){
  ensureShieldState();
  return Number(userStore.get('shieldEndAt') || 0);
}

function getShieldRemainingMs(){
  const endAt = getShieldEndAt();
  return Math.max(0, endAt - Date.now());
}

function getShieldRemainingText(){
  const ms = getShieldRemainingMs();
  if (ms <= 0) return '—';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2,'0')}m`;
}

function isShieldActive(){
  return getShieldRemainingMs() > 0;
}

  function _emitShieldSignal(){
    try { window.dispatchEvent(new Event('shield:updated')); } catch(_){}
    try { localStorage.setItem('mitharia_signal', `shield:${Date.now()}`); } catch(_){}
  }

  // Attiva N scudi (durate cumulabili)
  function activateShield(units = 1){
    ensureShieldState();
    const n = Math.max(1, Math.floor(Number(units) || 1));
    const left = getShieldUnitsLeft();
    if (left < n) {
      return { ok:false, reason:'not_enough', left };
    }

    const now = Date.now();
    const curEnd = getShieldEndAt();
    const base = Math.max(now, curEnd);
    const newEnd = base + n * SHIELD_MS_PER_UNIT;

    userStore.set('shieldUnitsLeft', left - n);
    userStore.set('shieldEndAt', newEnd);

    // aggiorna directory (così gli altri vedono l’icona scudo)
    try { if (typeof upsertCurrentHeroIntoDirectory === 'function') upsertCurrentHeroIntoDirectory(); } catch(_){}

    _emitShieldSignal();
    return { ok:true, endAt:newEnd, left:left - n };
  }

  // Disattiva (le ore perse non vengono restituite)
  function deactivateShield(){
    ensureShieldState();
    userStore.set('shieldEndAt', 0);

    try { if (typeof upsertCurrentHeroIntoDirectory === 'function') upsertCurrentHeroIntoDirectory(); } catch(_){}

    _emitShieldSignal();
    return { ok:true };
  }

  // export
  window.ensureShieldState = ensureShieldState;
  window.getShieldUnitsLeft = getShieldUnitsLeft;
  window.getShieldEndAt = getShieldEndAt;
  window.getShieldRemainingMs = getShieldRemainingMs;
  window.getShieldRemainingText = getShieldRemainingText;
  window.isShieldActive = isShieldActive;
  window.activateShield = activateShield;
  window.deactivateShield = deactivateShield;

// Applica una variazione di HP ad un eroe nella heroDirectory (non tocca l'UI)
function applyHpDeltaToHeroInDirectory(heroId, delta) {
  try {
    const list = (getHeroDirectory() || []).slice();
    const idx  = list.findIndex(h => h && h.id === heroId);
    if (idx < 0) return;

    const hero = list[idx];

    let max = (hero.hpMax != null) ? Number(hero.hpMax) : 100;
if (!Number.isFinite(max) || max <= 0) max = 100;

let cur = (hero.hp != null) ? Number(hero.hp) : max;
if (!Number.isFinite(cur)) cur = max;

// Se è già a 0, qualsiasi delta negativo lo lascia a 0 (clamp già lo fa correttamente)
const newHp = Math.max(0, Math.min(max, +(cur + Number(delta || 0)).toFixed(1)));


    list[idx] = {
      ...hero,
      hpMax: max,
      hp: newHp
    };

    setHeroDirectory(list);
  } catch (e) {
    console.warn('applyHpDeltaToHeroInDirectory error', e);
  }
}

// Migrazione 1-tantum: se troviamo vecchie liste per-utente, le uniamo nella globale.
function migrateHeroDirectoriesOnce(){
  const done = _sget('heroDirMigrated');
  if (done) return;

  const merged = ensureHeroDirectory();           // globale attuale
  const byId = Object.create(null);
  merged.forEach(e => { if (e && e.id) byId[e.id] = e; });

  for (let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if (!k) continue;
    // cerca chiavi tipo: mitharia_u:<user>:heroDirectory
    if (k.startsWith(STORAGE_PREFIX + 'u:') && k.endsWith(':heroDirectory')){
      try{
        const arr = JSON.parse(localStorage.getItem(k)) || [];
        arr.forEach(e => {
          if (!e || !e.id) return;
          // unisci: prevalgono i campi più recenti
          byId[e.id] = Object.assign({}, byId[e.id] || {}, e);
        });
      }catch(_){}
    }
  }
  // riscrivi la globale ordinata (facoltativo: user first)
  const out = Object.values(byId);
  _sset('heroDirectory_global', out);
  _sset('heroDirMigrated', true);
}
window.migrateHeroDirectoriesOnce = migrateHeroDirectoriesOnce;


// Messaggi a un altro utente (casella per-utente in localStorage)
function deliverMessageToUser(username, msg){
  const prefix = (typeof STORAGE_PREFIX==='string') ? STORAGE_PREFIX : 'mitharia_';
  const k = prefix + 'u:' + username + ':messages';
  try {
    const raw = localStorage.getItem(k);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(msg);
    localStorage.setItem(k, JSON.stringify(arr));

    // NEW: evento custom nella stessa scheda (se il destinatario è la persona su questo device)
    try {
      if (typeof currentUser === 'string' && currentUser && currentUser === username) {
        window.dispatchEvent(new Event('myth:messages-changed'));
      }
    } catch(e){}
  } catch(e) {
    // no-op
  }

  // Rimane anche questo fallback “sicuro”
  try{
    if (typeof currentUser === 'string' && currentUser && currentUser === username){
      if (typeof window.updateMessagesBadge === 'function') window.updateMessagesBadge();
    }
  }catch(e){}
}
// === PvP: Log sfide tra giocatori (per utente) =============================
// Chiave per-utente: "u:<username>:pvp_log"
(function(){
  const PFX = (typeof STORAGE_PREFIX === 'string') ? STORAGE_PREFIX : 'mitharia_';

  function keyFor(user){ return PFX + 'u:' + String(user) + ':pvp_log'; }
  function safeArr(v){ try { return Array.isArray(v) ? v : []; } catch(_) { return []; } }

  // Aggiunge un record nello storico dell'utente indicato (cap a 100)
  function appendPvpLogFor(username, entry){
    try{
      const k = keyFor(username);
      const cur = safeArr(JSON.parse(localStorage.getItem(k) || '[]'));
      cur.unshift(entry);
      if (cur.length > 100) cur.length = 100;
      localStorage.setItem(k, JSON.stringify(cur));
      // evento UI (opzionale) se serve un refresh live
      window.dispatchEvent(new CustomEvent('pvp_log_changed', { detail: { user: username }}));
    }catch(e){}
  }

  // Legge lo storico per un utente
  function getPvpLogFor(username){
    try{
      const k = keyFor(username);
      return safeArr(JSON.parse(localStorage.getItem(k) || '[]'));
    }catch(e){ return []; }
  }

  // Convenienze per l’utente loggato
  function getMyPvpLog(){
    const u = (typeof _cu === 'function') ? _cu() : (typeof currentUser === 'string' ? currentUser : null);
    if (!u) return [];
    return getPvpLogFor(u);
  }

  // Export
  window.appendPvpLogFor = appendPvpLogFor;
  window.getPvpLogFor    = getPvpLogFor;
  window.getMyPvpLog     = getMyPvpLog;
})();

// === WAR META (statistiche e limiti) =========================================
// Chiave canonica per la coppia di gilde (ordine stabile a__b)
function _warKey(a, b){
  const [x, y] = [String(a), String(b)].sort();
  return x + '__' + y;
}
// yyyy-mm-dd locale (per reset giornaliero)
function _todayKey(){
  const d = new Date();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}
// 🔁 ORA GLOBALE (visibile a tutti gli utenti della stessa origine)
const GLOBAL_WARS_KEY = 'global:guildWarsData';
function _getWarsMap(){ return _sget(GLOBAL_WARS_KEY) || {}; }
function _setWarsMap(m){ _sset(GLOBAL_WARS_KEY, m || {}); }

// 💣 Azzera TUTTI i dati di andamento guerra per una coppia di gilde
function _resetWarDataNow(a, b){
  try{
    const m = _getWarsMap();
    const k = _warKey(a, b);
    if (m && m[k]) {
      delete m[k];           // rimuove proprio il record (wins/losses/limiti ecc.)
      _setWarsMap(m);
      // notifica UI e altre tab
      window.dispatchEvent?.(new Event('wars:updated'));
      localStorage.setItem('mitharia_signal', 'wars:'+Date.now());
    }
  }catch(_){}
}

// Migrazione: porta i dati per-utente nel registro globale una volta
(function migrateGuildWarsToGlobal(){
  try{
    const perUser = userStore.get('guildWarsData');
    if (perUser && typeof perUser === 'object' && Object.keys(perUser).length){
      const globalMap = _sget(GLOBAL_WARS_KEY) || {};
      // merge "safe": i record nuovi sovrascrivono eventuali vecchi
      Object.assign(globalMap, perUser);
      _sset(GLOBAL_WARS_KEY, globalMap);
      userStore.remove('guildWarsData');
    }
  }catch(_){}
})();

function getWarData(gidA, gidB){
  const m = _getWarsMap();
  return m[_warKey(gidA, gidB)] || null;
}
function ensureWarData(gidA, gidB){
  const m = _getWarsMap();
  const k = _warKey(gidA, gidB);

  if (!m[k]) {
    m[k] = {
      a: String(gidA),
      b: String(gidB),
      startedAt: Date.now(),
      endedAt: null,
      endedReason: null,
      winner: null,
      // daily: per giorno → bySide (legacy) + byHero (nuovo per limite per-eroe)
      daily: { date: _todayKey(), bySide: {}, byHero: {} }, // { bySide: { [gid]: { initiated } }, byHero: { [user]: { initiated } } }
      totalInitiated: {},        // cumulativo: sfide iniziate per lato (gilda)
      initiatedWins: {},         // vittorie come INIZIATORE per lato (gilda)
      initiatedLosses: {},       // sconfitte come INIZIATORE per lato (gilda)
      wins: {},                  // totali: vittorie per lato (gilda)
      losses: {}                 // totali: sconfitte per lato (gilda)
    };
    _setWarsMap(m);
    return m[k];
  }

  // Backfill per record già esistenti (aggiunge i nuovi campi se mancanti)
  const rec = m[k];
  if (!rec.daily)                 rec.daily = { date: _todayKey(), bySide: {}, byHero: {} };
  if (!rec.daily.bySide)          rec.daily.bySide = {};
  if (!rec.daily.byHero)          rec.daily.byHero = {}; // ← nuovo per limite per-eroe
  if (!rec.totalInitiated)        rec.totalInitiated = {};
  if (!rec.initiatedWins)         rec.initiatedWins = {};
  if (!rec.initiatedLosses)       rec.initiatedLosses = {};
  if (!rec.wins)                  rec.wins = {};
  if (!rec.losses)                rec.losses = {};

  _setWarsMap(m);
  return rec;
}

function _resetWarDailyIfNeeded(rec){
  const today = _todayKey();
  if (!rec.daily || rec.daily.date !== today){
    rec.daily = { date: today, bySide: {}, byHero: {} };
  } else {
    // garantisce che i campi esistano anche su record vecchi
    rec.daily.bySide = rec.daily.bySide || {};
    rec.daily.byHero = rec.daily.byHero || {};
  }
}
// Limite giornaliero per guerra: 5 sfide PER EROE (attaccante)
function canInitiateWarChallenge(myGid, otherGid, attackerUser){
  const rec = ensureWarData(myGid, otherGid);

  // Guerra conclusa? Niente nuove sfide.
  if (rec.endedAt) return false;

  _resetWarDailyIfNeeded(rec);

  // Limite 5 al giorno PER EROE (attaccante)
  const heroKey = String(attackerUser || '');
  const curForHero = Number(rec.daily?.byHero?.[heroKey]?.initiated || 0);
  return curForHero < 5;
}

function addWarInitiated(myGid, otherGid, attackerUser){
  const m = _getWarsMap();
  const k = _warKey(myGid, otherGid);
  const rec = ensureWarData(myGid, otherGid);

  // Guerra conclusa? non registrare più nulla.
  if (rec.endedAt) return;

  _resetWarDailyIfNeeded(rec);

  // Backfill contenitori (per sicurezza su record legacy)
  rec.daily            = rec.daily            || { date: _todayKey(), bySide: {}, byHero: {} };
  rec.daily.bySide     = rec.daily.bySide     || {};
  rec.daily.byHero     = rec.daily.byHero     || {};
  rec.totalInitiated   = rec.totalInitiated   || {};

  // Giornaliero: lato gilda (resta per statistiche "fatte oggi")
  rec.daily.bySide[myGid] = rec.daily.bySide[myGid] || { initiated: 0 };
  rec.daily.bySide[myGid].initiated++;

  // Giornaliero: PER EROE (limite effettivo 5/dì per attaccante)
  const heroKey = String(attackerUser || '');
  rec.daily.byHero[heroKey] = rec.daily.byHero[heroKey] || { initiated: 0 };
  rec.daily.byHero[heroKey].initiated++;

  // Cumulativo storico per lato (gilda)
  rec.totalInitiated[myGid] = (rec.totalInitiated[myGid] || 0) + 1;

  m[k] = rec;
  _setWarsMap(m);
}


function recordWarResult(gidA, gidB, winnerGid, initiatorGid){
  const m = _getWarsMap();
  const k = _warKey(gidA, gidB);
  const rec = ensureWarData(gidA, gidB);

  // Guerra già conclusa? Non incrementare più nulla.
  if (rec.endedAt) {
    return Number(rec.wins?.[String(winnerGid)] || 0);
  }

  // Normalizza chiavi e backfill contenitori
  const winner = String(winnerGid);
  const loser  = (winner === String(rec.a)) ? String(rec.b) : String(rec.a);
  rec.wins   = rec.wins   || {};
  rec.losses = rec.losses || {};

  // Totali generali per gilda
  rec.wins[winner] = (rec.wins[winner] || 0) + 1;
  rec.losses[loser] = (rec.losses[loser] || 0) + 1;

  // Parziali "da iniziatore" (se noto)
  if (initiatorGid){
    const init = String(initiatorGid);
    rec.initiatedWins   = rec.initiatedWins   || {};
    rec.initiatedLosses = rec.initiatedLosses || {};
    if (winner === init) rec.initiatedWins[init]   = (rec.initiatedWins[init]   || 0) + 1;
    else                 rec.initiatedLosses[init] = (rec.initiatedLosses[init] || 0) + 1;
  }

  m[k] = rec;
  _setWarsMap(m);
  return Number(rec.wins[winner] || 0);  // totale vittorie della gilda vincitrice
}

function totalWinsForSide(gidA, gidB, sideGid){
  const rec = getWarData(gidA, gidB);
  return Number(rec?.wins?.[String(sideGid)] || 0);
}

// Conclusione guerra per Vittoria (2000)
function endWarByVictory(winnerGid, loserGid){
  // 1) marca meta (facoltativo: verrà cancellato subito dopo il reset)
  const m = _getWarsMap();
  const k = _warKey(winnerGid, loserGid);
  const rec = ensureWarData(winnerGid, loserGid);
  rec.endedAt = Date.now();
  rec.endedReason = 'victory';
  rec.winner = String(winnerGid);
  m[k] = rec;
  _setWarsMap(m);

  // 2) chiusura guerra (rimuove stato in ENTRAMBI i versi, logga cronologia e spara eventi UI)
  if (typeof endWar === 'function') {
    try { endWar(winnerGid, loserGid); } catch(_) {}
    // ⚠️ non richiamare anche endWar(loser, winner): endWar già gestisce entrambi i versi
  }

  // 3) messaggi ai capogilda
  try {
    const g = (typeof getGuilds==='function') ? (getGuilds()||{}) : {};
    const wName = g?.[winnerGid]?.name || 'la tua gilda';
    const wTag  = g?.[winnerGid]?.tag  || '';
    const lName = g?.[loserGid ]?.name || 'la gilda avversaria';
    const lTag  = g?.[loserGid ]?.tag  || '';

    const winnerLeader = g?.[winnerGid]?.owner || null;
    const loserLeader  = g?.[loserGid ]?.owner || null;

    if (winnerLeader && typeof deliverMessageToUser==='function'){
      deliverMessageToUser(winnerLeader, {
        id:'m'+Date.now()+'_'+Math.floor(Math.random()*1e6),
        type:'guild_war_victory',
        title:'🏆 Vittoria di Gilda!',
        body:`La guerra contro <strong>${lName}</strong>${lTag?` [${lTag}]`:''} è vinta! I tuoi campioni hanno raggiunto <strong>2000</strong> sfide vinte. Gli stendardi tornano al vento: Mitharia ricorderà questo giorno.`,
        when:Date.now(), unread:true
      });
    }
    if (loserLeader && typeof deliverMessageToUser==='function'){
      deliverMessageToUser(loserLeader, {
        id:'m'+Date.now()+'_'+Math.floor(Math.random()*1e6),
        type:'guild_war_defeat',
        title:'⚑ Sconfitta di Gilda',
        body:`La guerra contro <strong>${wName}</strong>${wTag?` [${wTag}]`:''} è perduta: i loro eroi hanno raggiunto <strong>2000</strong> vittorie. Si chiudono gli arsenali e si curano le ferite: domani torneremo più forti.`,
        when:Date.now(), unread:true
      });
    }
  } catch(_) {}

// 3.bis) Premio: Reliquie di guerra (2000 sfide → Vittoria finale!)
_awardWarRelicsToGuildMembers(winnerGid, loserGid, 'victory');

  // 4) (opzionale) segnali extra: endWar li ha già emessi; qui non servono per evitare duplicati

  // 5) safety: reset totale dell'andamento guerra (endWar già lo fa; chiamata idempotente)
  try {
    if (typeof _resetWarDataNow === 'function') _resetWarDataNow(winnerGid, loserGid);
  } catch(_) {}
}

// Espone le funzioni (se ti serve altrove)
window.getWarData = window.getWarData || getWarData;
window.totalWinsForSide = window.totalWinsForSide || totalWinsForSide;
window.canInitiateWarChallenge = window.canInitiateWarChallenge || canInitiateWarChallenge;
window.addWarInitiated = window.addWarInitiated || addWarInitiated;
window.recordWarResult = window.recordWarResult || recordWarResult;
window.endWarByVictory = window.endWarByVictory || endWarByVictory;

function _awardWarRelicsToGuildMembers(winnerGid, loserGid, kind){
  try{
    const arr = (typeof getGuildMembers==='function') ? getGuildMembers(winnerGid) : [];
    arr.forEach(m => {
      const username = m && m.user;
      if (username) addWarRelicToUser(username, winnerGid, loserGid, kind);
    });
  } catch(_){}
}

// === WAR PVP LIMIT (stesso eroe 1 volta/giorno durante una guerra) ===========
function _warPvpKey(attacker, defender){
  const x = String(attacker);
  const y = String(defender);
  return 'warPvp:'+_todayKey()+':'+x+'->'+y;
}
function getWarPvpCount(aUser, bUser){
  return Number(userStore.get(_warPvpKey(aUser, bUser)) || 0);
}
function incWarPvpCount(aUser, bUser){
  const k = _warPvpKey(aUser, bUser);
  const cur = Number(userStore.get(k) || 0);
  userStore.set(k, cur + 1);
}
window.getWarPvpCount = window.getWarPvpCount || getWarPvpCount;
window.incWarPvpCount = window.incWarPvpCount || incWarPvpCount;


// --- SHOP GILDA: helper cooldown articoli fissi (centralizzati) ---
(function(){
  const DAY_MS = 24*60*60*1000;

  function getGuildShopCooldown(key){
    const map = {
      key_mercante:     4*DAY_MS,
      key_avventuriero: 7*DAY_MS,
      key_re:          12*DAY_MS,
      key_arcana:      18*DAY_MS,
      dust20:           3*DAY_MS
    };
    return map[key] || 0;
  }
  function getGuildShopLastPurchase(key){
    return Number(userStore.get('gs_last_'+key) || 0);
  }
  function setGuildShopLastPurchase(key){
    userStore.set('gs_last_'+key, Date.now());
  }
  function getGuildShopRemaining(key){
    const last = getGuildShopLastPurchase(key);
    const cd = getGuildShopCooldown(key);
    const rem = (last + cd) - Date.now();
    return rem > 0 ? rem : 0;
  }
  window.getGuildShopCooldown = getGuildShopCooldown;
  window.getGuildShopLastPurchase = getGuildShopLastPurchase;
  window.setGuildShopLastPurchase = setGuildShopLastPurchase;
  window.getGuildShopRemaining = getGuildShopRemaining;
})();

// --- SHOP GILDA: offerta segreta settimanale (centralizzata per-utente) ---
(function(){
  const DAY_MS = 24*60*60*1000;

  // Lunedì 00:00 locale della settimana di d
  function startOfIsoWeek(d){
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (date.getDay() + 6) % 7; // 0=lunedì
    date.setDate(date.getDate() - day);
    date.setHours(0,0,0,0);
    return date.getTime();
  }
  // ISO week key: YYYY-Www (locale)
  function isoWeekKey(d){
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Giovedì della settimana ISO
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(),0,4);
    const week = 1 + Math.round(((date.getTime() - week1.getTime())/DAY_MS - 3 + ((week1.getDay()+6)%7))/7);
    const y = date.getFullYear();
    return `${y}-W${String(week).padStart(2,'0')}`;
  }

  const RARITIES = ['rara','epica','leggendaria','mitica'];
const PRICE = { rara:60000, epica:100000, leggendaria:180000, mitica:250000 };


  function genSecretItem(){
  const pluralCats = ['weapons','armors','magics','creatures'];
  const catMap = { weapons:'weapon', armors:'armor', magics:'magic', creatures:'creature' };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  for (let tries = 0; tries < 20; tries++) {
    const catKey = pick(pluralCats);

    if (typeof getAllDefs !== 'function') {
      throw new Error('genSecretItem: getAllDefs non disponibile');
    }

    const all = getAllDefs(catKey) || [];
    // solo equipaggiamento non comune
    const pool = all.filter(it => RARITIES.includes(String(it.rarity || '').toLowerCase()));
    if (!pool.length) continue;

    const it = pick(pool);
    const rarity = String(it.rarity).toLowerCase();
    const category = catMap[catKey];
    const name = it.name; // usa il nome così come definito nel catalogo
    const price = PRICE[rarity] ?? PRICE.rara; // costo forzato alla tabella richiesta

    return { category, rarity, name, price };
  }

  // Se non troviamo nulla, falliamo esplicitamente (meglio di creare un oggetto "fantasma")
  throw new Error('genSecretItem: nessun item non comune disponibile nei cataloghi');
}


  // Crea/aggiorna l'offerta della settimana corrente se mancante o di vecchia settimana
  function ensureGuildSpecialForCurrentWeek(){
    const now = new Date();
    const wk  = isoWeekKey(now);
    let state = userStore.get('gs_special') || null;

    if (!state || state.weekKey !== wk){
      const weekStart = startOfIsoWeek(now);
      const dayOffset = Math.floor(Math.random()*7); // giorno casuale della settimana (lun..dom)
      const starts = weekStart + dayOffset*DAY_MS;   // mezzanotte locale
      const expires = starts + DAY_MS;               // 24h

      state = {
        weekKey: wk,
        starts, expires,
        seen: false,
        bought: false,
        item: genSecretItem()
      };
      userStore.set('gs_special', state);
    }
    return state;
  }

  function getGuildSpecial(){ return userStore.get('gs_special') || null; }
  function isGuildSpecialActiveNow(){
    const s = userStore.get('gs_special'); if (!s) return false;
    const t = Date.now();
    return t >= s.starts && t < s.expires;
  }
  function setGuildSpecialSeen(){ const s=getGuildSpecial(); if (!s) return; s.seen = true; userStore.set('gs_special', s); }
  function setGuildSpecialBought(){ const s=getGuildSpecial(); if (!s) return; s.bought = true; userStore.set('gs_special', s); }

  // Espone in globale
  window.ensureGuildSpecialForCurrentWeek = ensureGuildSpecialForCurrentWeek;
  window.getGuildSpecial = getGuildSpecial;
  window.isGuildSpecialActiveNow = isGuildSpecialActiveNow;
  window.setGuildSpecialSeen = setGuildSpecialSeen;
  window.setGuildSpecialBought = setGuildSpecialBought;
})();
// --- SHOP GILDA: Bonus personali (durate cumulabili) ---
(function(){
  const DAY_MS = 24*60*60*1000;

  const KEYS = {
    heroXp: 'gs_pbonus_hero_xp_until',
    gold: 'gs_pbonus_gold_until',
    creatureXp: 'gs_pbonus_creature_xp_until'
  };

  function _now(){ return Date.now(); }
  function _getUntil(k){ return Number(userStore.get(k) || 0); }
  function _setUntil(k,ts){ userStore.set(k, Number(ts)||0); }

  // Estende la durata: se già attivo, aggiunge; altrimenti parte da ora
  function extendPersonalBonus(type, durationMs){
    const key = KEYS[type]; if (!key) return;
    const current = _getUntil(key);
    const base = (current && current > _now()) ? current : _now();
    _setUntil(key, base + Math.max(0, Number(durationMs)||0));
  }

  // Lettori "until"
  function getPersonalBonusUntil(type){
    const key = KEYS[type]; if (!key) return 0;
    return _getUntil(key);
  }

  // Fattori / bonus attivi
  function getPersonalHeroXpBonusFactor(){
    const until = _getUntil(KEYS.heroXp);
    return (until > _now()) ? 1.10 : 1.0;
  }
  function getPersonalGoldBonusFactor(){
    const until = _getUntil(KEYS.gold);
    return (until > _now()) ? 1.10 : 1.0;
  }
  function getPersonalCreatureXpBonusFlat(){
    const until = _getUntil(KEYS.creatureXp);
    return (until > _now()) ? 1 : 0;
  }

  function hasAnyPersonalBonusActive(){
    return (
      _getUntil(KEYS.heroXp) > _now() ||
      _getUntil(KEYS.gold) > _now() ||
      _getUntil(KEYS.creatureXp) > _now()
    );
  }

  function listPersonalBonusesActive(){
    const out = [];
    const now = _now();
    const push = (label, until)=>{ if (until > now) out.push({ label, until }); };
    push('Bonus XP eroe +10%', _getUntil(KEYS.heroXp));
    push('Bonus oro +10%', _getUntil(KEYS.gold));
    push('Bonus XP creatura +1', _getUntil(KEYS.creatureXp));
    return out;
  }

  // Espone in globale
  window.extendPersonalBonus = extendPersonalBonus;
  window.getPersonalBonusUntil = getPersonalBonusUntil;
  window.getPersonalHeroXpBonusFactor = getPersonalHeroXpBonusFactor;
  window.getPersonalGoldBonusFactor = getPersonalGoldBonusFactor;
  window.getPersonalCreatureXpBonusFlat = getPersonalCreatureXpBonusFlat;
  window.hasAnyPersonalBonusActive = hasAnyPersonalBonusActive;
  window.listPersonalBonusesActive = listPersonalBonusesActive;
})();

// === RELIQUIE DI GUERRA (per-utente) =========================================
// Struttura: array di { id, kind:'surrender'|'victory', when, winnerGid, loserGid, textHtml }
function _ensureWarRelicStore(username){
  const list = _getUserKey(username, 'war_relics', []);
  if (!Array.isArray(list)) return [];
  return list;
}
function _setWarRelicStore(username, list){
  try{
    const k = (typeof STORAGE_PREFIX==='string'?STORAGE_PREFIX:'mitharia_') + 'u:' + username + ':war_relics';
    localStorage.setItem(k, JSON.stringify(list||[]));
  }catch(e){}
}
// Pubblicata sul profilo: 0 o 1 reliquia (salvo l'oggetto intero)
function _getPublishedWarRelic(username){
  return _getUserKey(username, 'war_relic_published', null);
}
function _setPublishedWarRelic(username, obj){
  try{
    const k = (typeof STORAGE_PREFIX==='string'?STORAGE_PREFIX:'mitharia_') + 'u:' + username + ':war_relic_published';
    localStorage.setItem(k, JSON.stringify(obj||null));
  }catch(e){}
}

// Helpers nomi gilda
function _guildNameTag(gid){
  try{
    const g = (typeof getGuilds==='function') ? (getGuilds()||{}) : {};
    const rec = g?.[gid];
    if (!rec) return `Gilda ${gid}`;
    return `${rec.name || ('Gilda '+gid)}${rec.tag ? ` [${rec.tag}]` : ''}`;
  }catch(_){ return `Gilda ${gid}`; }
}

	// Helpers nomi/tag gilda
function _guildTagOnly(gid){
  try{
    const g = (typeof getGuilds==='function') ? (getGuilds()||{}) : {};
    const rec = g?.[gid];
    const tag = rec?.tag ? `[${rec.tag}]` : `[${gid}]`;
    return tag;
  }catch(_){ return `[${gid}]`; }
}

// Testo formattato secondo specifica (solo TAG in grassetto)
function _makeWarRelicTextHtml(winnerGid, loserGid, kind){
  const w = _guildTagOnly(winnerGid);
  const l = _guildTagOnly(loserGid);
  const kindTxt = (kind==='surrender') ? '<strong>Resa nemica!</strong>' : '<strong>Vittoria finale!</strong>';
  // “Vincitore come [TAG] …”
  return `Vincitore come <strong>${w}</strong> nella guerra: <strong>${w}</strong> VS <strong>${l}</strong> per ${kindTxt}`;
}

// Aggiunge una reliquia ad un utente
function addWarRelicToUser(username, winnerGid, loserGid, kind){
  const list = _ensureWarRelicStore(username).slice();
  const id = 'wr_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
  const obj = {
    id, kind,
    when: Date.now(),
    winnerGid: String(winnerGid),
    loserGid: String(loserGid),
    textHtml: _makeWarRelicTextHtml(winnerGid, loserGid, kind)
  };
  list.push(obj);
  _setWarRelicStore(username, list);
  // opzionale: badge/refresh profilo altrove
  return obj;
}

// Leggi lista / pubblica / rimuovi
function listWarRelicsForUser(username){ return _ensureWarRelicStore(username).slice().sort((a,b)=>Number(b.when)-Number(a.when)); }
function getPublishedWarRelicForUser(username){ return _getPublishedWarRelic(username); }
function publishWarRelicForUser(username, relicId){
  const list = _ensureWarRelicStore(username);
  const found = list.find(r => r.id===relicId);
  if (!found) return false;
  _setPublishedWarRelic(username, found);
  return true;
}
function clearPublishedWarRelicForUser(username){
  _setPublishedWarRelic(username, null);
}

// Espone globalmente per l’HTML
window.listWarRelicsForUser = window.listWarRelicsForUser || listWarRelicsForUser;
window.getPublishedWarRelicForUser = window.getPublishedWarRelicForUser || getPublishedWarRelicForUser;
window.publishWarRelicForUser = window.publishWarRelicForUser || publishWarRelicForUser;
window.clearPublishedWarRelicForUser = window.clearPublishedWarRelicForUser || clearPublishedWarRelicForUser;

// ===== MESSAGGIO COLLETTIVO GILDA (usa la messaggistica esistente) =====
function sendGuildBroadcast(gid, fromUser, text){
  if (!gid || !fromUser || !text) return false;
  const members = (typeof getGuildMembers==='function') ? (getGuildMembers(gid)||[]) : [];
  const when = Date.now();
  const title = `Messaggio Collettivo — da ${fromUser}`;

  members.forEach(m=>{
    const u = m && m.user;
    if (!u) return;
    const msg = {
      id: 'm'+when+'_'+Math.floor(Math.random()*1e6),
      type: 'guild_broadcast',     // nuovo tipo: niente prefisso "Da:" (vedi patch 3)
      title,
      body: String(text),
      from: String(fromUser),
      to: String(u),
      when,
      unread: true,
      archived: false
    };
    // CONSEGNA nella inbox del destinatario (funzione che hai già)
    if (typeof deliverMessageToUser === 'function') deliverMessageToUser(u, msg);
  });

  try{ window.dispatchEvent(new CustomEvent('guild:broadcast:sent', {detail:{gid, from:fromUser}})); }catch(_){}
  return true;
}
// Esponi (se serve) in window
window.sendGuildBroadcast = window.sendGuildBroadcast || sendGuildBroadcast;



// Export in window
window.ensureGuildStores = ensureGuildStores;
window.getGuilds = getGuilds;
window.setGuilds = setGuilds;
window.findGuildByName = findGuildByName;
window.findGuildByTag  = findGuildByTag;
window.createGuildRecord = createGuildRecord;
window.getGuildMembers = getGuildMembers;
window.getGuildMemberRole = getGuildMemberRole;
window.countGuildMembers = countGuildMembers;
window.addGuildMember = addGuildMember;
window.removeGuildMember = removeGuildMember;
window.getUserGuildId = getUserGuildId;
window.setUserGuildId = setUserGuildId;
window.deliverMessageToUser = deliverMessageToUser;
window.getGuildGold = getGuildGold;
window.setGuildGold = setGuildGold;
window.addGuildGold = addGuildGold;
window.getGuildBuildings = getGuildBuildings;
window.getGuildBuildingLevel = getGuildBuildingLevel;
window.setGuildBuildingLevel = setGuildBuildingLevel;
// === Avatar helpers (proxy alle funzioni in pagina) ===
window.getAvatarConfig = window.getAvatarConfig || function(){
  try { return userStore.get('avatarConfig') || null; } catch(_) { return null; }
};
window.setAvatarConfig = window.setAvatarConfig || function(cfg){
  try { if (cfg && typeof cfg==='object') userStore.set('avatarConfig', cfg); } catch(_){}
  try { userStore.set('avatarThumb', null); } catch(_){}
};
window.getAvatarThumb = function(){
  try { return userStore.get('avatarThumb') || null; } catch(_) { return null; }
};


