// MutualBD Voyage — chapter controller and footage compositor (concept).
// Content lives in the HTML; this module only adds the moving backdrop, intro and navigation state.

const root = document.documentElement;
root.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const saveData = navigator.connection?.saveData === true;
root.dataset.motion = reduced ? 'reduced' : 'full';

// ---------------------------------------------------------------- scene ontology
// Footage generated for the concept (Google Flow). Each chapter is a framing of one clip:
// crop = [x, y, w, h] of the source frame (0–1, top-left), zoom = [start, end] over the chapter hold,
// focus = point kept in view on narrow screens (0–1 within the crop), dim = exposure.
const MEDIA = {
  sea: 'media/sea',           // container ship at sea, aerial
  terminal: 'media/terminal', // container yard and terminal gate
  river: 'media/river',       // coastal vessel on a river
  road: 'media/road',         // truck on the coastal highway
};
const SCENES = [
  { media: 'sea', crop: [0, 0, 1, 1], zoom: [1.06, 1.18], focus: [0.5, 0.45], dim: 1 },            // 01 Since 1962
  { media: 'sea', crop: [0.18, 0.02, 0.62, 0.62], zoom: [1.0, 1.14], focus: [0.55, 0.5], dim: 1.05 }, // 02 Arrival — Mutual Shipping
  { media: 'terminal', crop: [0.3, 0.06, 0.6, 0.6], zoom: [1.0, 1.1], focus: [0.62, 0.4], dim: 1.05 }, // 03 Berth — cranes, quay lights and gate
  { media: 'terminal', crop: [0, 0, 1, 1], zoom: [1.02, 1.14], focus: [0.62, 0.5], dim: 1 },          // 04 Clearance — yard and gate
  { media: 'river', crop: [0, 0, 1, 1], zoom: [1.02, 1.14], focus: [0.62, 0.5], dim: 1 },             // 05 River — Central Navigation
  { media: 'road', crop: [0, 0, 1, 1], zoom: [1.02, 1.12], focus: [0.55, 0.6], dim: 1 },              // 06 Road — Modern Logistics
  { media: 'road', crop: [0.42, 0.14, 0.58, 0.58], zoom: [1.0, 1.1], focus: [0.5, 0.45], dim: 0.9 },  // 07 Beyond — the lit port and city edge
  { media: 'sea', crop: [0, 0, 1, 1], zoom: [1.22, 1.3], focus: [0.5, 0.5], dim: 0.5 },               // The group
  { media: 'sea', crop: [0, 0, 1, 1], zoom: [1.3, 1.38], focus: [0.5, 0.5], dim: 0.45 },              // Contact
];

const $ = (s) => document.querySelector(s);
const sections = [...document.querySelectorAll('main .chapter')];
const railLinks = [...document.querySelectorAll('.rail a')];
const canvas = $('#scene');
const intro = $('#intro');

// ---------------------------------------------------------------- chapter position
let tops = [];
function measure() { tops = sections.map((s) => s.getBoundingClientRect().top + scrollY); }

/** Scroll → { a, b, p, mix, active } where a/b are scene indices, p the hold progress of a, mix the a→b transition. */
function position() {
  const y = scrollY, h = innerHeight, n = sections.length;
  let i = 0;
  while (i < n - 1 && y >= tops[i + 1]) i++;
  const holdEnd = i < n - 1 ? tops[i + 1] - h : Infinity;
  const p = Math.min(1, Math.max(0, (y - tops[i]) / Math.max(1, Math.min(holdEnd, tops[i] + h) - tops[i])));
  const mix = i < n - 1 && y > holdEnd ? Math.min(1, (y - holdEnd) / h) : 0;
  let active = 0;
  for (let k = 0; k < n; k++) if (tops[k] <= y + h * 0.5) active = k;
  return { a: i, b: Math.min(i + 1, n - 1), p, mix, active };
}

let lastActive = -1;
function updateChrome(pos) {
  if (pos.active === lastActive) return;
  lastActive = pos.active;
  sections.forEach((s, k) => s.classList.toggle('in', k === pos.active));
  const id = sections[pos.active].id;
  railLinks.forEach((a) => (a.getAttribute('href') === `#${id}` ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
  renderer?.chapter?.(pos.active);
}

// ---------------------------------------------------------------- renderers (same interface)
// { start(onReady), frame(pos, time), chapter(i), stop() }

function backdropRenderer() {
  const layers = [$('#backdropA'), $('#backdropB')];
  let front = 0, shown = -1;
  return {
    start(onReady) { root.dataset.scene = 'fallback'; this.chapter(lastActive < 0 ? 0 : lastActive); onReady?.(); },
    frame() {},
    chapter(i) {
      const key = SCENES[i].media;
      if (key === shown) return;
      shown = key; front ^= 1;
      layers[front].style.backgroundImage = `url(${MEDIA[key]}.jpg)`;
      layers[front].style.opacity = String(SCENES[i].dim < 0.7 ? 0.45 : 1);
      layers[front].classList.add('on'); layers[front ^ 1].classList.remove('on');
    },
    stop() {},
  };
}

const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 vUv;
void main(){ vec2 p = P[gl_VertexID]; vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uA, uB;
uniform vec4 uCropA, uCropB;
uniform vec2 uFocusA, uFocusB, uPointer;
uniform float uZoomA, uZoomB, uDimA, uDimB, uMix, uTime, uAspect, uGrain;
vec2 cover(vec2 uv, vec4 c, vec2 f, float z){
  float ra = (c.z*16.)/(c.w*9.);
  vec2 s = uAspect < ra ? vec2(uAspect/ra, 1.) : vec2(1., ra/uAspect);
  s /= z;
  vec2 o0 = clamp(f - s*.5, vec2(0.), vec2(1.) - s);
  return c.xy + (o0 + clamp(uv,0.,1.)*s)*c.zw;
}
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
// Layered sines: a soft, irregular tide line at a fraction of value-noise cost.
float swell(vec2 p){ return .5 + .22*sin(p.x*5.1 + p.y*1.7) + .16*sin(p.x*11.3 - p.y*3.1 + 1.7) + .08*sin(p.x*23.7 + p.y*7.9 + 4.1); }
void main(){
  vec2 uv = vUv + uPointer*.006;
  // The current: B rises from the bottom like a tide, edged by a thin line of working light.
  float m = step(.999, uMix), band = 0.;
  if (uMix > .001 && uMix < .999) {
    float edge = (1.-vUv.y)*.62 + swell(vUv + vec2(uTime*.03, 0.))*.38;
    float t = uMix*1.25 - .12;
    m = 1. - smoothstep(t-.035, t+.035, edge);
    band = exp(-pow((edge-t)/.03, 2.));
  }
  vec3 a = texture(uA, cover(uv + vec2(0., band*.025), uCropA, uFocusA, uZoomA)).rgb*uDimA;
  vec3 b = texture(uB, cover(uv - vec2(0., band*.02), uCropB, uFocusB, uZoomB)).rgb*uDimB;
  vec3 col = mix(a, b, m) + vec3(.95,.45,.12)*band*.35;
  float l = dot(col, vec3(.2126,.7152,.0722));
  col = mix(col, col*vec3(.9,.97,1.1), .5*(1. - smoothstep(.35,.8,l))); // cool the shadows, keep the working lights warm
  col = mix(vec3(.043,.082,.188), col, smoothstep(-.05,.35,l)*.25 + .75);
  vec2 q = vUv - .5; col *= 1. - .72*dot(q,q);
  col += (hash(gl_FragCoord.xy + fract(uTime)*91.) - .5)*uGrain;
  o = vec4(col, 1.);
}`;

function webglRenderer() {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const U = {};
  for (const n of ['uA', 'uB', 'uCropA', 'uCropB', 'uFocusA', 'uFocusB', 'uPointer', 'uZoomA', 'uZoomB', 'uDimA', 'uDimB', 'uMix', 'uTime', 'uAspect', 'uGrain']) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);

  const allowVideo = !reduced && !saveData;
  const useMp4 = !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"');
  const media = {};
  for (const key of Object.keys(MEDIA)) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([11, 21, 48, 255]));
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    media[key] = { tex, video: null, fresh: false, live: false };
  }
  const upload = (key, source) => { gl.bindTexture(gl.TEXTURE_2D, media[key].tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); };
  const loadPoster = (key) => new Promise((resolve) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { if (!media[key].live) upload(key, img); resolve(); };
    img.onerror = () => resolve();
    img.src = `${MEDIA[key]}.jpg`;
  });
  function video(key) {
    const m = media[key];
    if (m.video || !allowVideo) return m.video;
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.src = `${MEDIA[key]}.${useMp4 ? 'mp4' : 'webm'}`;
    const mark = () => { m.fresh = true; m.live = true; if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(mark); };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(mark); else v.addEventListener('timeupdate', () => { m.fresh = true; m.live = true; });
    v.addEventListener('error', () => { m.video = null; });
    m.video = v;
    return v;
  }
  function wantPlaying(keys) {
    for (const key of Object.keys(media)) {
      const v = media[key].video;
      if (keys.includes(key)) { const vv = video(key); if (vv && vv.paused) vv.play().catch(() => {}); }
      else if (v && !v.paused) v.pause();
    }
  }

  let pointer = [0, 0], target = [0, 0];
  const onPointer = (e) => { target = [(e.clientX / innerWidth - 0.5), (e.clientY / innerHeight - 0.5)]; };
  if (finePointer && !reduced) addEventListener('pointermove', onPointer, { passive: true });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1); // footage is 1280×720; more pixels add cost, not detail
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener('resize', resize);

  const ease = (x) => x * x * (3 - 2 * x);
  const intro = { start: 0, len: reduced ? 0 : 6500 };
  return {
    gl,
    async start(onReady) {
      await Promise.all(Object.keys(MEDIA).map((key, i, all) => loadPoster(key).then(() => onProgress?.(all.length))));
      intro.start = performance.now();
      onReady?.();
    },
    frame(pos, now) {
      if (gl.isContextLost()) return;
      const A = SCENES[pos.a], B = SCENES[pos.b];
      const keys = pos.mix > 0 && A.media !== B.media ? [A.media, B.media] : [A.media];
      wantPlaying(keys);
      for (const key of keys) { const m = media[key]; if (m.fresh && m.video && m.video.readyState >= 2) { upload(key, m.video); m.fresh = false; } }
      pointer[0] += (target[0] - pointer[0]) * 0.05; pointer[1] += (target[1] - pointer[1]) * 0.05;
      const k = intro.len ? Math.min(1, (now - intro.start) / intro.len) : 1;
      const lift = 1 + 0.22 * (1 - ease(k));
      const zA = (A.zoom[0] + (A.zoom[1] - A.zoom[0]) * pos.p) * (pos.a === 0 ? lift : 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, media[A.media].tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, media[B.media].tex);
      gl.uniform4fv(U.uCropA, A.crop); gl.uniform4fv(U.uCropB, B.crop);
      gl.uniform2fv(U.uFocusA, A.focus); gl.uniform2fv(U.uFocusB, B.focus);
      gl.uniform1f(U.uZoomA, zA); gl.uniform1f(U.uZoomB, B.zoom[0]);
      gl.uniform1f(U.uDimA, A.dim); gl.uniform1f(U.uDimB, B.dim);
      gl.uniform1f(U.uMix, reduced ? (pos.mix < 0.5 ? 0 : 1) : pos.mix);
      gl.uniform1f(U.uTime, reduced ? 0 : now / 1000);
      gl.uniform1f(U.uAspect, canvas.width / canvas.height);
      gl.uniform1f(U.uGrain, 0.045);
      gl.uniform2fv(U.uPointer, pointer);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    stop() {
      for (const m of Object.values(media)) { if (m.video) { m.video.pause(); m.video.removeAttribute('src'); m.video.load(); } gl.deleteTexture(m.tex); }
      removeEventListener('resize', resize); removeEventListener('pointermove', onPointer);
    },
  };
}

// ---------------------------------------------------------------- intro
let onProgress = null;
function runIntro(enabled) {
  if (!enabled) return () => {};
  const label = $('#introLoad');
  let loaded = 0;
  onProgress = (total) => { loaded++; label.textContent = loaded < total ? `Preparing the voyage · ${loaded}/${total}` : 'Scroll to begin'; };
  intro.hidden = false;
  let done = false, timer = 0;
  // Skip is an explicit request: cut immediately. Timeout and scroll fade out.
  const dismiss = (e) => {
    if (done) return; done = true; clearTimeout(timer);
    intro.classList.add('leaving');
    if (e?.type === 'click') intro.hidden = true;
    else setTimeout(() => { intro.hidden = true; }, 1100);
    removeEventListener('wheel', dismiss); removeEventListener('touchmove', dismiss); removeEventListener('scroll', onScroll);
  };
  const onScroll = () => { if (scrollY > 40) dismiss(); };
  $('#skipIntro').addEventListener('click', dismiss);
  addEventListener('wheel', dismiss, { passive: true, once: true });
  addEventListener('touchmove', dismiss, { passive: true, once: true });
  addEventListener('scroll', onScroll, { passive: true });
  return () => { timer = setTimeout(dismiss, 6500); };
}

// ---------------------------------------------------------------- direct path
function directPath() {
  const toggle = $('#directToggle'), panel = $('#directPath');
  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) panel.querySelector('a').focus();
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { set(false); toggle.focus(); } });
  addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('#directPath, #directToggle')) set(false); });
}

// ---------------------------------------------------------------- boot
let renderer = null;
let running = false;

function loop(now) {
  if (!running) return;
  renderer.frame(position(), now);
  if (!reduced) requestAnimationFrame(loop);
}
function redraw() { if (running && reduced) requestAnimationFrame((t) => renderer.frame(position(), t)); }

function toFallback() {
  running = false;
  try { renderer?.stop?.(); } catch (error) { /* context already gone; nothing to release */ }
  renderer = backdropRenderer();
  lastActive = -1;
  renderer.start();
  updateChrome(position());
  if (!intro.hidden) { intro.classList.add('leaving'); intro.hidden = true; }
}

function boot() {
  measure();
  directPath();
  addEventListener('resize', () => { measure(); updateChrome(position()); redraw(); });
  addEventListener('scroll', () => { updateChrome(position()); redraw(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!renderer?.gl) return;
    if (document.hidden) running = false;
    else if (!running && root.dataset.scene === 'ready') { running = true; requestAnimationFrame(loop); }
  });

  let gl = null;
  try { gl = webglRenderer(); } catch (error) { gl = null; /* WebGL unavailable: use the still-image backdrop */ }
  if (!gl) { toFallback(); return; }
  renderer = gl;
  canvas.addEventListener('webglcontextlost', toFallback);
  const armIntro = runIntro(!reduced);
  updateChrome(position());
  renderer.start(() => {
    if (renderer !== gl) return;
    root.dataset.scene = 'ready';
    running = true;
    requestAnimationFrame(loop);
    // Start the intro clock only once frames are actually painting (first draw compiles the shader).
    requestAnimationFrame(() => requestAnimationFrame(armIntro));
  });
}

boot();
