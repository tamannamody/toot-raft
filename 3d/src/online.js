/* =========================================================
   Play with friends
   One player hosts and shares a link; up to three friends open it and join the same raft.
   Each player toots only their own pigs. The host's game runs the river and sends the raft
   to everyone 30 times a second; friends send their toots to the host.
   Browsers talk to each other directly (WebRTC through PeerJS). The free PeerJS server is
   used only to introduce them. Solo play never touches the network.
   ========================================================= */
const ROOM_PREFIX = 'tootraft-';
const MAX_PLAYERS = 4;
const SNAP_EVERY = 1 / 30;
const TIMEOUT_MS = 10000;
const SOUND_EVENTS = ['toot', 'squeak', 'rocket', 'mega', 'hurt', 'pop', 'bump', 'bean', 'win'];
const Net = {
  mode: 'solo',     // solo | host | guest
  peer: null,
  conns: [],        // host: friends' connections, in join order (friend k is player k)
  host: null,       // guest: the connection to the host
  joined: false,
  me: 0, n: 1,      // my player number, players on the raft
  names: [],        // player names, by player number
  code: '', out: [], snapAcc: 0, lastSeen: 0,
  status: '', err: '',
};

const online = () => Net.mode !== 'solo';
const owner = i => i % Net.n;
const mine = i => !online() || owner(i) === Net.me;
// The host records what happens so friends can replay the same sounds, clouds and jokes.
function emit(...a) { if (Net.mode === 'host') Net.out.push(a); }
function sfx(name, arg) { Sound[name](arg); emit('s', name, arg); }

function cleanName(v) { return String(v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); }
function myName() { return cleanName(save.name); }
function roomCode() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
// On stratos.games the game sits in a frame on the play page, so the link points at that page.
function topLoc() { try { if (window.top.location.href) return window.top.location; } catch (e) {} return location; }
function roomFromUrl() {
  const m = /[?&]room=([a-z0-9]{4,12})/i.exec(topLoc().search) || /[?&]room=([a-z0-9]{4,12})/i.exec(location.search);
  return m ? m[1].toLowerCase() : '';
}
function shareUrl() { return topLoc().href.split(/[?#]/)[0] + '?room=' + Net.code; }
function clearRoomFromUrl() {
  for (const w of [window, window.top]) {
    try { if (/[?&]room=/.test(w.location.search)) w.history.replaceState(null, '', w.location.pathname + w.location.hash); } catch (e) {}
  }
}
function makePeer(id) {
  const P = window.PeerLib && window.PeerLib.Peer;
  if (!P) throw new Error('PeerJS missing');
  return id ? new P(id, { debug: 0 }) : new P({ debug: 0 });
}
function safeSend(c, m) { try { if (c && c.open) c.send(m); } catch (e) {} }
function broadcast(m) { Net.conns.forEach(c => safeSend(c, m)); }
function netSend(m) { safeSend(Net.host, m); }

function netReset() {
  if (Net.mode === 'host') broadcast({ k: 'bye' });
  const peer = Net.peer;
  Net.peer = null; Net.host = null; Net.conns = []; Net.joined = false;
  Net.mode = 'solo'; Net.me = 0; Net.n = 1; Net.names = []; Net.out = []; Net.snapAcc = 0; Net.err = ''; Net.status = '';
  if (peer) setTimeout(() => { try { peer.destroy(); } catch (e) {} }, 150);   // let the goodbye go out first
  padOwners();
}
let retryCode = '';   // a friend whose join failed can try the same link again
function netFail(msg) {
  retryCode = Net.mode === 'guest' ? Net.code : '';
  netReset();
  Net.err = msg;
  setState('lobby');
}
function leaveRoom() {
  netReset();
  clearRoomFromUrl();
  setState('menu');
}

/* ---------- Hosting ---------- */
function hostRoom() {
  netReset();
  Net.mode = 'host'; Net.code = roomCode();
  Net.status = 'Making your raft...';
  setState('lobby');
  let peer;
  try { peer = makePeer(ROOM_PREFIX + Net.code); } catch (e) { return netFail('Online play does not work in this browser.'); }
  Net.peer = peer;
  peer.on('open', () => {
    if (Net.peer !== peer) return;
    Net.status = 'Send this link to up to 3 friends. Everyone gets their own pigs.';
    lobbyRender();
    track('online_host');
  });
  peer.on('connection', c => hostAccept(c));
  peer.on('disconnected', () => { if (Net.peer === peer && !peer.destroyed) peer.reconnect(); });
  peer.on('error', e => {
    if (Net.peer !== peer) return;
    if (e.type === 'unavailable-id') return hostRoom();          // that room code is taken: try another
    if (!peer.open) netFail('Could not reach the online server. Check your internet and try again.');
  });
}
function hostAccept(c) {
  c.on('open', () => {
    if (Net.mode !== 'host') return c.close();
    if (Net.conns.length >= MAX_PLAYERS - 1) { safeSend(c, { k: 'full' }); setTimeout(() => c.close(), 500); return; }
    c.seen = performance.now();
    c.name = cleanName(c.metadata && c.metadata.name);
    Net.conns.push(c);
    rosterChanged(1, c.name);
    // a river is already going: bring them straight onto the raft
    if (G.state === 'playing' || G.state === 'paused') {
      safeSend(c, startMsg());
      if (G.state === 'paused') safeSend(c, { k: 'state', s: 'paused' });
    }
  });
  c.on('data', d => hostData(c, d));
  c.on('close', () => dropGuest(c));
  c.on('error', () => dropGuest(c));
}
function dropGuest(c) {
  const j = Net.conns.indexOf(c);
  if (j < 0) return;
  Net.conns.splice(j, 1);
  try { c.close(); } catch (e) {}
  rosterChanged(-1, c.name);
}
function rosterChanged(delta, who) {
  Net.n = 1 + Net.conns.length;
  Net.names = [myName()].concat(Net.conns.map(c => c.name || ''));
  Net.conns.forEach((c, j) => safeSend(c, { k: 'roster', you: j + 1, n: Net.n, names: Net.names }));
  padOwners();
  lobbyRender();
  if (delta && G.state === 'playing') flash((who || 'A friend').toUpperCase() + (delta > 0 ? ' HOPPED ON!' : ' HOPPED OFF'));
}
function hostData(c, d) {
  c.seen = performance.now();
  const p = Net.conns.indexOf(c) + 1;
  if (p < 1 || !d || typeof d !== 'object') return;
  if (d.k === 'toot') { const i = d.i | 0; if (i >= 0 && i < 4 && owner(i) === p) toot(i); }
  else if (d.k === 'dir') { if (isFinite(d.x) && isFinite(d.y)) autoToot(+d.x, +d.y, p); }
  else if (d.k === 'pause') pauseGame();
  else if (d.k === 'resume') resumeGame();
  else if (d.k === 'name') { c.name = cleanName(d.name); rosterChanged(0); }
}
function packState() {
  const r = G.raft, q = v => Math.round(v * 100) / 100;
  return [q(r.x), q(r.y), q(r.vx), q(r.vy), Math.round(r.ang * 1000) / 1000, q(r.w), q(r.scale),
    q(r.riders[0].gas), q(r.riders[1].gas), q(r.riders[2].gas), q(r.riders[3].gas),
    G.hearts, G.beans, q(G.invuln), q(G.t), q(G.simTime), G.started ? 1 : 0,
    G.ending ? (G.ending.type === 'win' ? 1 : 2) : 0, G.ending ? q(G.ending.t) : 0, q(G.shake)];
}
function startMsg() {
  const got = [];
  G.track.beans.forEach((b, j) => { if (b.got) got.push(j); });
  return { k: 'start', level: G.level, daily: G.def.daily || 0, got, s: packState() };
}
function hostStarted() { if (Net.mode === 'host') { Net.out = []; broadcast(startMsg()); } }
function hostState() { if (Net.mode === 'host') broadcast({ k: 'state', s: G.state }); }
function flushSnap() {
  if (Net.mode !== 'host' || !G.raft) return;
  broadcast({ k: 's', s: packState(), e: Net.out });
  Net.out = [];
}
function netTick(dt) {
  if (Net.mode !== 'host' || G.state !== 'playing') return;
  Net.snapAcc += dt;
  if (Net.snapAcc >= SNAP_EVERY) { Net.snapAcc = 0; flushSnap(); }
}
function hostResult(res) {
  if (Net.mode !== 'host') return;
  flushSnap();
  broadcast({ k: 'result', res: { won: res.won, level: res.level, time: res.time, beans: res.beans, hearts: res.hearts,
    beanPts: res.beanPts, heartPts: res.heartPts, timePts: res.timePts, score: res.score, stars: res.stars, goals: res.goals } });
}
function toLobby() {
  if (Net.mode !== 'host') return;
  broadcast({ k: 'lobby' });
  setState('lobby');
}

/* ---------- Joining ---------- */
function joinRoom(code) {
  netReset();
  Net.mode = 'guest'; Net.code = code; Net.me = 1; Net.n = 2;
  Net.status = 'Hopping onto your friend\'s raft...';
  setState('lobby');
  let peer;
  try { peer = makePeer(); } catch (e) { return netFail('Online play does not work in this browser.'); }
  Net.peer = peer;
  const lost = 'Could not find that raft. It may have closed. Ask your friend for a fresh link.';
  const timer = setTimeout(() => { if (Net.peer === peer && !Net.joined) netFail(lost); }, 25000);
  peer.on('open', () => {
    if (Net.peer !== peer) return;
    const c = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json', metadata: { name: myName() } });
    Net.host = c;
    c.on('open', () => {
      if (Net.host !== c) return;
      Net.joined = true; Net.lastSeen = performance.now(); clearTimeout(timer);
      Net.status = 'You are on the raft. Waiting for the host to pick a river.';
      lobbyRender();
      track('online_join');
    });
    c.on('data', d => { if (Net.host === c && d && typeof d === 'object') guestData(d); });
    c.on('close', () => { if (Net.host === c) netFail('The host closed the raft.'); });
  });
  peer.on('disconnected', () => { if (Net.peer === peer && !peer.destroyed && !Net.joined) peer.reconnect(); });
  peer.on('error', e => {
    if (Net.peer !== peer) return;
    if (e.type === 'peer-unavailable') netFail(lost);
    else if (!Net.joined) netFail('Could not reach the online server. Check your internet and try again.');
  });
}
function guestData(d) {
  Net.lastSeen = performance.now();
  if (d.k === 'roster') {
    Net.me = d.you | 0; Net.n = clamp(d.n | 0, 2, MAX_PLAYERS);
    Net.names = (Array.isArray(d.names) ? d.names : []).slice(0, MAX_PLAYERS).map(cleanName);
    padOwners(); lobbyRender();
  }
  else if (d.k === 's') { if (G.state === 'playing' || G.state === 'paused') { applyState(d.s); (d.e || []).forEach(replay); } }
  else if (d.k === 'start') guestStart(d);
  else if (d.k === 'state') {
    if (d.s === 'paused' && G.state === 'playing') setState('paused');
    else if (d.s === 'playing' && G.state === 'paused') { setState('playing'); last = performance.now(); }
  }
  else if (d.k === 'result') guestResult(d.res || {});
  else if (d.k === 'lobby') { Net.status = 'You are on the raft. Waiting for the host to pick a river.'; setState('lobby'); }
  else if (d.k === 'full') netFail('That raft is full. Four pigs, four friends.');
  else if (d.k === 'bye') netFail('The host closed the raft.');
}
function guestStart(d) {
  const lvl = d.level === DAILY ? DAILY : clamp(d.level | 0, 0, LEVELS.length - 1);
  loadLevel(lvl, d.daily || 0);
  (d.got || []).forEach(j => { const b = G.track.beans[j]; if (b) b.got = true; });
  if (d.s) applyState(d.s, true);
  setState('playing');
  showHint();
}
function guestResult(res) {
  const bankBefore = save.beanBank || 0;
  save.beanBank = bankBefore + (res.beans | 0);
  writeSave();
  res.unlocked = HATS.concat(OUTFIT_SKINS).filter(o => o.cost > bankBefore && o.cost <= save.beanBank).map(o => o.name);
  res.newBest = false;
  G.ending = null;
  G.lastResult = res;
  setState('result');
  track('online_result', { won: !!res.won, beans: res.beans | 0 });
}
// The host's raft arrives a little late, so pull towards it smoothly instead of jumping.
function applyState(s, hard) {
  const r = G.raft;
  const ex = s[0] - r.x, ey = s[1] - r.y, ea = s[4] - r.ang;
  if (hard || ex * ex + ey * ey > 90 * 90) { r.x = s[0]; r.y = s[1]; } else { r.x += ex * 0.35; r.y += ey * 0.35; }
  if (hard || Math.abs(ea) > 1.2) r.ang = s[4]; else r.ang += ea * 0.35;
  r.vx = s[2]; r.vy = s[3]; r.w = s[5]; r.scale = s[6];
  for (let i = 0; i < 4; i++) r.riders[i].gas = s[7 + i];
  G.hearts = s[11]; G.beans = s[12]; G.invuln = s[13]; G.t = s[14];
  G.simTime = hard || Math.abs(s[15] - G.simTime) > 0.3 ? s[15] : G.simTime + (s[15] - G.simTime) * 0.3;
  G.started = !!s[16];
  G.ending = s[17] ? { type: s[17] === 1 ? 'win' : 'pop', t: s[18] } : null;
  G.shake = s[19];
  G.loc = G.track.toLocal(r.x, r.y);
}
function replay(e) {
  const k = e[0];
  if (k === 't') { G.started = true; G.toots++; tootFx(e[1] & 3, e[2] & 3); }
  else if (k === 's') { if (SOUND_EVENTS.indexOf(e[1]) >= 0) Sound[e[1]](e[2]); }
  else if (k === 'q') G.quip = { text: String(e[1]), rider: e[2] | 0, life: 1.9 };
  else if (k === 'f') flash(String(e[1]));
  else if (k === 'b') burst(+e[1], +e[2], Math.min(60, e[3] | 0), e[4], e[5]);
  else if (k === 'p') splash(+e[1], +e[2], Math.min(30, e[3] | 0));
  else if (k === 'g') { const b = G.track.beans[e[1] | 0]; if (b) b.got = true; }
}
// Between the host's updates, a friend's raft keeps gliding on its own.
function guestStep(dt) {
  const r = G.raft;
  G.simTime += dt;
  if (G.started && !G.ending) G.t += dt;
  if (G.invuln > 0) G.invuln -= dt;
  for (const rd of r.riders) {
    rd.gas = Math.min(GAS_MAX, rd.gas + dt / GAS_RECHARGE);
    rd.anim = Math.max(0, rd.anim - dt * 4);
    rd.fizz = Math.max(0, rd.fizz - dt);
  }
  r.x += r.vx * dt; r.y += r.vy * dt; r.ang += r.w * dt;
  if (G.ending) { G.ending.t += dt; if (G.ending.type === 'pop') r.scale = Math.max(0, 1 - G.ending.t * 1.1); }
  G.loc = G.track.toLocal(r.x, r.y);
  G.ringTimer -= dt;
  if (G.ringTimer <= 0 && Math.hypot(r.vx, r.vy) > 35) { G.rings.push({ x: r.x, y: r.y, r: RAFT_R * 0.9, life: 1 }); G.ringTimer = 0.28; }
}

/* ---------- Input from this device ---------- */
function requestToot(i) {
  if (G.state !== 'playing') return;
  if (!mine(i)) { nudgePad(i); return; }
  if (Net.mode === 'guest') { if (!G.ending) { netSend({ k: 'toot', i }); flashPad(i); } return; }
  toot(i);
}
function requestDir(x, y) {
  if (Net.mode === 'guest') {
    if (G.state === 'playing' && !G.ending) netSend({ k: 'dir', x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    return;
  }
  autoToot(x, y, Net.me);
}

/* ---------- Keep-alive ---------- */
setInterval(() => {
  const now = performance.now();
  if (Net.mode === 'host') {
    for (const c of Net.conns.slice()) {
      if (now - c.seen > TIMEOUT_MS) dropGuest(c);
      else if (G.state !== 'playing') safeSend(c, { k: 'ping' });
    }
  } else if (Net.mode === 'guest' && Net.joined) {
    if (now - Net.lastSeen > TIMEOUT_MS) netFail('Lost the connection to your friend\'s raft.');
    else netSend({ k: 'ping' });
  }
}, 2000);
window.addEventListener('pagehide', () => { if (Net.mode === 'host') broadcast({ k: 'bye' }); });

/* ---------- Lobby screen and pad ---------- */
function nameOf(p) { return (p === Net.me ? myName() : Net.names[p]) || (p === 0 ? 'Host' : 'Friend ' + p); }
function playerName(p) {
  if (p !== Net.me) return nameOf(p);
  return myName() ? myName() + ' (you)' : 'You';
}
function myPigs() { return RIDERS.filter((R, i) => mine(i)); }
function lobbyRender() {
  if (G.state !== 'lobby') return;
  const err = !!Net.err, ready = Net.mode === 'host' ? !!(Net.peer && Net.peer.open) : Net.joined;
  $('onStatus').textContent = err ? Net.err : Net.status;
  const nameBox = $('onName');
  nameBox.parentNode.classList.toggle('hidden', err || !ready);
  if (document.activeElement !== nameBox) nameBox.value = myName();
  $('onShare').classList.toggle('hidden', !(Net.mode === 'host' && ready));
  if (Net.mode === 'host') $('onLink').textContent = shareUrl();
  const crew = $('onCrew');
  crew.innerHTML = '';
  if (ready) {
    for (let p = 0; p < MAX_PLAYERS; p++) {
      const row = document.createElement('div');
      if (p < Net.n) {
        row.innerHTML = '<b></b><span>' + RIDERS.map((R, i) => owner(i) === p
          ? '<i class="dot" style="--c:' + R.color + ';--cd:' + R.dark + '">' + R.key + ' ' + R.name + '</i>' : '').join('') + '</span>';
        row.firstChild.textContent = playerName(p);   // names are typed by players: never treat them as HTML
      } else {
        row.className = 'wait';
        row.textContent = Net.mode === 'host' ? 'Waiting for a friend...' : 'Free seat';
      }
      crew.appendChild(row);
    }
  }
  const rivers = $('onRivers');
  rivers.classList.toggle('hidden', !(Net.mode === 'host' && ready));
  if (Net.mode === 'host' && ready) {
    const box = $('onLevels');
    box.innerHTML = '';
    const add = (label, sub, fn) => {
      const b = document.createElement('button');
      b.className = 'lvl'; b.innerHTML = '<b>' + label + '</b>' + sub;
      b.addEventListener('click', () => { Sound.unlock(); fn(); });
      box.appendChild(b);
    };
    LEVELS.forEach((L, i) => { if (riverOpen(i)) add((i + 1) + '. ' + L.name, 'Start', () => startLevel(i, i === 0)); });
    add('Daily river', fmtDay(todayKey()), () => startLevel(DAILY, false));
  }
  $('btnLeave').textContent = err || Net.mode === 'solo' ? 'Back to menu' : 'Leave';
  $('btnRetry').classList.toggle('hidden', !(err && retryCode));
}
// Friends' pigs are dimmed and show whose they are
function padOwners() {
  if (typeof padBtns === 'undefined') return;
  padBtns.forEach((pb, i) => {
    pb.el.classList.toggle('theirs', !mine(i));
    pb.nm.textContent = mine(i) ? RIDERS[i].name : RIDERS[i].name + ' · ' + nameOf(owner(i));
  });
  // name tags over the pigs once friends are on board
  if (R3D.setBadges) R3D.setBadges(online() && Net.n > 1 ? RIDERS.map((R, i) => badgeName(owner(i))) : null);
}
function badgeName(p) {
  const n = p === Net.me && !myName() ? 'You' : nameOf(p);
  return n.length > 10 ? n.slice(0, 9) + '…' : n;
}
function nudgePad(i) {
  const el = padBtns[i].el;
  el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
  if (G.quipCd <= 0) { G.quip = { text: 'That is ' + nameOf(owner(i)) + '\'s pig!', rider: i, life: 1.2 }; G.quipCd = 1.2; }
}
function onlineHint() {
  const pigs = myPigs();
  return 'You toot ' + pigs.map(R => R.name + ' (' + R.key + ')').join(' and ') + '. Tap them or tap the water.';
}

$('btnFriends').addEventListener('click', () => { Sound.unlock(); hostRoom(); });
$('btnLeave').addEventListener('click', leaveRoom);
$('btnRetry').addEventListener('click', () => { if (retryCode) joinRoom(retryCode); });
$('onName').addEventListener('input', e => {
  save.name = cleanName(e.target.value); writeSave();
  if (Net.mode === 'host') rosterChanged(0);
  else if (Net.mode === 'guest') { netSend({ k: 'name', name: myName() }); padOwners(); lobbyRender(); }
});
$('onName').addEventListener('change', e => { e.target.value = myName(); });
$('onName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('btnShare').addEventListener('click', async () => {
  Sound.unlock();
  const url = shareUrl(), btn = $('btnShare');
  const done = t => { btn.textContent = t; setTimeout(() => (btn.textContent = 'Share link'), 1800); };
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Toot Raft', text: 'Hop on my raft in Toot Raft', url }); track('online_share', { how: 'share' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); done('Link copied'); track('online_share', { how: 'copy' }); return; } catch (e) {}
  // last resort: select the link so it can be copied by hand
  const r = document.createRange(); r.selectNodeContents($('onLink'));
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  done('Copy the link above');
});
if (!(window.PeerLib && window.PeerLib.Peer && window.RTCPeerConnection)) $('btnFriends').classList.add('hidden');
