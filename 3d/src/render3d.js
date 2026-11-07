/* =========================================================
   3D renderer. The game rules still run on a flat river (x, y);
   this draws them as a water slide in the sky with a chase camera.
   Sim (x, y) maps to 3D (x, height, y), so forward is -z.
   ========================================================= */
const canvas = document.getElementById('c');
const OUTFITS = [
  { shirt: '#ffffff', pants: '#3b6fd6', shoe: '#6b4226' }, // Pip: overalls
  { shirt: '#e5484d', pants: '#e5484d', shoe: '#ffffff' }, // Ham: tracksuit
  { shirt: '#ffd54a', pants: '#23395d', shoe: '#ff6b5a' }, // Bun: tee and shorts
  { shirt: '#2ec4b6', pants: '#3a3a4a', shoe: '#f2efe6' }, // Lou: hoodie
];
function lookOf(i) { return (save.looks && save.looks[i]) || { hat: 'none', outfit: 'classic' }; }
function outfitColors(i, id) {
  const skin = OUTFIT_SKINS.find(o => o.id === id);
  return skin && skin.c ? Object.assign({}, OUTFITS[i], skin.c) : OUTFITS[i];
}

const R3D = (() => {
  const TAU = Math.PI * 2;
  const FOG = '#dcf2fb';
  let W = 1, H = 1, quality = 2;
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { const t = document.querySelector('#scrMenu .tag'); if (t) t.textContent = 'This game needs WebGL, which this browser has switched off.'; }

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 1100, 2700);
  const sky = buildSky(); scene.add(sky);
  scene.add(new THREE.HemisphereLight('#ffffff', '#ead9d2', 1.85));
  const sun = new THREE.DirectionalLight('#fff3df', 1.55);
  sun.position.set(-0.5, 1, 0.35); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(70, 1, 4, 5200);

  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const levelGroup = new THREE.Group(); scene.add(levelGroup);

  function buildSky() {
    const g = new THREE.SphereGeometry(4400, 24, 16), P = g.attributes.position, col = new Float32Array(P.count * 3);
    const top = new THREE.Color('#4fb3f0'), mid = new THREE.Color('#a9e0fa'), hor = new THREE.Color(FOG), low = new THREE.Color('#f2fbff'), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i) / 4400;
      if (y >= 0) { if (y < 0.16) c.copy(hor).lerp(mid, y / 0.16); else c.copy(mid).lerp(top, Math.min(1, (y - 0.16) / 0.5)); }
      else c.copy(hor).lerp(low, Math.min(1, -y / 0.5));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10; m.frustumCulled = false; return m;
  }
  function canvasTex(w, h, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }

  /* ---------- Water ---------- */
  const waterTex = canvasTex(128, 256, (g, w, h) => {
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, '#6ad4f7'); across.addColorStop(0.16, '#3fb0f2'); across.addColorStop(0.5, '#2f9bec');
    across.addColorStop(0.84, '#3fb0f2'); across.addColorStop(1, '#6ad4f7');
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    const r = mulberry32(7);
    g.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const x = 8 + r() * (w - 16), y = r() * h, len = 14 + r() * 34;
      g.strokeStyle = 'rgba(255,255,255,' + (0.1 + r() * 0.2).toFixed(2) + ')'; g.lineWidth = 1 + r() * 2;
      for (const off of [-h, 0, h]) { g.beginPath(); g.moveTo(x, y + off); g.lineTo(x + (r() - 0.5) * 3, y + off + len); g.stroke(); }
    }
    g.fillStyle = '#ffffff';                          // foam against both walls
    for (let y = 0; y < h; y++) {
      const a = 3 + 1.6 * Math.sin(y / h * TAU * 3) + 1 * Math.sin(y / h * TAU * 7);
      const b = 3 + 1.6 * Math.sin(y / h * TAU * 2 + 1) + 1 * Math.sin(y / h * TAU * 5 + 2);
      g.fillRect(0, y, a, 1); g.fillRect(w - b, y, b, 1);
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  const waterMat = new THREE.MeshBasicMaterial({ map: waterTex });

  const spiralTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2; g.clearRect(0, 0, w, w); g.translate(c, c);
    const d = g.createRadialGradient(0, 0, 4, 0, 0, c); d.addColorStop(0, 'rgba(12,70,150,.75)'); d.addColorStop(0.55, 'rgba(25,110,200,.32)'); d.addColorStop(1, 'rgba(40,140,230,0)');
    g.fillStyle = d; g.beginPath(); g.arc(0, 0, c, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      for (let s = 0; s <= 1; s += 0.03) { const a = k * TAU / 4 + s * 4.2, rr = 16 + s * (c - 26); g[s ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
      g.stroke();
    }
  });
  const checkerTex = canvasTex(256, 32, (g, w, h) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#1f2a44' : '#ffffff'; g.fillRect(x * 16, y * 16, 16, 16); }
  });
  checkerTex.wrapS = THREE.RepeatWrapping;
  const bannerTex = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#ff6b5a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 24) { g.fillStyle = (x / 24) % 2 ? '#1f2a44' : '#fff'; g.fillRect(x, 0, 24, 10); g.fillStyle = (x / 24) % 2 ? '#fff' : '#1f2a44'; g.fillRect(x, h - 10, 24, 10); }
    g.fillStyle = '#fff'; g.font = '900 60px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', w / 2, h / 2 + 2);
  });

  /* ---------- Static mesh builder: everything merged per stretch of river ---------- */
  const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpC = new THREE.Color();
  const unindexed = new Map();
  function raw(g) { if (!unindexed.has(g)) unindexed.set(g, g.index ? g.toNonIndexed() : g); return unindexed.get(g); }
  class Mesher {
    constructor() { this.p = []; this.n = []; this.c = []; }
    add(geom, m, color) {
      const g = raw(geom), P = g.attributes.position, N = g.attributes.normal;
      const col = tmpC.set(color), r = col.r, gg = col.g, b = col.b;
      const ne = m.elements;
      for (let i = 0; i < P.count; i++) {
        tmpV.fromBufferAttribute(P, i).applyMatrix4(m);
        const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
        tmpN.set(ne[0] * nx + ne[4] * ny + ne[8] * nz, ne[1] * nx + ne[5] * ny + ne[9] * nz, ne[2] * nx + ne[6] * ny + ne[10] * nz).normalize();
        this.p.push(tmpV.x, tmpV.y, tmpV.z); this.n.push(tmpN.x, tmpN.y, tmpN.z); this.c.push(r, gg, b);
      }
    }
    // a flat-shaded quad: a, b, c, d are [x, y, z], ca..cd are colour strings
    quad(a, b, c, d, ca, cb, cc, cd) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const push = (q, s) => { tmpC.set(s); this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(tmpC.r, tmpC.g, tmpC.b); };
      push(a, ca); push(b, cb); push(c, cc); push(a, ca); push(c, cc); push(d, cd);
    }
    mesh(mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
      return new THREE.Mesh(g, mat || staticMat);
    }
  }
  const GEO = {
    sphere: new THREE.SphereGeometry(1, 12, 9),
    lowSphere: new THREE.IcosahedronGeometry(1, 1),
    cone4: new THREE.ConeGeometry(1, 1, 4),
    cone6: new THREE.ConeGeometry(1, 1, 6),
    cone8: new THREE.ConeGeometry(1, 1, 8),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cyl12: new THREE.CylinderGeometry(1, 1, 1, 14),
    box: new THREE.BoxGeometry(1, 1, 1),
    mesa: new THREE.CylinderGeometry(1, 0.62, 1, 7),
  };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Vector3(0, 1, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  function mat(x, y, z, sx, sy, sz, yaw) {
    Q.setFromAxisAngle(E, yaw || 0); P.set(x, y, z); S.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    return new THREE.Matrix4().compose(P, Q, S);
  }

  /* ---------- River height and banking (drawn only; the rules stay flat) ---------- */
  let T = null, heights = null, banks = null;
  const D0 = -500, DS = 8;
  function buildProfile(track) {
    const rnd = mulberry32((track.def.seed | 0) ^ 0x5151);
    const p = rnd() * TAU, q = rnd() * TAU;
    const drops = [];
    for (let d = 420 + rnd() * 240; d < track.L; d += 520 + rnd() * 620) drops.push([d, 120 + rnd() * 90, 36 + rnd() * 50]);
    const n = Math.ceil((track.L + 1500 - D0) / DS) + 1;
    heights = new Float32Array(n); banks = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = D0 + i * DS;
      let h = -0.1 * Math.max(0, d) + 16 * Math.sin(d / 340 + p) * smooth(100, 500, d) + 7 * Math.sin(d / 150 + q) * smooth(100, 500, d);
      for (const [a, w, s] of drops) h -= s * smooth(a, a + w, d);
      heights[i] = h;
      const curve = (track.cx(d + 60) - 2 * track.cx(d) + track.cx(d - 60)) / 3600;
      banks[i] = -clamp(curve * 95, -0.2, 0.2);
    }
  }
  function table(a, d) {
    const x = clamp((d - D0) / DS, 0, a.length - 1.001), i = Math.floor(x), f = x - i;
    return a[i] + (a[i + 1] - a[i]) * f;
  }
  const hOf = d => table(heights, d);
  const bankOf = d => table(banks, d);
  const surfY = (d, u) => hOf(d) + u * bankOf(d);

  /* ---------- Cliffs and sky scenery ---------- */
  function vnoise(x) {
    const i = Math.floor(x), f = x - i, a = hash(i * 1.37 + 3.1), b = hash((i + 1) * 1.37 + 3.1);
    return a + (b - a) * f * f * (3 - 2 * f);
  }
  const COLS = [0, 46, 110, 220, 400, 720];
  const WALL = [-8, 16, 58, 104, 66, -70];
  const OPEN = [-28, -150, -330, -560, -820, -1100];
  function wallness(d, side, seed) { return smooth(0.42, 0.62, vnoise(d / 460 + (side > 0 ? 11 : 37) + seed)); }
  function cliffH(d, side, c, seed) {
    const w = wallness(d, side, seed);
    const j = (hash(Math.round(d / 40) * 3.3 + c * 7.1 + side + seed) - 0.5) * (c ? 26 : 4);
    return OPEN[c] + (WALL[c] - OPEN[c]) * w + j;
  }
  function cliffColor(rel, c) {
    if (rel < -220) { const k = clamp((-rel - 220) / 500, 0, 1); return '#' + tmpC.set('#ef8b78').lerp(new THREE.Color(FOG), k).getHexString(); }
    if (c <= 1) return '#f7ad97';
    return rel > 110 ? '#f9b7a2' : rel > 30 ? '#f39c86' : '#ec8672';
  }

  function chunkOf(chunks, d) { const k = Math.floor((d - D0) / 720); return chunks[k] || (chunks[k] = { k, base: new Mesher(), decor: new Mesher(), water: { p: [], uv: [] } }); }

  function addHouse(m, x, y, z, yaw, r) {
    const walls = ['#fff4dc', '#ffe0c2', '#d9f2ff', '#ffe8f0'][Math.floor(r * 4)], roof = ['#e5484d', '#3b6fd6', '#ff9f43', '#7c5cff'][Math.floor(r * 37) % 4];
    const w = 38 + r * 14, h = 26 + r * 10;
    m.add(GEO.box, mat(x, y + h / 2, z, w, h, w * 0.85, yaw), walls);
    m.add(GEO.cone4, mat(x, y + h + 13, z, w * 0.82, 26, w * 0.82, yaw + Math.PI / 4), roof);
    m.add(GEO.box, mat(x + Math.sin(yaw) * w * 0.43, y + 8, z + Math.cos(yaw) * w * 0.43, 10, 16, 2, yaw), '#6b4226');
  }
  function addTree(m, x, y, z, r) {
    if (r < 0.45) {       // palm
      const h = 44 + r * 50;
      m.add(GEO.cyl, mat(x, y + h / 2, z, 4, h, 4), '#b98a5a');
      for (let a = 0; a < 5; a++) {
        const ang = a * TAU / 5 + r * 5;
        const leaf = new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(ang) * 17, y + h - 1, z + Math.sin(ang) * 17),
          new THREE.Quaternion().setFromUnitVectors(E, new THREE.Vector3(Math.cos(ang), -0.25, Math.sin(ang)).normalize()), new THREE.Vector3(8, 42, 8));
        m.add(GEO.cone4, leaf, a % 2 ? '#62c65a' : '#7fd65f');
      }
    } else {              // round bush tree
      const s = 18 + r * 22;
      m.add(GEO.cyl, mat(x, y + s * 0.6, z, 4, s * 1.2, 4), '#a97c50');
      m.add(GEO.lowSphere, mat(x, y + s * 1.6, z, s), '#66c95c');
      m.add(GEO.lowSphere, mat(x + s * 0.55, y + s * 1.2, z + s * 0.2, s * 0.66), '#86dc6b');
    }
  }

  /* ---------- Hazards ---------- */
  function spikedBar(len, radius, color, tip, spikeColor, dir) {    // bar along local x from 0 to dir * len
    const m = new Mesher();
    const axis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    m.add(GEO.cyl12, new THREE.Matrix4().compose(new THREE.Vector3(dir * len / 2, 0, 0), axis, new THREE.Vector3(radius, len, radius)), color);
    m.add(GEO.cyl12, new THREE.Matrix4().compose(new THREE.Vector3(dir * 5, 0, 0), axis, new THREE.Vector3(radius * 1.18, 10, radius * 1.18)), tip);
    const rings = Math.max(2, Math.floor(len / 26));
    for (let i = 0; i < rings; i++) {
      const x = dir * (16 + (i + 0.5) * (len - 16) / rings);
      for (let a = 0; a < 6; a++) {
        const ang = a * TAU / 6 + (i % 2) * 0.5, d = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));
        m.add(GEO.cone6, new THREE.Matrix4().compose(new THREE.Vector3(x, d.y * (radius + 6), d.z * (radius + 6)), new THREE.Quaternion().setFromUnitVectors(E, d), new THREE.Vector3(5.5, 15, 5.5)), spikeColor);
      }
    }
    return m.mesh();
  }
  function frameBasis(d) {
    const f = T.frame(d), bank = bankOf(d), slope = (hOf(d + 8) - hOf(d - 8)) / 16;
    const n = new THREE.Vector3(f.nx, bank, f.ny).normalize(), t = new THREE.Vector3(f.fx, slope, f.fy).normalize();
    const up = new THREE.Vector3().crossVectors(n, t).normalize(), z = new THREE.Vector3().crossVectors(n, up).normalize();
    return new THREE.Matrix4().makeBasis(n, up, z);
  }
  let hazardViews = [];
  function buildHazard(h) {
    const g = new THREE.Group(), hw = h.f.hw;
    g.applyMatrix4(frameBasis(h.d));
    const view = { h, g };
    if (h.type === 'whirl') {
      g.position.set(h.x, surfY(h.d, h.u) + 1.2, h.y);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(h.r, 28), new THREE.MeshBasicMaterial({ map: spiralTex, transparent: true, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; g.add(disc); view.disc = disc;
    } else {
      g.position.set(h.x, hOf(h.d), h.y);
      if (h.type === 'log') {
        const reach = h.len * 2 * hw, len = reach + 44;
        const bar = spikedBar(len, 15, '#f0569a', '#ffd0e4', '#ffffff', -h.side);
        bar.position.y = 17;
        bar.position.x = h.side > 0 ? hw + 44 : -hw - 44;
        g.add(bar); view.bar = bar;
        const cap = new THREE.Mesh(GEO.lowSphere, new THREE.MeshLambertMaterial({ color: '#f0569a' }));
        cap.scale.set(19, 19, 19); cap.position.set(h.side > 0 ? hw - reach : -hw + reach, 17, 0); g.add(cap);
      } else if (h.type === 'gate') {
        const len = hw + 60;
        view.left = spikedBar(len, 12, '#5b3fa8', '#ff9f43', '#ffffff', -1); view.right = spikedBar(len, 12, '#5b3fa8', '#ff9f43', '#ffffff', 1);
        view.left.position.y = view.right.position.y = 15;
        g.add(view.left, view.right);
      } else if (h.type === 'mine') {
        const m = new Mesher();
        m.add(GEO.lowSphere, mat(0, 0, 0, 22), '#3b3f5e');
        m.add(GEO.lowSphere, mat(0, 13, 0, 11), '#ff5a4f');
        const pts = GEO.lowSphere.attributes.position, seen = new Set();
        for (let i = 0; i < pts.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(pts, i), key = v.toArray().map(a => a.toFixed(2)).join();
          if (seen.has(key) || Math.abs(v.length() - 1) > 0.01) continue; seen.add(key);
          if (seen.size % 3) continue;
          m.add(GEO.cone6, new THREE.Matrix4().compose(v.clone().multiplyScalar(27), new THREE.Quaternion().setFromUnitVectors(E, v), new THREE.Vector3(7, 20, 7)), '#ffffff');
        }
        const ball = m.mesh(); ball.position.y = 20; g.add(ball); view.ball = ball;
      }
    }
    levelGroup.add(g);
    return view;
  }
  function updateHazards(t, raftD) {
    for (const v of hazardViews) {
      const h = v.h, near = h.d > raftD - 500 && h.d < raftD + 3000;
      v.g.visible = near;
      if (!near) continue;
      if (h.type === 'whirl') v.disc.rotation.z = -t * 3 * h.dir;
      else if (h.type === 'log') v.bar.rotation.x = t * 2.4 * h.side;
      else if (h.type === 'gate') { const gap = gateOpen(h, G.simTime) * (h.f.hw + 4); v.left.position.x = -gap; v.right.position.x = gap; }
      else if (h.type === 'mine') { v.ball.position.x = mineU(h, G.simTime); v.ball.rotation.y = t * 1.6; v.ball.rotation.x = t * 0.7; v.ball.position.y = 20 + Math.sin(t * 2.6 + h.phase) * 2.5; }
    }
  }

  /* ---------- Build a level ---------- */
  let levelKey = null, chunkMeshes = [], beanMesh = null, beanBase = [];
  function clearLevel() {
    levelGroup.traverse(o => { if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); });
    levelGroup.clear(); chunkMeshes = []; hazardViews = []; beanMesh = null;
  }
  function buildLevel(track) {
    if (!renderer) { T = track; return; }
    const key = track.def.seed + ':' + track.L;
    T = track;
    if (key === levelKey) {   // same river again: geometry is the same, only re-link the fresh game objects
      buildProfileIfNeeded(track);
      hazardViews.forEach((v, i) => { v.h = track.hazards[i]; });
      beanBase.forEach((b, i) => { b.b = track.beans[i]; });
      resetCamera();
      return;
    }
    levelKey = key;
    clearLevel();
    buildProfile(track);
    const chunks = [], seed = (track.def.seed % 97) * 0.77;
    const rnd = mulberry32((track.def.seed | 0) ^ 0x2F2F);
    const dEnd = track.L + 1200, dStart = -260, RS = 16;

    const row = d => {
      const f = track.frame(d);
      return { d, f, h: hOf(d), b: bankOf(d), spk: [track.spiked(0, d), track.spiked(1, d)] };
    };
    const at = (r, u, z) => [r.f.cx + u * r.f.nx, r.h + u * r.b + z, -r.d + u * r.f.ny];
    // Slide cross section: offset out from the water's edge, height above the water
    const PROFILE = [[-3, -1.5], [9, 9], [21, 22], [36, 25], [47, 11], [48, -22], [30, -40]];
    const COLORS = ['#e6faf2', '#8be8c4', '#a6f3d8', '#7fe0ba', '#5fcba4', '#4eb893'];
    const SPIKE_COLORS = ['#ffd9e8', '#ff7fb2', '#ff9ec5', '#f7669f', '#5fcba4', '#4eb893'];

    for (let d = dStart; d < dEnd; d += RS) {
      const a = row(d), b = row(d + RS), c = chunkOf(chunks, d), m = c.base;
      // water
      const w0 = a.f.hw + 3, w1 = b.f.hw + 3, A = at(a, -w0, 0), B = at(a, w0, 0), C = at(b, w1, 0), D = at(b, -w1, 0);
      const v0 = -a.d / 240, v1 = -b.d / 240;
      c.water.p.push(...A, ...B, ...C, ...A, ...C, ...D);
      c.water.uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
      // both walls of the slide
      [-1, 1].forEach(side => {
        const si = side < 0 ? 0 : 1, cols = a.spk[si] && d > 0 ? SPIKE_COLORS : COLORS;
        for (let i = 0; i < PROFILE.length - 1; i++) {
          const [o0, z0] = PROFILE[i], [o1, z1] = PROFILE[i + 1];
          const p00 = at(a, side * (a.f.hw + o0), z0), p01 = at(a, side * (a.f.hw + o1), z1), p10 = at(b, side * (b.f.hw + o0), z0), p11 = at(b, side * (b.f.hw + o1), z1);
          if (side > 0) m.quad(p00, p01, p11, p10, cols[i], cols[i], cols[i], cols[i]);
          else m.quad(p00, p10, p11, p01, cols[i], cols[i], cols[i], cols[i]);
        }
      });
      // underside
      const u0 = at(a, -a.f.hw - 30, -40), u1 = at(a, a.f.hw + 30, -40), u2 = at(b, b.f.hw + 30, -40), u3 = at(b, -b.f.hw - 30, -40);
      m.quad(u0, u3, u2, u1, '#3f9e80', '#3f9e80', '#3f9e80', '#3f9e80');
    }

    // Spikes along the dangerous stretches of wall
    [0, 1].forEach(si => {
      const side = si ? 1 : -1;
      for (const [a, b] of track.spikes[si]) {
        for (let d = a + 8; d < b; d += 24) {
          const f = track.frame(d), u = side * (f.hw - 3);
          const dir = new THREE.Vector3(-side * f.nx, -side * bankOf(d) * 0.2, -side * f.ny).normalize();
          const pos = new THREE.Vector3(f.cx + u * f.nx + dir.x * 9, hOf(d) + u * bankOf(d) + 9, -d + u * f.ny + dir.z * 9);
          chunkOf(chunks, d).base.add(GEO.cone6, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromUnitVectors(E, dir), new THREE.Vector3(8, 25, 8)), '#ffffff');
        }
      }
    });

    // Coral cliffs on both sides, falling away into open sky
    const CS = 40;
    [-1, 1].forEach(side => {
      for (let d = dStart; d < dEnd; d += CS) {
        const a = row(d), b = row(d + CS), c = chunkOf(chunks, d).base;
        for (let k = 0; k < COLS.length - 1; k++) {
          const pt = (r, col) => { const o = r.f.hw + 44 + COLS[col]; const y = r.h + cliffH(r.d, side, col, seed); return [r.f.cx + side * o * r.f.nx, y, -r.d + side * o * r.f.ny]; };
          const p00 = pt(a, k), p01 = pt(a, k + 1), p10 = pt(b, k), p11 = pt(b, k + 1);
          const col = (p, cc) => cliffColor(p[1] - a.h, cc);
          const c00 = col(p00, k), c01 = col(p01, k + 1), c10 = col(p10, k), c11 = col(p11, k + 1);
          if (side > 0) c.quad(p00, p01, p11, p10, c00, c01, c11, c10); else c.quad(p00, p10, p11, p01, c00, c10, c11, c01);
        }
      }
    });

    // Life on the cliff tops: houses, palms, bushes, rocks. Floating islands and clouds further out.
    for (let d = 60; d < track.L + 900; d += 42) {
      for (const side of [-1, 1]) {
        const w = wallness(d, side, seed), r = rnd(), r2 = rnd(), f = track.frame(d), decor = chunkOf(chunks, d).decor;
        if (w > 0.75 && r < 0.62) {
          const col = r2 * 1.8;                                  // between cliff columns 0 and ~2
          const o = f.hw + 44 + 30 + r2 * 150;
          const cIdx = o - f.hw - 44 < 46 ? 0 : o - f.hw - 44 < 110 ? 1 : 2;
          const c0 = COLS[cIdx], c1 = COLS[cIdx + 1], tt = (o - f.hw - 44 - c0) / (c1 - c0);
          const y = hOf(d) + lerp(cliffH(d, side, cIdx, seed), cliffH(d, side, cIdx + 1, seed), tt) - 2;
          const x = f.cx + side * o * f.nx, z = -d + side * o * f.ny;
          if (r < 0.12) addHouse(decor, x, y, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, r2);
          else if (r < 0.5) addTree(decor, x, y, z, r2);
          else decor.add(GEO.lowSphere, mat(x, y + 4, z, 12 + r2 * 18, 8 + r2 * 12, 12 + r2 * 18), '#c9a58f');
        }
        if (r2 < 0.05) {                                         // floating island
          const o = f.hw + 420 + rnd() * 620, y = hOf(d) - 90 + rnd() * 170, s = 90 + rnd() * 110;
          const x = f.cx + side * o * f.nx, z = -d + side * o * f.ny;
          decor.add(GEO.mesa, mat(x, y - s * 0.5, z, s, s * 1.1, s), '#ef8b78');
          decor.add(GEO.cyl12, mat(x, y + 3, z, s * 1.02, 8, s * 1.02), '#8fdc72');
          for (let t = 0; t < 3; t++) addTree(decor, x + (rnd() - 0.5) * s, y + 7, z + (rnd() - 0.5) * s, rnd());
          if (rnd() < 0.4) addHouse(decor, x, y + 7, z, rnd() * 3, rnd());
        }
        if (r < 0.07) {                                          // clouds
          const o = f.hw + 240 + rnd() * 900, y = hOf(d) + (rnd() < 0.6 ? -160 - rnd() * 240 : 200 + rnd() * 240), s = 40 + rnd() * 50;
          const x = f.cx + side * o * f.nx, z = -d + side * o * f.ny;
          for (let t = 0; t < 4; t++) decor.add(GEO.lowSphere, mat(x + (t - 1.5) * s * 0.85, y + (t % 2) * s * 0.2, z + (rnd() - 0.5) * s, s * (0.7 + rnd() * 0.5), s * (0.45 + rnd() * 0.25), s * (0.7 + rnd() * 0.3)), '#ffffff');
        }
      }
    }

    // Start dock
    {
      const f = track.frame(START_WALL), m = chunkOf(chunks, START_WALL).base, y = hOf(START_WALL);
      for (let i = -6; i <= 6; i++) m.add(GEO.box, mat(f.cx + i * (f.hw + 40) / 6.5, y + 8, -START_WALL + 16, (f.hw + 40) / 6.9, 16 + (i % 2) * 2, 34), i % 2 ? '#b98a5a' : '#a97c50');
    }
    // Finish line and arch
    {
      const f = track.frame(track.L), y = hOf(track.L), g = new THREE.Group();
      g.applyMatrix4(frameBasis(track.L)); g.position.set(f.cx, y, -track.L);
      const span = f.hw + 34;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(f.hw * 2 + 6, 26), new THREE.MeshBasicMaterial({ map: checkerTex, transparent: true }));
      line.rotation.x = -Math.PI / 2; line.position.y = 1.4; g.add(line);
      const pm = new Mesher();
      for (const s of [-1, 1]) { pm.add(GEO.cyl12, mat(s * span, 95, 0, 8, 190, 8), '#ffffff'); pm.add(GEO.lowSphere, mat(s * span, 194, 0, 13), '#ff6b5a'); }
      g.add(pm.mesh());
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 54), new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide }));
      banner.position.y = 160; g.add(banner);
      levelGroup.add(g);
    }

    // Hand the merged pieces to the GPU
    const waterMeshes = [];
    chunks.forEach(c => {
      if (!c) return;
      const base = c.base.mesh(), decor = c.decor.mesh(), wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c.water.p), 3));
      wg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.water.uv), 2));
      const water = new THREE.Mesh(wg, waterMat);
      levelGroup.add(base, decor, water);
      chunkMeshes.push({ d0: D0 + c.k * 720, base, decor, water });
      waterMeshes.push(water);
    });

    hazardViews = track.hazards.map(buildHazard);

    // Beans
    const beanGeo = new THREE.SphereGeometry(1, 10, 8);
    beanMesh = new THREE.InstancedMesh(beanGeo, new THREE.MeshLambertMaterial({ color: '#ff9d3c', emissive: '#7a3a00' }), Math.max(1, track.beans.length));
    beanMesh.frustumCulled = false; levelGroup.add(beanMesh);
    beanBase = track.beans.map(b => { const L = track.toLocal(b.x, b.y); return { b, y: surfY(L.d, L.u) + 15 }; });
    resetCamera();
  }
  function buildProfileIfNeeded(track) { if (!heights) buildProfile(track); }

  /* ---------- Raft and pigs ---------- */
  const raft = new THREE.Group(); scene.add(raft);
  let riderViews = [];
  function buildPig(i, look) {
    const R = RIDERS[i], o = outfitColors(i, look.outfit), m = new Mesher();
    const fur = R.fur, dark = R.furDark;
    for (const s of [-1, 1]) {
      m.add(GEO.cyl, mat(s * 5.2, 5, 0, 3.6, 9, 3.6), o.pants);
      m.add(GEO.sphere, mat(s * 5.2, 1.6, 1.2, 4.3, 2.8, 5.6), o.shoe);
      m.add(GEO.sphere, new THREE.Matrix4().compose(new THREE.Vector3(s * 12.2, 17.5, 1.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * 0.7), new THREE.Vector3(3.2, 6.8, 3.2)), o.shirt);
      m.add(GEO.sphere, mat(s * 14.8, 12.6, 2, 3.1), fur);
      // ears
      m.add(GEO.cone6, new THREE.Matrix4().compose(new THREE.Vector3(s * 6.8, 37.4, -0.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * 0.55), new THREE.Vector3(3.7, 7, 2.6)), dark);
      // eyes
      m.add(GEO.sphere, mat(s * 3.9, 31.5, 8.2, 2.7), '#ffffff');
      m.add(GEO.sphere, mat(s * 3.9, 31.7, 10.1, 1.45), '#1f2a44');
      // nostrils
      m.add(GEO.sphere, mat(s * 1.7, 27.5, 12.9, 0.85), dark);
    }
    m.add(GEO.sphere, mat(0, 10.5, -0.4, 11.3, 8.6, 10.6), o.pants);        // hips, big and proud
    m.add(GEO.sphere, mat(0, 18, 0, 10.3, 9.6, 9.4), o.shirt);              // chest
    m.add(GEO.sphere, mat(0, 30, 0.8, 10.4, 9.6, 9.8), fur);                // head
    m.add(GEO.sphere, mat(0, 27.5, 10.2, 5, 3.8, 3.2), dark);               // snout
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0);
    m.add(new THREE.TorusGeometry(2.8, 1, 6, 10), new THREE.Matrix4().compose(new THREE.Vector3(0, 13, -11.8), q, new THREE.Vector3(1, 1, 1)), fur); // curly tail
    addHat(m, look.hat);
    return m.mesh();
  }
  function addHat(m, hat) {
    const y = 38.5;
    if (hat === 'party') { m.add(GEO.cone8, mat(0, y + 6, 0, 6, 14, 6), '#ff6bb5'); m.add(GEO.sphere, mat(0, y + 14, 0, 2.2), '#ffd54a'); }
    else if (hat === 'cap') { m.add(GEO.sphere, mat(0, y - 1, 0, 9.2, 5.6, 9.2), '#3b6fd6'); m.add(GEO.box, mat(0, y - 2.6, 9.6, 9.2, 1.2, 8), '#2a52a8'); }
    else if (hat === 'cowboy') { m.add(GEO.cyl12, mat(0, y - 2.5, 0, 15, 1.2, 15), '#8a5a2b'); m.add(GEO.cyl12, mat(0, y + 2, 0, 7.6, 9, 7.6), '#8a5a2b'); m.add(GEO.cyl12, mat(0, y - 0.8, 0, 7.8, 1.6, 7.8), '#3d2b1f'); }
    else if (hat === 'crown') { m.add(GEO.cyl12, mat(0, y, 0, 7.4, 4.5, 7.4), '#ffc107'); for (let a = 0; a < 5; a++) m.add(GEO.cone4, mat(Math.cos(a * TAU / 5) * 6.2, y + 4.5, Math.sin(a * TAU / 5) * 6.2, 2.4, 6, 2.4), '#ffc107'); }
    else if (hat === 'viking') {
      m.add(GEO.sphere, mat(0, y - 1, 0, 9, 6.4, 9), '#9aa3b5');
      for (const s of [-1, 1]) m.add(GEO.cone8, new THREE.Matrix4().compose(new THREE.Vector3(s * 11, y + 2.5, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -s * 1), new THREE.Vector3(2.4, 11, 2.4)), '#fff4dc');
    }
  }
  function badgeTexture(i) {
    return canvasTex(64, 64, g => {
      g.fillStyle = RIDERS[i].dark; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill();
      g.fillStyle = RIDERS[i].color; g.beginPath(); g.arc(32, 32, 25, 0, TAU); g.fill();
      g.fillStyle = '#1f2a44'; g.font = '900 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(RIDERS[i].key, 32, 34);
    });
  }
  const badgeTex = RIDERS.map((_, i) => badgeTexture(i));
  const badges = RIDERS.map((_, i) => new THREE.SpriteMaterial({ map: badgeTex[i], depthTest: false, transparent: true }));
  const badgeSprites = [];
  // Online: a name tag (number + player's name) instead of the plain number
  function nameTexture(i, name) {
    const H = 64, font = '800 30px system-ui, sans-serif';
    const meas = document.createElement('canvas').getContext('2d'); meas.font = font;
    const tw = Math.ceil(meas.measureText(name).width), W = Math.min(512, H + tw + 22);
    const tex = canvasTex(W, H, g => {
      const pill = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); };
      g.fillStyle = RIDERS[i].dark; pill(0, 2, W, H - 4, (H - 4) / 2);
      g.fillStyle = '#fffaf0'; pill(4, 6, W - 8, H - 12, (H - 12) / 2);
      g.fillStyle = RIDERS[i].color; g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.fill();
      g.fillStyle = '#1f2a44'; g.textBaseline = 'middle';
      g.font = '900 32px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(RIDERS[i].key, 32, 34);
      g.font = font; g.textAlign = 'left'; g.fillText(name, H + 2, 34, W - H - 14);
    });
    tex.aspect = W / H;
    return tex;
  }
  let badgeKey = '', named = false;
  const tagPos = new THREE.Vector3();
  // Name tags are wide, so stack them: the further a pig is from the camera, the higher its tag
  function stackTags() {
    if (!named) return;
    const d = badgeSprites.map((sp, i) => { sp.getWorldPosition(tagPos); return { i, d: tagPos.distanceToSquared(camera.position) }; });
    d.sort((a, b) => a.d - b.d).forEach((e, rank) => { badgeSprites[e.i].position.y = 56 + rank * 13; });
  }
  function setBadges(labels) {
    const key = JSON.stringify(labels || []);
    if (key === badgeKey) return;
    badgeKey = key; named = !!(labels && labels.length);
    badgeSprites.forEach((sp, i) => {
      const m = sp.material, name = labels && labels[i];
      if (m.map !== badgeTex[i]) m.map.dispose();
      m.map = name ? nameTexture(i, name) : badgeTex[i];
      m.needsUpdate = true;
      const h = name ? 17 : 19;
      sp.scale.set(h * (name ? m.map.aspect : 1), h, 1);
      sp.position.y = 56;
    });
  }
  (function buildRaft() {
    const m = new Mesher(), ringR = RAFT_R - 7;
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    m.add(GEO.cyl12, mat(0, 1, 0, ringR, 5, ringR), '#c98a4b');
    for (let k = -3; k <= 3; k++) m.add(GEO.box, mat(k * 7.6, 3.8, 0, 6.6, 1.2, Math.sqrt(Math.max(0, ringR * ringR - k * k * 58)) * 1.9), k % 2 ? '#d9a064' : '#c08043');
    m.add(new THREE.TorusGeometry(ringR, 9.5, 9, 28), new THREE.Matrix4().compose(new THREE.Vector3(0, 3, 0), flat, new THREE.Vector3(1, 1, 0.9)), '#fff4e6');
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + TAU / 16;
      m.add(new THREE.TorusGeometry(ringR, 10, 9, 5, 0.34), new THREE.Matrix4().compose(new THREE.Vector3(0, 3, 0), new THREE.Quaternion().multiplyQuaternions(flat, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - 0.17)), new THREE.Vector3(1, 1, 0.9)), '#ff6b5a');
    }
    raft.add(m.mesh());
    RIDERS.forEach((R, i) => {
      const holder = new THREE.Group(), a = i * Math.PI / 2;
      holder.position.set(Math.cos(a) * RIDER_DIST, 3.5, Math.sin(a) * RIDER_DIST);
      holder.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));   // bottom out, face in
      const badge = new THREE.Sprite(badges[i]); badge.scale.set(19, 19, 1); badge.position.set(Math.cos(a) * RIDER_DIST, 56, Math.sin(a) * RIDER_DIST); badge.renderOrder = 20;
      badgeSprites[i] = badge;
      raft.add(holder, badge);
      riderViews[i] = { holder, pig: null };
    });
  })();
  function refreshLooks() {
    riderViews.forEach((v, i) => {
      if (v.pig) { v.holder.remove(v.pig); v.pig.geometry.dispose(); }
      v.pig = buildPig(i, lookOf(i)); v.holder.add(v.pig);
    });
  }
  refreshLooks();

  // Wardrobe pictures: a second tiny renderer, used only on that screen
  let prev = null;
  function pigPreview(i) {
    const out = document.createElement('canvas'); out.width = 132; out.height = 150; out.style.width = '66px'; out.style.height = '75px';
    if (!renderer) return out;
    if (!prev) {
      const c = document.createElement('canvas');
      prev = { r: new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true }), s: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 132 / 150, 1, 400) };
      prev.r.setSize(132, 150, false); prev.r.setClearColor(0, 0);
      prev.s.add(new THREE.HemisphereLight('#ffffff', '#c9d8e0', 2.4));
      const d = new THREE.DirectionalLight('#fff', 1.4); d.position.set(0.4, 1, 1); prev.s.add(d);
      prev.cam.position.set(30, 44, 112); prev.cam.lookAt(0, 24, 0);
    }
    const p = buildPig(i, lookOf(i));
    prev.s.add(p); prev.r.render(prev.s, prev.cam); prev.s.remove(p); p.geometry.dispose();
    out.getContext('2d').drawImage(prev.r.domElement, 0, 0);
    return out;
  }

  /* ---------- Moving bits: gas, sparks, rings ---------- */
  const GAS_CAP = 280, BIT_CAP = 240;
  const gasMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#2c4a00', transparent: true, opacity: 0.86 }), GAS_CAP);
  const bitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), BIT_CAP);
  gasMesh.frustumCulled = bitMesh.frustumCulled = false; scene.add(gasMesh, bitMesh);
  const gasCol = new THREE.Color(), lime = new THREE.Color('#8fe01f'), limeDark = new THREE.Color('#5fbf1a'), fume = new THREE.Color('#c4ec62'), flame = new THREE.Color('#ffae3c');
  const ringMat = () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const ringPool = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 28), ringMat()); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); ringPool.push(m); }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(RAFT_R * 1.15, 24), new THREE.MeshBasicMaterial({ color: '#0f4f96', transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const O = new THREE.Object3D();

  function updateParts() {
    let g = 0, b = 0;
    for (const p of G.parts) {
      const base = hOf(-p.y);
      const age = p.max ? 1 - clamp(p.life / p.max, 0, 1) : 0;
      if (p.kind === 'gas') {
        if (g >= GAS_CAP) continue;
        const fade = Math.min(1, p.life / 0.45), s = Math.min(p.r * 0.62, 15) * fade;
        O.position.set(p.x, base + 16 + age * 34, p.y); O.scale.setScalar(s); O.rotation.set(age * 2, age * 3, 0); O.updateMatrix();
        gasMesh.setMatrixAt(g, O.matrix);
        if (p.rocket) gasCol.copy(flame).lerp(lime, age); else gasCol.copy(g % 3 ? lime : limeDark).lerp(fume, age * 0.8);
        gasMesh.setColorAt(g, gasCol); g++;
      } else {
        if (b >= BIT_CAP) continue;
        const y = p.kind === 'drop' ? base + 4 + (p.z || 0) * 0.4 : base + 18 + age * 46 - age * age * 40;
        const s = p.kind === 'drop' ? p.r * 1.1 : p.r * 1.3;
        O.position.set(p.x, y, p.y); O.scale.setScalar(s); O.rotation.set((p.rot || 0) + age * 8, age * 6, 0); O.updateMatrix();
        bitMesh.setMatrixAt(b, O.matrix);
        gasCol.set(p.kind === 'drop' ? '#ffffff' : p.color || '#ffffff'); bitMesh.setColorAt(b, gasCol); b++;
      }
    }
    gasMesh.count = g; bitMesh.count = b;
    gasMesh.instanceMatrix.needsUpdate = true; bitMesh.instanceMatrix.needsUpdate = true;
    if (gasMesh.instanceColor) gasMesh.instanceColor.needsUpdate = true;
    if (bitMesh.instanceColor) bitMesh.instanceColor.needsUpdate = true;
    ringPool.forEach((m, i) => {
      const r = G.rings[i]; m.visible = !!r;
      if (!r) return;
      const L = T.toLocal(r.x, r.y);
      m.position.set(r.x, surfY(L.d, L.u) + 1, r.y); m.scale.setScalar(r.r * 1.15); m.material.opacity = 0.45 * clamp(r.life, 0, 1);
    });
  }
  function updateBeans(t) {
    if (!beanMesh) return;
    beanBase.forEach((e, i) => {
      const { b, y } = e;
      if (!b || b.got) O.scale.setScalar(0.001);
      else O.scale.set(13, 8.5, 8.5);
      O.position.set(b ? b.x : 0, y + Math.sin(t * 3 + i) * 3, b ? b.y : 0); O.rotation.set(0, t * 2 + i, 0.5); O.updateMatrix();
      beanMesh.setMatrixAt(i, O.matrix);
    });
    beanMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Chase camera ---------- */
  const raftPos = new THREE.Vector3(), up3 = new THREE.Vector3(), camF = { x: 0, z: -1 };
  const camPos = new THREE.Vector3(), lookDir = new THREE.Vector3(), yawQ = new THREE.Quaternion(), tiltQ = new THREE.Quaternion();
  let vf = 70, back = 340, upBy = 200, tilt = 0.25, camFresh = true, orbit = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality >= 2 ? 2 : 1));
    renderer.setSize(W, H, false);
    const aspect = W / Math.max(1, H);
    const vfov = clamp(2 * Math.atan(0.74 / aspect) * 180 / Math.PI, 52, 80);
    camera.fov = vfov; camera.aspect = aspect; camera.updateProjectionMatrix();
    const halfW = Math.tan(vfov * Math.PI / 360) * aspect;       // how much river fits sideways per unit of distance
    const dist = clamp(185 / halfW, 320, 560);                   // keep the whole river in view on narrow phones
    back = dist * 0.77; upBy = dist * 0.64;
    vf = vfov; tilt = Math.atan2(upBy, back) - vfov * 0.13 * Math.PI / 180;
  }
  function resetCamera() { camFresh = true; }
  function updateCamera(dt, t) {
    const L = G.loc, r = G.raft;
    if (!L) return;
    const inRound = G.state === 'playing' || G.state === 'paused';
    const k = camFresh ? 1 : 1 - Math.exp(-3.2 * dt);
    let fx, fz;
    if (inRound || (G.state === 'result' && G.ending)) {
      const ahead = T.frame(L.d + 210);
      fx = ahead.cx - r.x; fz = -(L.d + 210) - r.y;
      orbit = 0;
    } else { orbit += dt * 0.28; fx = Math.sin(orbit + 2.6); fz = Math.cos(orbit + 2.6); }
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    camF.x += (fx - camF.x) * k; camF.z += (fz - camF.z) * k;
    const cl = Math.hypot(camF.x, camF.z) || 1; camF.x /= cl; camF.z /= cl;
    const hero = !inRound && G.state !== 'result';
    const bk = hero ? back * 0.62 : back, ub = hero ? upBy * 0.62 : upBy;
    const tx = r.x - camF.x * bk, tz = r.y - camF.z * bk, ty = raftPos.y + ub;
    const kp = camFresh ? 1 : 1 - Math.exp(-7 * dt);
    camPos.x += (tx - camPos.x) * kp; camPos.z += (tz - camPos.z) * kp; camPos.y += (ty - camPos.y) * kp;
    camFresh = false;
    const sh = G.shake > 0 ? G.shake * 16 : 0;
    camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z);
    // in the menu the camera looks a little below the raft, so it floats clear of the buttons
    const tl = hero ? Math.atan2(ub, bk) + vf * 0.1 * Math.PI / 180 : tilt;
    lookDir.set(camF.x * Math.cos(tl), -Math.sin(tl), camF.z * Math.cos(tl));
    camera.lookAt(camera.position.x + lookDir.x, camera.position.y + lookDir.y, camera.position.z + lookDir.z);
    sky.position.copy(camera.position);
  }
  function updateRaft(t) {
    const r = G.raft, L = G.loc;
    const d = L.d, bob = Math.sin(t * 2.3) * 1.5;
    raftPos.set(r.x, surfY(d, L.u) + 4 + bob, r.y);
    raft.position.copy(raftPos);
    const f = T.frame(d), slope = (hOf(d + 12) - hOf(d - 12)) / 24, bank = bankOf(d);
    const nv = new THREE.Vector3(f.nx, bank, f.ny), tv = new THREE.Vector3(f.fx, slope, f.fy);
    up3.crossVectors(nv, tv).normalize();
    // lean a little into the push
    up3.x -= r.vx * 0.00035 * -1; up3.z -= r.vy * 0.00035 * -1; up3.normalize();
    tiltQ.setFromUnitVectors(Y_AXIS, up3);
    yawQ.setFromAxisAngle(Y_AXIS, -r.ang);
    raft.quaternion.multiplyQuaternions(tiltQ, yawQ);
    const sc = r.scale === undefined ? 1 : Math.max(0.001, r.scale);
    raft.scale.setScalar(sc);
    raft.visible = !(G.invuln > 0 && !G.ending && Math.sin(t * 34) > 0.2);
    shadow.position.set(r.x, surfY(d, L.u) + 0.8, r.y); shadow.scale.setScalar(sc); shadow.visible = sc > 0.05;
    r.riders.forEach((rd, i) => {
      const p = riderViews[i].pig; if (!p) return;
      const a = clamp(rd.anim, 0, 1);
      p.rotation.x = a * 0.5;                                    // lean forward, bottom out
      p.scale.set(1.08 + a * 0.1, 1.14 * (1 - a * 0.12), 1.08 + a * 0.1);
      p.position.x = rd.fizz > 0 ? Math.sin(t * 60) * 0.8 : 0;
      p.position.y = Math.sin(t * 3 + i * 1.7) * 0.4;
    });
  }
  function updateChunks(d) {
    for (const c of chunkMeshes) {
      const near = c.d0 + 720 > d - 700 && c.d0 < d + 3200;
      c.base.visible = c.water.visible = near;
      c.decor.visible = near && quality >= 1;
    }
  }

  /* ---------- Speech bubble and big captions (plain HTML over the 3D) ---------- */
  const bubbleEl = document.getElementById('bubble'), flashEl = document.getElementById('flash');
  let flashShown = null, bubbleShown = null;
  const riderWorld = new THREE.Vector3();
  function project(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, front: p.z < 1 }; }
  function riderPoint(i, y) {
    const a = riderAngleSafe(i);
    return riderWorld.set(raftPos.x + Math.cos(a) * RIDER_DIST, raftPos.y + y, raftPos.z + Math.sin(a) * RIDER_DIST);
  }
  function riderAngleSafe(i) { return G.raft.ang + i * Math.PI / 2; }
  function updateOverlays() {
    const inRound = G.state === 'playing';
    const fl = inRound && G.flash ? G.flash.text : null;
    if (fl !== flashShown) { flashShown = fl; flashEl.classList.toggle('hidden', !fl); if (fl) flashEl.textContent = fl; }
    const q = inRound && G.quip ? G.quip : null;
    if (q !== bubbleShown) {
      bubbleShown = q; bubbleEl.classList.toggle('hidden', !q);
      if (q) { bubbleEl.textContent = q.text; bubbleEl.style.setProperty('--c', q.rider >= 0 ? RIDERS[q.rider].dark : '#1f2a44'); }
    }
    if (q) {
      const v = q.rider >= 0 ? riderPoint(q.rider, 70) : riderWorld.copy(raftPos).setY(raftPos.y + 76);
      const s = project(v), bw = bubbleEl.offsetWidth, bh = bubbleEl.offsetHeight;
      bubbleEl.style.transform = 'translate(' + Math.round(clamp(s.x - bw / 2, 6, W - bw - 6)) + 'px,' + Math.round(clamp(s.y - bh - 8, 90, H - bh - 110)) + 'px)';
    }
  }

  /* ---------- Weak phones: switch off decoration rather than drop frames ---------- */
  let slowMs = 0, slowN = 0;
  function governor(dt) {
    if (G.state !== 'playing' || quality <= 0) return;
    slowMs += dt; slowN++;
    if (slowN >= 120) {
      if (slowMs / slowN > 0.034) { quality--; resize(); }
      slowMs = 0; slowN = 0;
    }
  }

  function render(dt) {
    if (!renderer || !T || !G.raft || !heights) return;
    const t = G.time;
    waterTex.offset.y = t * 0.16;
    updateRaft(t);
    updateCamera(dt, t);
    updateChunks(G.loc.d);
    updateHazards(t, G.loc.d);
    updateBeans(t);
    updateParts();
    updateOverlays();
    governor(dt);
    stackTags();
    renderer.render(scene, camera);
  }

  /* ---------- Input helpers: all relative to the camera ---------- */
  function pick(cx, cy) {
    let best = -1, bd = 40;
    if (G.raft) for (let i = 0; i < 4; i++) {
      const s = project(riderPoint(i, 22)), dd = Math.hypot(s.x - cx, s.y - cy);
      if (dd < bd) { bd = dd; best = i; }
    }
    if (best >= 0) return { rider: best, x: 0, y: 0 };
    const v = new THREE.Vector3((cx / W) * 2 - 1, -(cy / H) * 2 + 1, 0.5).unproject(camera).sub(camera.position);
    const k = v.y < -1e-3 ? (raftPos.y - camera.position.y) / v.y : -1;
    if (k > 0) { const dx = camera.position.x + v.x * k - raftPos.x, dz = camera.position.z + v.z * k - raftPos.z; return { rider: -1, x: dx, y: dz }; }
    return { rider: -1, x: camF.x, y: camF.z };                  // tapped the sky: straight ahead
  }
  function keyDir(kx, ky) { return { x: -camF.z * kx + camF.x * -ky, y: camF.x * kx + camF.z * -ky }; }
  function pushScreenAngle(a) {
    const px = -Math.cos(a), py = -Math.sin(a);
    return Math.atan2(px * -camF.z + py * camF.x, px * camF.x + py * camF.z) * 180 / Math.PI;
  }

  function riderScreen(i) { return project(riderPoint(i, 22)); }
  return { setBadges, riderScreen, buildLevel, render, resize, pick, keyDir, pushScreenAngle, pigPreview, refreshLooks, get quality() { return quality; }, get info() { return renderer ? renderer.info.render : null; } };
})();
