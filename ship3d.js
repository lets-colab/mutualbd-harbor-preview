// Optional ship-to-terminal 3D view for the Harbor Signal concept.
// Raw WebGL 1 with procedural geometry: no dependencies, assets or network requests.
// The DOM panel carries every word; the canvas is decorative and can fail without losing content.

// Blue-hour lighting: a sun just below the horizon, cool ambient sky, warm sodium terminal lights.
const FOG = [0.25, 0.33, 0.41];
const LIGHT = normalize([-0.62, 0.32, 0.5]);
const SODIUM = [1, 0.62, 0.25];
const WHITE_LIGHT = [1, 0.86, 0.62];
const WARNING = [1, 0.22, 0.16];
const COLOR = {
  land: '#2f474d', apron: '#26393f', road: '#1a2a30', pole: '#1c2a30', edge: '#d4d6b7', hull: '#182e3b', deck: '#496672',
  cream: '#e3e2d0', boom: '#d4d6b7', glass: '#244956', funnel: '#baccc1', shed: '#7e9da0', roof: '#b0b5aa',
  booth: '#426b70', lime: '#d7f46c',
};
const CONTAINERS = ['#d8a877', '#426b70', '#b0b5aa', '#c17851', '#7e9da0'];
const SHIP_PATH = [[-72, 36], [-22, 30], [-4, -1.9], [18, -1.9]];
const SHIP_PROGRESS = [0.42, 1, 1, 1];
const CAMERAS = [
  { eye: [-52, 12, 56], target: [-12, 3, 6] },
  { eye: [-6, 11, 28], target: [20, 3.5, -5] },
  { eye: [34, 9, 13], target: [44, 1.5, -9] },
  { eye: [40, 6.5, 6], target: [72, 1, -8] },
];
// Light placement: yard poles stand in the container aisles, quay poles on the berth edge, road poles on the embankment.
const YARD_LIGHTS = [9, 15, 21, 27, 33].flatMap((x) => [[x, -23.4], [x, -18]]);
const QUAY_LIGHT_X = [4, 8, 12, 16, 20, 24, 28, 32, 36];
const ROAD_LIGHT_X = Array.from({ length: 14 }, (_, i) => 44 + i * 12);
// Generic anchored vessels: one cluster west of the terminal, one along the onward road. Fixed seed keeps renders identical.
const ANCHORAGE = (() => {
  const random = seeded(11);
  const out = [];
  for (let i = 0; i < 14; i++) out.push([-40 + random() * 36, -40 + random() * 28]);
  for (let i = 0; i < 12; i++) out.push([72 + random() * 70, 6 + random() * 34]);
  return out;
})();
// Opening shot: almost straight down over the arriving vessel, then settling into Arrival.
const INTRO_CAMERA = { eye: [-23, 75, 25], target: [-23, 0, 19] };
const NOTICE = "The 3D view isn't available right now. The stops below still work, or exit to the page.";

export function open({ stops, returnFocus }) {
  if (document.querySelector('.ship3d')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ui = buildDialog(stops.length, reduced);
  const inerted = [...document.body.children].filter((el) => !el.inert);
  inerted.forEach((el) => { el.inert = true; });
  document.body.appendChild(ui.root);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  history.pushState({ ...(history.state || {}), ship3dOpen: true }, '');

  let current = 0;
  let closed = false;
  const scene = createScene(ui.canvas, reduced, () => fallback());
  if (!scene) fallback();
  else ui.root.dataset.state = 'ready';

  function fallback() {
    ui.root.dataset.state = 'fallback';
    ui.notice.hidden = false;
    ui.canvas.hidden = true;
  }

  function go(index) {
    const next = Math.max(0, Math.min(stops.length - 1, index));
    if (next === current && ui.root.dataset.stop) return;
    current = next;
    const stop = stops[current];
    ui.root.dataset.stop = String(current);
    ui.index.textContent = `${String(current + 1).padStart(2, '0')} / ${String(stops.length).padStart(2, '0')}`;
    ui.stage.textContent = stop.stage;
    ui.title.textContent = stop.title;
    ui.text.textContent = stop.text;
    ui.prev.setAttribute('aria-disabled', String(current === 0));
    ui.next.setAttribute('aria-disabled', String(current === stops.length - 1));
    ui.bars.forEach((bar, i) => bar.classList.toggle('is-active', i <= current));
    scene?.goTo(current);
  }

  function close(fromHistory) {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPop);
    scene?.dispose();
    ui.root.remove();
    inerted.forEach((el) => { el.inert = false; });
    document.body.style.overflow = previousOverflow;
    if (!fromHistory && history.state && history.state.ship3dOpen) history.back();
    returnFocus?.focus({ preventScroll: true });
  }

  function onPop() { close(true); }
  window.addEventListener('popstate', onPop);

  ui.prev.addEventListener('click', () => go(current - 1));
  ui.next.addEventListener('click', () => go(current + 1));
  ui.exit.addEventListener('click', () => close(false));
  ui.root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(false); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); go(current + 1); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); go(current - 1); }
    else if (event.key === 'Tab') trapFocus(event, ui.root);
  });

  let swipeX = null;
  ui.stageEl.addEventListener('pointerdown', (event) => { swipeX = [event.clientX, event.clientY]; });
  ui.stageEl.addEventListener('pointerup', (event) => {
    if (!swipeX) return;
    const dx = event.clientX - swipeX[0];
    const dy = event.clientY - swipeX[1];
    swipeX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(current + (dx < 0 ? 1 : -1));
  });
  ui.stageEl.addEventListener('pointermove', (event) => scene?.parallax(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1));

  go(0);
  ui.root.focus();
}

function trapFocus(event, root) {
  const items = [...root.querySelectorAll('button')].filter((b) => !b.hidden && b.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (active === last || !root.contains(active))) { event.preventDefault(); first.focus(); }
}

function buildDialog(count, reduced) {
  const root = document.createElement('div');
  root.className = 'ship3d';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'ship3dHeading');
  root.tabIndex = -1;
  root.dataset.motion = reduced ? 'reduced' : 'full';
  root.innerHTML = `
    <div class="ship3d-stage"><canvas aria-hidden="true"></canvas>
      <p class="ship3d-notice" role="status" hidden>${NOTICE}</p></div>
    <header class="ship3d-top">
      <div><h2 id="ship3dHeading">Ship-to-terminal view</h2>
        <p class="ship3d-disclaimer">Concept visualization · not live operations or an actual facility</p></div>
      <button class="ship3d-exit" type="button">Exit 3D view <span aria-hidden="true">Esc</span></button>
    </header>
    <section class="ship3d-panel" aria-live="polite" aria-atomic="true">
      <p class="ship3d-meta"><span id="ship3dIndex"></span><span id="ship3dStage"></span></p>
      <h3 id="ship3dStopTitle"></h3>
      <p id="ship3dText"></p>
    </section>
    <nav class="ship3d-controls" aria-label="Stops">
      <button class="ship3d-prev" type="button" aria-label="Previous stop"><span aria-hidden="true">←</span></button>
      <div class="ship3d-bars" aria-hidden="true">${'<span></span>'.repeat(count)}</div>
      <button class="ship3d-next" type="button" aria-label="Next stop"><span aria-hidden="true">→</span></button>
    </nav>`;
  const q = (s) => root.querySelector(s);
  return {
    root, canvas: q('canvas'), stageEl: q('.ship3d-stage'), notice: q('.ship3d-notice'), exit: q('.ship3d-exit'),
    index: q('#ship3dIndex'), stage: q('#ship3dStage'), title: q('#ship3dStopTitle'), text: q('#ship3dText'),
    prev: q('.ship3d-prev'), next: q('.ship3d-next'), bars: [...root.querySelectorAll('.ship3d-bars span')],
  };
}

// ---------------------------------------------------------------- scene

function createScene(canvas, reduced, onLost) {
  let gl;
  try { gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power' }); }
  catch (error) { gl = null; } // A throwing getContext is treated the same as an unsupported device.
  if (!gl) return null;

  let programs;
  try {
    programs = {
      solid: program(gl, SOLID_VS, SOLID_FS),
      water: program(gl, WATER_VS, WATER_FS),
      signal: program(gl, SIGNAL_VS, SIGNAL_FS),
      sky: program(gl, SKY_VS, SKY_FS),
      glow: program(gl, GLOW_VS, GLOW_FS),
    };
  } catch (error) {
    return null; // Shader failure leaves the text panel as the experience.
  }

  const meshes = {
    world: uploadSolid(gl, buildWorld()),
    ship: uploadSolid(gl, buildShip()),
    truck: uploadSolid(gl, buildTruck()),
    beacon: uploadSolid(gl, buildBeacon()),
    water: uploadWater(gl),
    signal: uploadSignal(gl),
    sky: upload(gl, [-1, -1, 3, -1, -1, 3]),
    worldLights: upload(gl, buildWorldLights(), 10),
    shipLights: upload(gl, buildShipLights(), 10),
  };

  const camera = { from: CAMERAS[0], to: CAMERAS[0], progressFrom: SHIP_PROGRESS[0], progressTo: SHIP_PROGRESS[0], start: 0, duration: 1 };
  let stopIndex = 0;
  let introPending = !reduced;
  let truckClock = 0;
  let pointer = [0, 0];
  let pointerSmooth = [0, 0];
  let raf = 0;
  let disposed = false;
  let lost = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    request();
  }

  function request() { if (!raf && !disposed && !lost) raf = requestAnimationFrame(frame); }

  function frame(now) {
    raf = 0;
    if (disposed || lost) return;
    draw(reduced ? 0 : now / 1000, now);
    if (!reduced && !document.hidden) request();
  }

  function draw(time, now) {
    const k = reduced ? 1 : ease(Math.min(1, (now - camera.start) / camera.duration));
    pointerSmooth = pointerSmooth.map((v, i) => v + (pointer[i] - v) * 0.05);
    const eye = lerp3(camera.from.eye, camera.to.eye, k);
    const target = lerp3(camera.from.target, camera.to.target, k);
    eye[0] += pointerSmooth[0] * 2.2;
    eye[1] -= pointerSmooth[1] * 1.2;
    const aspect = canvas.width / canvas.height;
    const fov = aspect < 1 ? 1.02 : 0.66;
    const viewProj = mul(perspective(fov, aspect, 0.5, 400), lookAt(eye, target));

    const progress = camera.progressFrom + (camera.progressTo - camera.progressFrom) * k;
    const [sx, sz] = bezier(SHIP_PATH, progress);
    const [tx, tz] = bezierTangent(SHIP_PATH, Math.min(progress, 0.999));
    const ship = model(sx, reduced ? 0 : Math.sin(time * 1.3) * 0.06, sz, Math.atan2(-tz, tx));
    // Onward: the truck leaves the gate and fades into the haze down the road, then a new one sets off.
    const truckX = stopIndex === 3 ? (reduced ? 58 : 50 + ((time - truckClock) * 5) % 150) : 36;
    const truck = model(truckX, 0.83, -7.5, 0);
    const beaconAt = [[sx, 6.5, sz], [18, 10.5, -1.9], [40, 5.6, -7.5], [truckX, 3.6, -7.5]][stopIndex];
    const beacon = model(beaconAt[0], beaconAt[1] + (reduced ? 0 : Math.sin(time * 2) * 0.3), beaconAt[2], reduced ? 0 : time * 0.8);

    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const w = programs.water;
    use(w);
    gl.uniformMatrix4fv(w.u.uViewProj, false, viewProj);
    gl.uniform1f(w.u.uTime, time);
    gl.uniform1f(w.u.uRipple, time % 1000);
    shared(w, eye);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshes.water.buf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshes.water.index);
    attrib(w, 'aXZ', 2, 2, 0);
    gl.drawElements(gl.TRIANGLES, meshes.water.count, gl.UNSIGNED_SHORT, 0);

    const g = programs.signal;
    use(g);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(g.u.uViewProj, false, viewProj);
    gl.uniform1f(g.u.uTime, time);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshes.signal.buf);
    attrib(g, 'aPos', 3, 4, 0);
    attrib(g, 'aU', 1, 4, 3);
    gl.drawArrays(gl.TRIANGLES, 0, meshes.signal.count);
    gl.disable(gl.BLEND);

    const s = programs.solid;
    use(s);
    gl.uniformMatrix4fv(s.u.uViewProj, false, viewProj);
    shared(s, eye);
    solid(s, meshes.world, IDENTITY, 0);
    solid(s, meshes.ship, ship, 0);
    solid(s, meshes.truck, truck, 0);
    solid(s, meshes.beacon, beacon, 1);

    // Sky last, at the far plane, so it shades only pixels no geometry covered.
    const sky = programs.sky;
    use(sky);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.uniform1f(sky.u.uPitch, Math.atan2(target[1] - eye[1], Math.hypot(target[0] - eye[0], target[2] - eye[2])));
    gl.uniform1f(sky.u.uTanHalfFov, Math.tan(fov / 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, meshes.sky.buf);
    attrib(sky, 'aPos', 2, 2, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LESS);

    // Lights are additive glow: occluded by geometry, never occluding it.
    const glow = programs.glow;
    use(glow);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.uniformMatrix4fv(glow.u.uViewProj, false, viewProj);
    gl.uniform3fv(glow.u.uCam, eye);
    gl.uniform1f(glow.u.uTime, time);
    lights(glow, meshes.worldLights, IDENTITY);
    lights(glow, meshes.shipLights, ship);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function lights(p, mesh, matrix) {
    gl.uniformMatrix4fv(p.u.uModel, false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    attrib(p, 'aCenter', 3, 10, 0);
    attrib(p, 'aCorner', 2, 10, 3);
    attrib(p, 'aKind', 1, 10, 5);
    attrib(p, 'aColor', 3, 10, 6);
    attrib(p, 'aSize', 1, 10, 9);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  // Arrays left enabled by the previous program would point at the wrong buffers.
  function use(p) {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.useProgram(p.id);
  }

  function shared(p, eye) {
    gl.uniform3fv(p.u.uLight, LIGHT);
    gl.uniform3fv(p.u.uFog, FOG);
    gl.uniform2f(p.u.uFogRange, 45, 170);
    gl.uniform3fv(p.u.uCam, eye);
  }

  function solid(p, mesh, matrix, emissive) {
    gl.uniformMatrix4fv(p.u.uModel, false, matrix);
    gl.uniform1f(p.u.uEmissive, emissive);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    attrib(p, 'aPos', 3, 9, 0);
    attrib(p, 'aNormal', 3, 9, 3);
    attrib(p, 'aColor', 3, 9, 6);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  function attrib(p, name, size, stride, offset) {
    const loc = p.a[name];
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
  }

  function onContextLost(event) {
    event.preventDefault();
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    onLost();
  }
  function onVisibility() { if (!document.hidden) request(); }

  canvas.addEventListener('webglcontextlost', onContextLost);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize);
  resize();

  return {
    goTo(index) {
      const now = performance.now();
      const k = reduced ? 1 : ease(Math.min(1, (now - camera.start) / camera.duration));
      const here = {
        eye: lerp3(camera.from.eye, camera.to.eye, k),
        target: lerp3(camera.from.target, camera.to.target, k),
      };
      const progressHere = camera.progressFrom + (camera.progressTo - camera.progressFrom) * k;
      camera.from = introPending ? INTRO_CAMERA : here;
      camera.to = CAMERAS[index];
      camera.progressFrom = progressHere;
      camera.progressTo = SHIP_PROGRESS[index];
      camera.start = now;
      camera.duration = introPending ? 3600 : 1600 + 900 * Math.abs(camera.progressTo - progressHere);
      introPending = false;
      if (index === 3 && stopIndex !== 3) truckClock = now / 1000;
      stopIndex = index;
      request();
    },
    parallax(x, y) { if (!reduced) pointer = [x, y]; },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      if (lost) return;
      for (const mesh of Object.values(meshes)) {
        gl.deleteBuffer(mesh.buf);
        if (mesh.index) gl.deleteBuffer(mesh.index);
      }
      for (const p of Object.values(programs)) gl.deleteProgram(p.id);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

// ---------------------------------------------------------------- geometry

function meshBuilder() {
  const data = [];
  function tri(a, b, c, color, center) {
    let n = normalize(cross(sub(b, a), sub(c, a)));
    const mid = [(a[0] + b[0] + c[0]) / 3 - center[0], (a[1] + b[1] + c[1]) / 3 - center[1], (a[2] + b[2] + c[2]) / 3 - center[2]];
    if (dot(n, mid) < 0) n = n.map((v) => -v);
    for (const p of [a, b, c]) data.push(p[0], p[1], p[2], n[0], n[1], n[2], color[0], color[1], color[2]);
  }
  function quad(a, b, c, d, color, center) { tri(a, b, c, color, center); tri(a, c, d, color, center); }
  function box(x1, y1, z1, x2, y2, z2, hexColor) {
    const c = rgb(hexColor);
    const m = [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2];
    const v = [[x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1], [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
    for (const [a, b, d, e] of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]) quad(v[a], v[b], v[d], v[e], c, m);
  }
  function prism(footprint, y1, y2, hexColor) {
    const c = rgb(hexColor);
    const cx = footprint.reduce((s, p) => s + p[0], 0) / footprint.length;
    const cz = footprint.reduce((s, p) => s + p[1], 0) / footprint.length;
    const m = [cx, (y1 + y2) / 2, cz];
    for (let i = 0; i < footprint.length; i++) {
      const [ax, az] = footprint[i];
      const [bx, bz] = footprint[(i + 1) % footprint.length];
      quad([ax, y1, az], [bx, y1, bz], [bx, y2, bz], [ax, y2, az], c, m);
      tri([cx, y2, cz], [ax, y2, az], [bx, y2, bz], c, m);
      tri([cx, y1, cz], [ax, y1, az], [bx, y1, bz], c, m);
    }
  }
  return { data, tri, box, prism };
}

function buildWorld() {
  const b = meshBuilder();
  b.box(2, -1, -42, 66, 0.8, -4, COLOR.land);
  b.box(2, 0.8, -10, 38, 0.81, -4.15, COLOR.apron);
  b.box(2, 0.6, -4.15, 66, 0.82, -3.95, COLOR.edge);
  b.box(66, -1, -9.6, 230, 0.8, -5.4, COLOR.land);
  b.box(38, 0.8, -9, 230, 0.83, -6, COLOR.road);
  for (const x of [10, 18, 26]) {
    for (const lx of [-1.6, 1.6]) for (const lz of [-9, -5]) b.box(x + lx - 0.18, 0.8, lz - 0.18, x + lx + 0.18, 7.6, lz + 0.18, COLOR.cream);
    b.box(x - 1.8, 7, -9.3, x + 1.8, 7.6, -4.7, COLOR.cream);
    b.box(x - 0.35, 7.6, -11.5, x + 0.35, 8.2, 5.5, COLOR.boom);
    b.box(x - 0.5, 6.8, 1.6, x + 0.5, 7.6, 2.6, COLOR.glass);
  }
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let col = 0; col < 9; col++) {
    for (let row = 0; row < 10; row++) {
      if (row % 4 === 3) continue;
      const tiers = Math.floor(random() * 4);
      const x = 8 + col * 2.9;
      const z = -28 + row * 1.35;
      for (let t = 0; t < tiers; t++) {
        b.box(x, 0.8 + t * 1.12, z, x + 2.6, 0.8 + t * 1.12 + 1.1, z + 1.15, CONTAINERS[Math.floor(random() * CONTAINERS.length)]);
      }
    }
  }
  b.box(36, 0.8, -30, 48, 4, -15, COLOR.shed);
  b.box(35.8, 4, -30.2, 48.2, 4.3, -14.8, COLOR.roof);
  b.box(39.6, 0.8, -9.6, 40, 3.6, -9.2, COLOR.cream);
  b.box(39.6, 0.8, -5.8, 40, 3.6, -5.4, COLOR.cream);
  b.box(38.8, 3.6, -10, 41, 4, -5, COLOR.cream);
  b.box(40.6, 0.8, -10.6, 41.6, 2.6, -9.8, COLOR.booth);
  b.box(39.7, 1.6, -9.2, 39.9, 1.75, -6.6, COLOR.lime);
  for (const [x, z] of YARD_LIGHTS) b.box(x - 0.12, 0.8, z - 0.12, x + 0.12, 9, z + 0.12, COLOR.pole);
  for (const x of QUAY_LIGHT_X) b.box(x - 0.1, 0.8, -4.7, x + 0.1, 7, -4.5, COLOR.pole);
  for (const x of ROAD_LIGHT_X) b.box(x - 0.1, 0.8, -9.4, x + 0.1, 6, -9.2, COLOR.pole);
  for (const [x, z] of ANCHORAGE) {
    b.box(x - 2.2, -0.4, z - 0.6, x + 2.2, 0.9, z + 0.6, COLOR.hull);
    b.box(x - 2, 0.9, z - 0.5, x - 1, 1.6, z + 0.5, COLOR.cream);
  }
  return b.data;
}

function buildShip() {
  const b = meshBuilder();
  const hull = [[-8, -1.6], [5.6, -1.6], [8.2, 0], [5.6, 1.6], [-8, 1.6]];
  b.prism(hull, -0.6, 1, COLOR.hull);
  b.prism(hull.map(([x, z]) => [x * 1.005, z * 1.03]), 0.55, 0.75, COLOR.edge);
  b.prism(hull.map(([x, z]) => [x * 0.97, z * 0.9]), 1, 1.06, COLOR.deck);
  CONTAINERS.forEach((_, col) => {
    const x = -5 + col * 2.15;
    for (const [z1, z2] of [[-1.3, -0.1], [0.1, 1.3]]) {
      const tiers = col === 0 || col === 4 ? 2 : 3;
      for (let t = 0; t < tiers; t++) b.box(x, 1.06 + t * 1.02, z1, x + 2, 2.06 + t * 1.02, z2, CONTAINERS[(col + t + (z1 < 0 ? 0 : 2)) % CONTAINERS.length]);
    }
  });
  b.box(-7.6, 1.06, -1.3, -6, 4.2, 1.3, COLOR.cream);
  b.box(-7.7, 3.4, -1.4, -5.9, 3.8, 1.4, COLOR.glass);
  b.box(-7.3, 4.2, -0.35, -6.6, 5, 0.35, COLOR.funnel);
  return b.data;
}

function buildTruck() {
  const b = meshBuilder();
  b.box(-2, 0.3, -0.55, 1.6, 0.5, 0.55, COLOR.hull);
  b.box(1.6, 0.35, -0.55, 2.6, 1.6, 0.55, COLOR.cream);
  b.box(2.3, 1.1, -0.58, 2.62, 1.45, 0.58, COLOR.glass);
  b.box(-1.9, 0.5, -0.55, 1.5, 1.6, 0.55, CONTAINERS[3]);
  for (const x of [-1.5, 0.2, 2.1]) for (const z of [-0.62, 0.48]) b.box(x - 0.25, 0, z, x + 0.25, 0.4, z + 0.14, COLOR.hull);
  return b.data;
}

function buildBeacon() {
  const b = meshBuilder();
  const c = rgb(COLOR.lime);
  const r = 0.55;
  const top = [0, r * 1.4, 0];
  const bottom = [0, -r * 1.4, 0];
  const ring = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]];
  for (let i = 0; i < 4; i++) {
    b.tri(top, ring[i], ring[(i + 1) % 4], c, [0, 0, 0]);
    b.tri(bottom, ring[i], ring[(i + 1) % 4], c, [0, 0, 0]);
  }
  return b.data;
}

// Each light is one or more quads: a camera-facing glow, a flat pool on the ground, or a reflection streak on the water.
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
const SPRITE = 0;
const POOL = 1;
const STREAK = 2;

function glowQuad(out, [x, y, z], kind, color, size) {
  for (const [cx, cz] of CORNERS) out.push(x, y, z, cx, cz, kind, color[0], color[1], color[2], size);
}
function dim(color, k) { return color.map((v) => v * k); }

function buildWorldLights() {
  const out = [];
  for (const [x, z] of YARD_LIGHTS) {
    glowQuad(out, [x, 9.2, z], SPRITE, SODIUM, 1.4);
    glowQuad(out, [x, 0.86, z], POOL, dim(SODIUM, 0.6), 6);
  }
  for (const x of QUAY_LIGHT_X) {
    glowQuad(out, [x, 7.2, -4.6], SPRITE, SODIUM, 1.3);
    glowQuad(out, [x, 0.86, -6.6], POOL, dim(SODIUM, 0.5), 4.5);
    glowQuad(out, [x, 0, -3.6], STREAK, dim(SODIUM, 0.8), 1.2);
  }
  for (const x of ROAD_LIGHT_X) {
    glowQuad(out, [x, 6.2, -9.3], SPRITE, SODIUM, 1.2);
    glowQuad(out, [x, 0.87, -8], POOL, dim(SODIUM, 0.45), 3.5);
    glowQuad(out, [x, 0, x > 66 ? -4.8 : -3.6], STREAK, dim(SODIUM, 0.6), 1);
  }
  for (const z of [-9.2, -5.8]) glowQuad(out, [39.8, 3.9, z], SPRITE, WHITE_LIGHT, 1);
  glowQuad(out, [40, 0.87, -7.5], POOL, dim(WHITE_LIGHT, 0.5), 4);
  for (const x of [38, 42, 46]) {
    glowQuad(out, [x, 3.7, -14.6], SPRITE, SODIUM, 1);
    glowQuad(out, [x, 0.86, -13], POOL, dim(SODIUM, 0.4), 3);
  }
  for (const x of [10, 18, 26]) for (const z of [5.4, -11.4]) glowQuad(out, [x, 8.5, z], SPRITE, WARNING, 0.7);
  for (const [x, z] of ANCHORAGE) {
    glowQuad(out, [x, 1.9, z], SPRITE, WHITE_LIGHT, 0.9);
    glowQuad(out, [x, 0, z + 0.8], STREAK, dim(WHITE_LIGHT, 0.6), 0.8);
  }
  return out;
}

function buildShipLights() {
  const out = [];
  for (const z of [-1.45, 1.45]) glowQuad(out, [-6.8, 3.6, z], SPRITE, WHITE_LIGHT, 0.8);
  glowQuad(out, [-6.95, 5.5, 0], SPRITE, WHITE_LIGHT, 0.7);
  glowQuad(out, [8, 1.5, 0], SPRITE, WHITE_LIGHT, 0.6);
  glowQuad(out, [0, 4.6, 0], SPRITE, SODIUM, 1);
  return out;
}

function upload(gl, data, stride = 2) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buf, count: data.length / stride };
}

function uploadSolid(gl, data) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buf, count: data.length / 9 };
}

function uploadWater(gl) {
  const cols = 120;
  const rows = 72;
  const verts = [];
  const index = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) verts.push(-140 + (c / cols) * 400, -90 + (r / rows) * 180);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      index.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
    }
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ibuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(index), gl.STATIC_DRAW);
  return { buf, index: ibuf, count: index.length };
}

function uploadSignal(gl) {
  const sea = [];
  for (let i = 0; i <= 90; i++) {
    const [x, z] = bezier(SHIP_PATH, i / 90);
    sea.push([x, 0.26, z]);
  }
  const land = [[18, 0.86, -4.6], [28, 0.86, -7.5], [40, 0.86, -7.5], [200, 0.86, -7.5]];
  const data = [];
  const seaLength = ribbon(sea, 0.42, 0, data);
  ribbon(land, 0.34, seaLength, data);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buf, count: data.length / 4 };
}

// Flat ribbon in the XZ plane; returns the distance travelled so a second segment can continue the pulse.
function ribbon(points, width, startU, out) {
  let u = startU;
  const edges = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const t = normalize([b[0] - a[0], 0, b[2] - a[2]]);
    if (i > 0) u += Math.hypot(p[0] - points[i - 1][0], p[2] - points[i - 1][2]);
    const side = [-t[2] * width / 2, 0, t[0] * width / 2];
    return { l: [p[0] + side[0], p[1], p[2] + side[2]], r: [p[0] - side[0], p[1], p[2] - side[2]], u };
  });
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i];
    const b = edges[i + 1];
    for (const [p, pu] of [[a.l, a.u], [a.r, a.u], [b.l, b.u], [a.r, a.u], [b.r, b.u], [b.l, b.u]]) out.push(p[0], p[1], p[2], pu);
  }
  return u;
}

// ---------------------------------------------------------------- shaders

const SOLID_VS = `
attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;
uniform mat4 uViewProj; uniform mat4 uModel;
varying vec3 vNormal; varying vec3 vColor; varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz; vNormal = mat3(uModel) * aNormal; vColor = aColor;
  gl_Position = uViewProj * world;
}`;
const SOLID_FS = `
precision mediump float;
varying vec3 vNormal; varying vec3 vColor; varying vec3 vWorld;
uniform vec3 uLight; uniform vec3 uFog; uniform vec2 uFogRange; uniform vec3 uCam; uniform float uEmissive;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, uLight), 0.0);
  vec3 ambient = vec3(0.34, 0.40, 0.52) * (0.6 + 0.4 * (0.5 + 0.5 * n.y));
  vec3 lit = vColor * (ambient + vec3(0.92, 0.70, 0.55) * 0.5 * diffuse);
  lit = mix(lit, vColor, uEmissive);
  float fog = smoothstep(uFogRange.x, uFogRange.y, distance(vWorld, uCam)) * (1.0 - uEmissive * 0.8);
  gl_FragColor = vec4(mix(lit, uFog, fog), 1.0);
}`;
// Blue-hour sky by view elevation (radians): warm glow on the horizon, lilac, dusk blue, deep zenith.
const SKY_GLSL = `
vec3 skyColour(float e) {
  vec3 haze = vec3(0.25, 0.33, 0.41);
  vec3 glow = vec3(0.90, 0.60, 0.45);
  vec3 lilac = vec3(0.66, 0.50, 0.58);
  vec3 dusk = vec3(0.20, 0.33, 0.50);
  vec3 zenith = vec3(0.04, 0.10, 0.21);
  if (e < 0.0) return mix(glow, haze, smoothstep(0.0, 0.06, -e));
  vec3 c = mix(glow, lilac, smoothstep(0.0, 0.07, e));
  c = mix(c, dusk, smoothstep(0.08, 0.24, e));
  return mix(c, zenith, smoothstep(0.24, 0.7, e));
}`;
const SKY_VS = `
attribute vec2 aPos;
varying float vNdcY;
void main() { vNdcY = aPos.y; gl_Position = vec4(aPos, 1.0, 1.0); }`;
const SKY_FS = `
precision mediump float;
varying float vNdcY;
uniform float uPitch; uniform float uTanHalfFov;
${SKY_GLSL}
void main() { gl_FragColor = vec4(skyColour(uPitch + atan(vNdcY * uTanHalfFov)), 1.0); }`;
const GLOW_VS = `
attribute vec3 aCenter; attribute vec2 aCorner; attribute float aKind; attribute vec3 aColor; attribute float aSize;
uniform mat4 uViewProj; uniform mat4 uModel; uniform vec3 uCam;
varying vec2 vUV; varying vec3 vColor; varying float vKind; varying float vFade;
void main() {
  vec3 c = (uModel * vec4(aCenter, 1.0)).xyz;
  vec3 p;
  if (aKind < 0.5) {
    vec3 f = normalize(uCam - c);
    vec3 r = cross(vec3(0.0, 1.0, 0.0), f);
    r = length(r) < 0.001 ? vec3(1.0, 0.0, 0.0) : normalize(r);
    p = c + (r * aCorner.x + cross(f, r) * aCorner.y) * aSize;
  } else if (aKind < 1.5) {
    p = c + vec3(aCorner.x, 0.0, aCorner.y) * aSize;
  } else {
    vec2 d = normalize(uCam.xz - c.xz);
    vec2 side = vec2(-d.y, d.x);
    vec2 xz = c.xz + side * aCorner.x * aSize * 0.35 + d * (aCorner.y * 0.5 + 0.5) * aSize * 6.0;
    p = vec3(xz.x, 0.23, xz.y);
  }
  vUV = aCorner; vColor = aColor; vKind = aKind;
  vFade = 1.0 - 0.65 * smoothstep(60.0, 230.0, distance(p, uCam));
  gl_Position = uViewProj * vec4(p, 1.0);
}`;
const GLOW_FS = `
precision mediump float;
varying vec2 vUV; varying vec3 vColor; varying float vKind; varying float vFade;
uniform float uTime;
void main() {
  float d = length(vUV);
  float a;
  if (vKind < 0.5) a = pow(max(1.0 - d, 0.0), 2.4) * 1.15;
  else if (vKind < 1.5) a = pow(max(1.0 - d, 0.0), 1.8) * 0.32;
  else {
    float along = vUV.y * 0.5 + 0.5;
    float ripple = 0.55 + 0.45 * sin(along * 38.0 - uTime * 2.6 + vUV.x * 3.0);
    a = (1.0 - abs(vUV.x)) * (1.0 - along) * ripple * 0.55;
  }
  gl_FragColor = vec4(vColor * a * vFade, 1.0);
}`;
const WATER_VS = `
attribute vec2 aXZ;
uniform mat4 uViewProj; uniform float uTime;
varying vec3 vWorld; varying vec3 vNormal;
float height(vec2 p) {
  return 0.10 * sin(p.x * 0.35 + uTime * 0.9) + 0.07 * sin(p.y * 0.5 - uTime * 1.1) + 0.04 * sin((p.x + p.y) * 0.9 + uTime * 1.7);
}
void main() {
  float e = 0.25;
  vNormal = normalize(vec3(height(aXZ - vec2(e, 0.0)) - height(aXZ + vec2(e, 0.0)), 2.0 * e,
                           height(aXZ - vec2(0.0, e)) - height(aXZ + vec2(0.0, e))));
  vWorld = vec3(aXZ.x, height(aXZ), aXZ.y);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}`;
const WATER_FS = `
precision mediump float;
varying vec3 vWorld; varying vec3 vNormal;
uniform vec3 uCam; uniform vec3 uLight; uniform vec3 uFog; uniform vec2 uFogRange;
// Separate from the vertex stage's highp uTime: a uniform shared across stages must match precision or linking fails.
uniform float uRipple;
${SKY_GLSL}
void main() {
  // Fine ripples per pixel break the broad wave reflections into water-scale detail.
  vec3 ripple = vec3(sin(vWorld.x * 1.7 + vWorld.z * 0.6 + uRipple * 1.3), 0.0, cos(vWorld.z * 2.1 - vWorld.x * 0.4 - uRipple * 1.1)) * 0.07;
  vec3 n = normalize(vNormal + ripple);
  vec3 view = normalize(uCam - vWorld);
  float fresnel = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  vec3 sky = skyColour(asin(clamp(reflect(-view, n).y, -1.0, 1.0)));
  vec3 colour = mix(vec3(0.02, 0.07, 0.11), sky, 0.1 + 0.6 * fresnel);
  float glint = pow(max(dot(reflect(-uLight, n), view), 0.0), 40.0);
  colour += vec3(0.95, 0.62, 0.45) * glint * 0.35;
  float fog = smoothstep(uFogRange.x, uFogRange.y, distance(vWorld, uCam));
  gl_FragColor = vec4(mix(colour, uFog, fog), 1.0);
}`;
const SIGNAL_VS = `
attribute vec3 aPos; attribute float aU;
uniform mat4 uViewProj;
varying float vU;
void main() { vU = aU; gl_Position = uViewProj * vec4(aPos, 1.0); }`;
const SIGNAL_FS = `
precision mediump float;
varying float vU;
uniform float uTime;
void main() {
  float phase = fract(vU * 0.04 - uTime * 0.25);
  float pulse = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.08, 0.35, phase));
  vec3 lime = vec3(0.843, 0.957, 0.424);
  gl_FragColor = vec4(mix(lime, vec3(1.0, 1.0, 0.86), pulse * 0.6), 0.85 + 0.15 * pulse);
}`;

function program(gl, vsSource, fsSource) {
  const id = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vsSource], [gl.FRAGMENT_SHADER, fsSource]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    gl.attachShader(id, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(id);
  if (!gl.getProgramParameter(id, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(id) || 'program link failed');
  const lookup = (count, getter, locator) => {
    const out = {};
    for (let i = 0; i < gl.getProgramParameter(id, count); i++) {
      const { name } = getter.call(gl, id, i);
      out[name] = locator.call(gl, id, name);
    }
    return out;
  };
  return {
    id,
    a: lookup(gl.ACTIVE_ATTRIBUTES, gl.getActiveAttrib, gl.getAttribLocation),
    u: lookup(gl.ACTIVE_UNIFORMS, gl.getActiveUniform, gl.getUniformLocation),
  };
}

// ---------------------------------------------------------------- math

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function seeded(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function rgb(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function lerp3(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function bezier([p0, p1, p2, p3], t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
function bezierTangent([p0, p1, p2, p3], t) {
  const u = 1 - t;
  const a = 3 * u * u, b = 6 * u * t, c = 3 * t * t;
  return [a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]), a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1])];
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(eye, target) {
  const z = normalize(sub(eye, target));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
function mul(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    out[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
  }
  return out;
}
function model(x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]);
}
