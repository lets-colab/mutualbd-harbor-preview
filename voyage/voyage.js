// MutualBD Voyage — scroll-scrubbed footage, chapter controller and navigation (concept).
// Content lives in the HTML. Scroll is the playhead: each section owns a frame range of one clip,
// and the scene follows the scroll with inertia, forward and back.

const root = document.documentElement;
root.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
root.dataset.motion = reduced ? 'reduced' : 'full';

// Frame set: 16:9 for landscape screens, a 9:16 crop that follows the ship or truck for portrait screens.
const SET = innerWidth / innerHeight < 0.9 ? 'm' : 'd';
const CLIP_ORDER = ['sea', 'journey', 'river'];

// ---------------------------------------------------------------- scene ontology
// f = frame range across the section's hold; zoom = camera push; focus = point kept in frame (0–1);
// exit = how the next section arrives: 'continue' keeps the same shot moving, 'tide' rises the next shot from below
// while this one pushes in toward `toward`.
const SCENES = {
  prologue: { clip: 'sea', f: [0, 36], zoom: [1.02, 1.08], focus: [0.55, 0.5], exit: 'tide', toward: [0.72, 0.16], fadeIn: [0.7, 0.92], weather: [0, 0.35] }, // the 3D globe leads; the sea rises in as the camera dives
  arrival: { clip: 'journey', f: [0, 39], zoom: [1.0, 1.05], focus: [0.5, 0.5], exit: 'continue', weather: [0.45, 0.85] },
  berth: { clip: 'journey', f: [39, 102], zoom: [1.05, 1.03], focus: [0.5, 0.5], exit: 'continue', weather: [1, 0.6] },
  clearance: { clip: 'journey', f: [102, 120], zoom: [1.03, 1.06], focus: [0.42, 0.52], exit: 'tide', toward: [0.36, 0.55], weather: [0.9, 0.5] },
  river: { clip: 'river', f: [0, 76], zoom: [1.02, 1.1], focus: [0.6, 0.5], exit: 'tide', toward: [0.6, 0.45], weather: [0, 0.75] },
  road: { clip: 'journey', f: [120, 147], zoom: [1.02, 1.06], focus: [0.45, 0.5], exit: 'continue', weather: [0.8, 0.6] },
  group: { clip: 'journey', f: [149, 149], zoom: [1.08, 1.12], focus: [0.62, 0.4], dim: 0.3, exit: 'continue', weather: [0.3, 0.2] },
  contact: { clip: 'journey', f: [149, 149], zoom: [1.12, 1.16], focus: [0.62, 0.4], dim: 0.34, weather: [0, 0] },
};

const $ = (s) => document.querySelector(s);
const sections = [...document.querySelectorAll('main .chapter')];
const story = sections.filter((s) => !s.classList.contains('chapter-plain'));
const rail = $('.rail');
const railLinks = [...document.querySelectorAll('.rail a')];
const railNow = $('.rail-now');
const introEl = $('#intro');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const ease = (x) => x * x * (3 - 2 * x);
const smooth = (a, b, x) => ease(clamp((x - a) / (b - a)));
let threeOn = false; // set once the 3D components are loaded

// ---------------------------------------------------------------- geometry and timeline
let tops = [], heights = [];
function measure() {
  tops = sections.map((s) => s.getBoundingClientRect().top + scrollY);
  heights = sections.map((s) => s.offsetHeight);
}
/** Position y (document px) → section index i, hold progress p (0–1) and transition progress t (0–1) into i+1. */
function locate(y) {
  const n = sections.length;
  let i = 0;
  while (i < n - 1 && y >= tops[i + 1]) i++;
  const hold = Math.max(1, heights[i] - innerHeight);
  const local = y - tops[i];
  const gap = i < n - 1 ? Math.max(1, tops[i + 1] - tops[i] - hold) : 1;
  return { i, p: clamp(local / hold), t: i < n - 1 ? clamp((local - hold) / gap) : 0 };
}
function shot(spec, p) {
  const focus = SET === 'm' ? [0.5, spec.focus[1]] : spec.focus;
  const fade = spec.fadeIn && threeOn ? smooth(spec.fadeIn[0], spec.fadeIn[1], p) : 1;
  return { clip: spec.clip, frame: lerp(spec.f[0], spec.f[1], p), zoom: lerp(spec.zoom[0], spec.zoom[1], p), focus, dim: (spec.dim ?? 1) * fade, weather: spec.weather || [0, 0] };
}
/** The scene for a scroll position: shot a, optional shot b rising in, and the tide mix between them. */
function sceneAt(y) {
  const { i, p, t } = locate(y);
  const S = SCENES[sections[i].id];
  const N = sections[i + 1] && SCENES[sections[i + 1].id];
  if (reduced) {
    const k = N && t >= 0.5 ? i + 1 : i;
    return { a: shot(SCENES[sections[k].id], 0.5), b: null, mix: 0 };
  }
  if (!N || t <= 0) return { a: shot(S, p), b: null, mix: 0 };
  const from = shot(S, 1), to = shot(N, 0);
  if (S.exit === 'continue' && N.clip === S.clip) {
    return { a: { clip: S.clip, frame: lerp(from.frame, to.frame, t), zoom: lerp(from.zoom, to.zoom, t), focus: lerp2(from.focus, to.focus, t), dim: lerp(from.dim, to.dim, t), weather: lerp2(from.weather, to.weather, t) }, b: null, mix: 0 };
  }
  const e = ease(t);
  const toward = SET === 'm' ? [0.5, (S.toward || S.focus)[1]] : (S.toward || S.focus);
  return {
    a: { ...from, frame: from.frame + 4 * t, zoom: from.zoom * (1 + 0.35 * e), focus: lerp2(from.focus, toward, e) },
    b: { ...to, zoom: to.zoom * (1 + 0.22 * (1 - e)) },
    mix: clamp((t - 0.15) / 0.7),
    weather: lerp2(from.weather, to.weather, e),
  };
}

// ---------------------------------------------------------------- frames (progressive)
const frames = {};
let frameTotal = 0, frameLoaded = 0;
/** Load every frame, coarse to fine (every 8th, then 4th, 2nd, all), so the whole voyage is scrubbable early. */
async function loadFrames(clips, onProgress) {
  for (const c of CLIP_ORDER) frames[c] = new Array(clips[c]);
  const queue = [], seen = new Set();
  const add = (c, i, pass) => { const k = `${c}:${i}`; if (!seen.has(k)) { seen.add(k); queue.push([c, i, pass]); } };
  for (const step of [8, 4, 2, 1]) for (const c of CLIP_ORDER) {
    for (let i = 0; i < clips[c]; i += step) add(c, i, step);
    if (step === 8) add(c, clips[c] - 1, 8);
  }
  frameTotal = queue.length;
  const skeleton = queue.filter((q) => q[2] === 8).length;
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const [c, i] = queue[next++];
      const img = new Image();
      img.decoding = 'async';
      img.src = `seq/${SET}/${c}/${String(i + 1).padStart(3, '0')}.webp`;
      try { await img.decode(); frames[c][i] = img; } catch (error) { /* a missing frame is covered by its loaded neighbours */ }
      frameLoaded++;
      onProgress(frameLoaded, frameTotal, skeleton);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
/** Nearest loaded frames around position x of a clip, with the blend between them. */
function sample(clip, x) {
  const arr = frames[clip];
  if (!arr) return null;
  const n = arr.length;
  x = clamp(x, 0, n - 1);
  let lo = Math.floor(x), hi = Math.ceil(x);
  while (lo >= 0 && !arr[lo]) lo--;
  while (hi < n && !arr[hi]) hi++;
  if (lo < 0 && hi >= n) return null;
  if (lo < 0) return { i0: hi, i1: hi, f: 0 };
  if (hi >= n) return { i0: lo, i1: lo, f: 0 };
  return { i0: lo, i1: hi, f: hi === lo ? 0 : (x - lo) / (hi - lo) };
}

// ---------------------------------------------------------------- renderers (same interface: frame(scene, now, fx), stop())
const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 vUv;
void main(){ vec2 p = P[gl_VertexID]; vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uA0, uA1, uB0, uB1;
uniform vec2 uFocusA, uFocusB, uPointer;
uniform float uFA, uFB, uZoomA, uZoomB, uDimA, uDimB, uMix, uTime, uAspect, uTexAspect, uGrain, uBlur, uRain, uMotes, uVel, uPhase;
vec2 cover(vec2 uv, vec2 f, float z){
  vec2 s = uAspect < uTexAspect ? vec2(uAspect/uTexAspect, 1.) : vec2(1., uTexAspect/uAspect);
  s /= z;
  vec2 o0 = clamp(f - s*.5, vec2(0.), vec2(1.) - s);
  return o0 + clamp(uv, 0., 1.)*s;
}
vec3 shotA(vec2 uv){ vec2 t = cover(uv, uFocusA, uZoomA); return mix(texture(uA0,t).rgb, texture(uA1,t).rgb, uFA)*uDimA; }
vec3 shotB(vec2 uv){ vec2 t = cover(uv, uFocusB, uZoomB); return mix(texture(uB0,t).rgb, texture(uB1,t).rgb, uFB)*uDimB; }
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float swell(vec2 p){ return .5 + .22*sin(p.x*5.1 + p.y*1.7) + .16*sin(p.x*11.3 - p.y*3.1 + 1.7) + .08*sin(p.x*23.7 + p.y*7.9 + 4.1); }
// Rain: sparse streaks in three depth layers; faster scrolling stretches them.
float rainLayer(vec2 uv, float density, float speed, float len, float seed){
  vec2 p = vec2(uv.x * uAspect * density, uv.y * density * .16 - uTime * speed - uPhase * density * .05);
  vec2 id = floor(p), f = fract(p);
  float h = hash(id + seed);
  if (h < .8) return 0.;
  float d = abs(f.x - fract(h * 13.7));
  return smoothstep(.05, 0., d) * smoothstep(0., len, f.y) * smoothstep(1., 1. - len * .5, f.y) * (h - .8) * 5.;
}
// Lens lights: soft out-of-focus discs drifting with the scroll at their own depth.
vec3 lensLights(vec2 uv){
  vec3 acc = vec3(0.);
  for (int k = 0; k < 10; k++) {
    float fk = float(k), depth = .4 + hash(vec2(fk, 3.1));
    vec2 c = vec2(fract(hash(vec2(fk, 1.3)) + uTime * .004 * depth), fract(hash(vec2(fk, 7.1)) - uPhase * .14 * depth));
    float r = .03 + .055 * hash(vec2(fk, 9.7));
    float m = smoothstep(r, r * .55, length((uv - c) * vec2(uAspect, 1.)));
    acc += mix(vec3(1., .62, .3), vec3(.55, .68, 1.), step(.62, hash(vec2(fk, 5.3)))) * m * .045;
  }
  return acc;
}
vec3 frameAt(vec2 uv, float m, float band){
  if (m >= .999) return shotB(uv);
  vec3 c = shotA(uv + vec2(0., band*.015));
  if (m > .001) c = mix(c, shotB(uv - vec2(0., band*.012)), m);
  return c;
}
void main(){
  vec2 uv = vUv + uPointer*.006;
  float m = step(.999, uMix), band = 0.;
  if (uMix > .001 && uMix < .999) {
    // The tide: the next shot rises from the bottom behind a thin line of working light.
    float edge = (1.-vUv.y)*.62 + swell(vec2(vUv.x*uAspect, vUv.y) + vec2(uTime*.03, 0.))*.38;
    float t = uMix*1.25 - .12;
    m = 1. - smoothstep(t-.012, t+.012, edge);
    band = exp(-pow((edge-t)/.012, 2.));
  }
  vec3 col;
  if (abs(uBlur) > .002) {
    vec2 d = (uv - .5)*uBlur; col = vec3(0.);
    for (int k = 0; k < 6; k++) col += frameAt(uv - d*float(k)/5., m, band);
    col /= 6.;
  } else col = frameAt(uv, m, band);
  col += vec3(.95,.45,.12)*band*.6;
  if (uRain > .01) {
    float len = .45 + min(abs(uVel), 2.) * .3;
    float r = rainLayer(vUv, 22., 1.6, len, 0.) * .12 + rainLayer(vUv, 38., 2.4, len, 7.) * .08 + rainLayer(vUv, 64., 3.4, len, 19.) * .05;
    col += vec3(.74, .82, .96) * r * uRain;
  }
  if (uMotes > .01) col += lensLights(vUv) * uMotes;
  float l = dot(col, vec3(.2126,.7152,.0722));
  col = mix(col, col*vec3(.9,.97,1.1), .5*(1. - smoothstep(.35,.8,l))); // cool the shadows
  // Split-tone: near-white highlights become sodium working light, so every clip carries the brand orange.
  float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  col *= mix(vec3(1.), vec3(1.12,.8,.5), smoothstep(.42,.82,l)*(1. - smoothstep(.3,.6,sat)));
  col = mix(vec3(.043,.082,.188), col, smoothstep(-.05,.35,l)*.25 + .75);
  vec2 q = vUv - .5; col *= 1. - .72*dot(q,q);
  col += (hash(gl_FragCoord.xy + fract(uTime)*91.) - .5)*uGrain;
  o = vec4(col, 1.);
}`;

const TEX_ASPECT = SET === 'm' ? 405 / 720 : 1280 / 720;

function webglRenderer() {
  const canvas = $('#scene');
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
  for (const n of ['uA0', 'uA1', 'uB0', 'uB1', 'uFocusA', 'uFocusB', 'uPointer', 'uFA', 'uFB', 'uZoomA', 'uZoomB', 'uDimA', 'uDimB', 'uMix', 'uTime', 'uAspect', 'uTexAspect', 'uGrain', 'uBlur', 'uRain', 'uMotes', 'uVel', 'uPhase']) U[n] = gl.getUniformLocation(prog, n);
  ['uA0', 'uA1', 'uB0', 'uB1'].forEach((n, k) => gl.uniform1i(U[n], k));
  gl.uniform1f(U.uTexAspect, TEX_ASPECT);
  // Software renderers (no GPU) get the low tier: no motion blur.
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const low = /swiftshader|llvmpipe|software/i.test(gpu);

  // Small LRU of frame textures so scrubbing back and forth re-uses uploads.
  const cache = new Map();
  let clock = 0;
  function bind(unit, clip, i) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const key = `${clip}:${i}`;
    let entry = cache.get(key);
    if (!entry) {
      let tex;
      if (cache.size >= 12) {
        let oldKey = null, old = null;
        for (const [k, v] of cache) if (!old || v.t < old.t) { oldKey = k; old = v; }
        cache.delete(oldKey);
        tex = old.tex;
      } else {
        tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frames[clip][i]);
      entry = { tex, t: 0 };
      cache.set(key, entry);
    }
    entry.t = ++clock;
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
  }
  function resize() {
    canvas.width = innerWidth; canvas.height = innerHeight; // footage is 720p: device pixels beyond 1× add cost, not detail
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener('resize', resize);

  return {
    canvas,
    low,
    frame(scene, now, fx) {
      if (gl.isContextLost()) return false;
      const a = scene.a && sample(scene.a.clip, scene.a.frame);
      if (!a) { gl.clearColor(0.043, 0.082, 0.188, 1); gl.clear(gl.COLOR_BUFFER_BIT); return false; }
      const b = scene.b && scene.mix > 0 && sample(scene.b.clip, scene.b.frame);
      bind(0, scene.a.clip, a.i0); bind(1, scene.a.clip, a.i1);
      if (b) { bind(2, scene.b.clip, b.i0); bind(3, scene.b.clip, b.i1); }
      gl.uniform1f(U.uFA, a.f); gl.uniform1f(U.uFB, b ? b.f : 0);
      gl.uniform2fv(U.uFocusA, scene.a.focus); gl.uniform1f(U.uZoomA, scene.a.zoom * fx.lift); gl.uniform1f(U.uDimA, scene.a.dim);
      if (b) { gl.uniform2fv(U.uFocusB, scene.b.focus); gl.uniform1f(U.uZoomB, scene.b.zoom); gl.uniform1f(U.uDimB, scene.b.dim); }
      gl.uniform1f(U.uMix, b ? scene.mix : 0);
      gl.uniform1f(U.uTime, reduced ? 0 : now / 1000);
      gl.uniform1f(U.uAspect, canvas.width / canvas.height);
      gl.uniform1f(U.uGrain, 0.04);
      gl.uniform1f(U.uBlur, low ? 0 : fx.blur);
      // Weather is motion: none under reduced motion or on software renderers.
      const weather = reduced || low ? [0, 0] : (scene.weather || scene.a.weather || [0, 0]);
      gl.uniform1f(U.uRain, weather[0]); gl.uniform1f(U.uMotes, weather[1]);
      gl.uniform1f(U.uVel, fx.vel); gl.uniform1f(U.uPhase, fx.phase);
      gl.uniform2fv(U.uPointer, fx.pointer);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
    stop() {
      removeEventListener('resize', resize);
      for (const e of cache.values()) gl.deleteTexture(e.tex);
      cache.clear();
    },
  };
}

function canvasRenderer() {
  const canvas = $('#scene2d');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  resize();
  addEventListener('resize', resize);
  function draw(s, alpha) {
    const smp = sample(s.clip, s.frame);
    if (!smp) return;
    const img = frames[s.clip][smp.f < 0.5 ? smp.i0 : smp.i1];
    const W = canvas.width, H = canvas.height, tw = img.naturalWidth, th = img.naturalHeight;
    let vw = tw, vh = th;
    if (W / H < tw / th) vw = th * (W / H); else vh = tw / (W / H);
    vw /= s.zoom; vh /= s.zoom;
    const sx = clamp(s.focus[0] * tw - vw / 2, 0, tw - vw), sy = clamp(s.focus[1] * th - vh / 2, 0, th - vh);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, sx, sy, vw, vh, 0, 0, W, H);
    if (s.dim < 1) { ctx.globalAlpha = alpha * (1 - s.dim); ctx.fillStyle = '#0b1530'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
  }
  let lastKey = '';
  const keyOf = (s) => { if (!s) return '-'; const m = sample(s.clip, s.frame); return m ? `${s.clip}:${m.f < 0.5 ? m.i0 : m.i1}:${s.zoom.toFixed(3)}:${s.dim.toFixed(2)}:${s.focus[0].toFixed(3)}` : `${s.clip}:none`; };
  return {
    canvas,
    frame(scene) {
      // Redraw only when the picture changes: a full-screen 2D draw every tick stalls slow devices.
      const key = `${keyOf(scene.a)}|${scene.b && scene.mix > 0 ? keyOf(scene.b) : '-'}|${scene.mix.toFixed(2)}|${canvas.width}x${canvas.height}`;
      if (key === lastKey) return true;
      lastKey = key;
      ctx.fillStyle = '#0b1530'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!scene.a || !sample(scene.a.clip, scene.a.frame)) { lastKey = ''; return false; }
      draw(scene.a, 1);
      if (scene.b && scene.mix > 0) draw(scene.b, scene.mix);
      return true;
    },
    stop() { removeEventListener('resize', resize); },
  };
}

// ---------------------------------------------------------------- intro
function intro(enabled) {
  const status = $('#introLoad');
  if (!enabled) return { progress() {}, ready() {}, close() {} };
  root.classList.add('intro-on');
  introEl.hidden = false;
  let done = false, timer = 0;
  const close = (e) => {
    if (done) return;
    done = true; clearTimeout(timer);
    root.classList.remove('intro-on');
    introEl.classList.add('leaving');
    if (e?.type === 'click') {
      introEl.hidden = true;
      const h = $('#h-prologue'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    } else setTimeout(() => { introEl.hidden = true; }, 1100);
    removeEventListener('wheel', close); removeEventListener('touchmove', close); removeEventListener('keydown', onKey); removeEventListener('scroll', onScroll);
  };
  const onScroll = () => { if (scrollY > 40) close(); };
  const onKey = (e) => { if (['ArrowDown', 'PageDown', ' ', 'End'].includes(e.key)) close(); };
  $('#skipIntro').addEventListener('click', close);
  addEventListener('wheel', close, { passive: true });
  addEventListener('touchmove', close, { passive: true });
  addEventListener('keydown', onKey);
  addEventListener('scroll', onScroll, { passive: true });
  return {
    progress(pct) { status.textContent = `Loading the voyage · ${pct}%`; },
    ready() { status.textContent = 'Scroll to sail, or press Begin'; timer = setTimeout(close, 8000); },
    close,
  };
}

// ---------------------------------------------------------------- direct path (companies menu)
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

// ---------------------------------------------------------------- chrome: rail, beats
let lastActive = -1;
function updateChrome() {
  const y = scrollY, h = innerHeight;
  let active = 0;
  for (let k = 0; k < sections.length; k++) if (tops[k] <= y + h * 0.5) active = k;
  // Scroll-linked beats: --p is the hold progress of each story section near the viewport.
  for (let k = Math.max(0, active - 1); k <= Math.min(sections.length - 1, active + 1); k++) {
    if (!story.includes(sections[k])) continue;
    const hold = Math.max(1, heights[k] - h);
    sections[k].style.setProperty('--p', clamp((y - tops[k]) / hold).toFixed(3));
  }
  if (active !== lastActive) {
    lastActive = active;
    const id = sections[active].id;
    for (const a of railLinks) {
      if (a.getAttribute('href') === `#${id}`) { a.setAttribute('aria-current', 'step'); railNow.textContent = a.querySelector('span').textContent; }
      else a.removeAttribute('aria-current');
    }
  }
}
function updateRoute(y) {
  const h = innerHeight, n = sections.length;
  let i = 0;
  while (i < n - 1 && tops[i + 1] <= y + h * 0.5) i++;
  const frac = clamp((y + h * 0.5 - tops[i]) / Math.max(1, heights[i]));
  rail.style.setProperty('--route', clamp((i + frac) / (n - 1)).toFixed(4));
}

// ---------------------------------------------------------------- 3D components: opening globe, group container stack
let three = null, threeMode = 'none', threeOpacity = -1, hot = -1, listHot = -1;
let threeStart = 0, frameShare = 0, velNow = 0, flying = false, cursorMode = '';
const canvas3d = $('#scene3d');
const leader = $('.leader'), leaderLine = leader.querySelector('line'), leaderDot = leader.querySelector('circle');
const companyItems = [...document.querySelectorAll('#group .company-list li')];

async function load3D(low) {
  root.dataset.three = 'loading';
  try {
    const [mod, buf] = await Promise.all([import('./scene3d.js'), fetch('seq/land-dots.bin').then((r) => r.arrayBuffer()), document.fonts?.load('600 64px Archivo')]);
    const names = companyItems.map((li) => li.querySelector('.co-name').textContent.trim());
    three = mod.createScene3D(canvas3d, { landIndices: new Uint16Array(buf), names, reduced, lowTier: low });
    three.setSize(innerWidth, innerHeight);
    threeStart = performance.now();
    addEventListener('resize', () => three?.setSize(innerWidth, innerHeight));
    threeOn = true;
    root.dataset.three = 'ready';
    redraw();
  } catch (error) {
    three = null; threeOn = false; root.dataset.three = 'off'; // 3D failed to load: the footage and the text carry the page
  }
}
/** Which 3D component a scroll position shows, with its progress and opacity. */
function threeState(y) {
  const { i, p, t } = locate(y);
  const id = sections[i].id;
  const cut = (x) => (x >= 0.5 ? 1 : 0);
  if (id === 'prologue') return { mode: 'globe', p: reduced ? 0.55 : p, opacity: reduced ? 1 : 1 - smooth(0.78, 0.92, p) };
  if (id === 'road' && t > 0) return { mode: 'stack', p: 0, opacity: reduced ? cut(t) : smooth(0.3, 0.9, t) };
  if (id === 'group' && t > 0) {
    // The stack fades out, then the globe returns for the close.
    if (reduced) return t >= 0.5 ? { mode: 'outro', p: 0, opacity: 1 } : { mode: 'stack', p: 1, opacity: 1 };
    return t < 0.5 ? { mode: 'stack', p, opacity: 1 - smooth(0.05, 0.45, t) } : { mode: 'outro', p: 0, opacity: smooth(0.55, 0.95, t) };
  }
  if (id === 'group') return { mode: 'stack', p: reduced ? 1 : p, opacity: 1 };
  if (id === 'contact') return { mode: 'outro', p: reduced ? 0.6 : p, opacity: 1 };
  return { mode: 'none', p: 0, opacity: 0 };
}
function render3D(y, now) {
  if (!three) return;
  const s = threeState(y);
  if (s.opacity <= 0.001) s.mode = 'none';
  if (s.opacity !== threeOpacity) { canvas3d.style.opacity = s.opacity.toFixed(3); threeOpacity = s.opacity; }
  if (s.mode === 'none' && threeMode === 'none') return;
  threeMode = s.mode;
  const h = s.mode === 'stack' ? (listHot >= 0 ? listHot : hot) : -1;
  // The globe's dots assemble with the real loading progress, over at least two seconds.
  three.setBuild(reduced ? 1 : Math.min(frameShare, (now - threeStart) / 2200));
  three.render({ mode: s.mode, p: s.p, now, pointer, hot: h, vel: velNow });
  if (s.mode === 'stack') {
    companyItems.forEach((li, k) => {
      const c = three.project(k);
      li.dataset.cx = Math.round(c.x); li.dataset.cy = Math.round(c.y);
      li.classList.toggle('is-hot', k === h);
    });
    if (h >= 0) {
      const r = companyItems[h].getBoundingClientRect(), c = three.project(h);
      leaderLine.setAttribute('x1', r.right + 10); leaderLine.setAttribute('y1', r.top + r.height / 2);
      leaderLine.setAttribute('x2', c.x); leaderLine.setAttribute('y2', c.y);
      leaderDot.setAttribute('cx', c.x); leaderDot.setAttribute('cy', c.y);
    }
    leader.classList.toggle('on', h >= 0 && s.opacity > 0.5);
  } else {
    leader.classList.remove('on');
    hot = -1;
  }
}
/** Hover a container or its name to light both; click a container to open its company's chapter. */
function stackInteractions() {
  addEventListener('pointermove', (e) => {
    if (threeMode !== 'stack' || !three) return;
    const k = e.target.closest('a, button, .company-list li') ? -1 : three.pick(e.clientX, e.clientY);
    if (k !== hot) { hot = k; const link = k >= 0 && companyItems[k].querySelector('a'); document.body.style.cursor = link ? 'pointer' : ''; cursorMode = link ? 'open' : ''; sound?.cue('hover', k); redraw(); }
  }, { passive: true });
  addEventListener('click', (e) => {
    if (threeMode !== 'stack' || !three || e.target.closest('a, button, input, summary')) return;
    const k = three.pick(e.clientX, e.clientY);
    const link = companyItems[k]?.querySelector('a');
    if (!link || flying) return;
    // Fly into the container, then open the company's chapter.
    flying = true;
    sound?.cue('fly', k);
    three.flyTo(k).then(() => { link.click(); three.endFly(); flying = false; });
  });
  companyItems.forEach((li, k) => {
    const on = () => { listHot = k; sound?.cue('hover', k); redraw(); }, off = () => { listHot = -1; redraw(); };
    li.addEventListener('pointerenter', on); li.addEventListener('pointerleave', off);
    li.addEventListener('focusin', on); li.addEventListener('focusout', off);
  });
}

// ---------------------------------------------------------------- sound (opt-in, spatial, generated in the browser)
// Off until the visitor asks: no autoplay. The audio context is created inside the click (browsers require a
// gesture); the spatial engine (sound.js) loads only then. No recordings: every sound is synthesised locally.
let sound = null;
function soundscape() {
  const btn = $('#soundToggle'), label = btn.querySelector('.sound-label'), hint = $('#soundHint');
  let ctx = null, engine = null, on = false, hinted = false;
  function set(v) {
    on = v;
    btn.setAttribute('aria-pressed', String(v));
    label.textContent = v ? 'Sound on' : 'Sound off';
    if (v && !ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx({ latencyHint: 'playback' });
      import('./sound.js').then((m) => { engine = m.createSoundEngine(ctx); engine.enable(on); }).catch(() => { /* the engine failed to load: the page stays silent */ });
    }
    if (!ctx) return;
    if (v) ctx.resume().catch(() => { /* the browser refused to start audio: the toggle still reflects the choice */ });
    engine?.enable(v);
    if (v && !hinted) { hinted = true; hint.textContent = 'Best with headphones'; setTimeout(() => { hint.textContent = ''; }, 4200); }
    if (!v) setTimeout(() => { if (!on && ctx.state === 'running') ctx.suspend().catch(() => { /* already closing */ }); }, 1200);
  }
  btn.addEventListener('click', () => set(!on));
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !on) return;
    (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => { /* state already changing */ });
  });
  // Sound is optional: if the engine fails, report it once, go quiet and leave the visuals running.
  const guard = (fn) => {
    try { fn(); } catch (error) {
      console.error('sound stopped:', error);
      engine = null;
      ctx.suspend().catch(() => { /* already closing */ });
    }
  };
  return {
    get on() { return on && !!engine; },
    update(state) { if (on && engine) guard(() => engine.update(state)); },
    cue(name, k) { if (on && engine) guard(() => engine.cue(name, k)); },
  };
}
/** What the sound engine needs from the scroll position: chapter, progress, weather and the 3D stack. */
function soundState(y, sc, dt, vel) {
  const { i, p, t } = locate(y);
  const id = sections[i].id, ts = three && threeMode === 'stack' ? threeState(y) : null;
  return {
    id, next: sections[i + 1]?.id, p, t, exit: SCENES[id].exit, y, w: innerWidth, h: innerHeight, dt, vel, pointer,
    rain: (sc.weather || sc.a.weather || [0])[0],
    stack: ts?.mode === 'stack' ? { p: ts.p, count: companyItems.length, project: (k) => three.project(k) } : null,
  };
}

// ---------------------------------------------------------------- cursor and magnetic controls (fine pointers only)
function cursorLayer() {
  if (!finePointer || reduced) return;
  const el = $('.cursor');
  const magnets = [...document.querySelectorAll('.top-actions > *, .intro-begin, .phones a')];
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, seen = false;
  addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    if (!seen) { seen = true; cx = x; cy = y; root.classList.add('has-cursor'); }
    const over = e.target.closest('a, button, summary');
    el.classList.toggle('is-link', !!over && cursorMode !== 'open');
  }, { passive: true });
  document.addEventListener('pointerleave', () => root.classList.remove('has-cursor'));
  document.addEventListener('pointerenter', () => { if (seen) root.classList.add('has-cursor'); });
  const tick = () => {
    cx += (x - cx) * 0.22; cy += (y - cy) * 0.22;
    el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    el.classList.toggle('is-open', cursorMode === 'open' && threeMode === 'stack');
    for (const m of magnets) {
      const r = m.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2;
      const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy), reach = Math.max(r.width, r.height) * 0.9;
      m.style.translate = d < reach ? `${(dx * 0.18).toFixed(1)}px ${(dy * 0.18).toFixed(1)}px` : '';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- smooth wheel scrolling (desktop, motion allowed)
let lenisOn = false;
function smoothScroll() {
  if (!finePointer || reduced) return;
  import('./smooth.js').then(({ default: Lenis }) => {
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, anchors: false });
    lenisOn = true;
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }).catch(() => { /* native scrolling stays */ });
}

// ---------------------------------------------------------------- boot
let renderer = null;
let running = false;
let ys = 0, yPrev = 0, lastNow = 0, introStart = 0;
let pointer = [0, 0], target = [0, 0];
let introCtl = null;

function render(now) {
  const dt = Math.min(0.1, Math.max(0.001, (now - (lastNow || now)) / 1000));
  lastNow = now;
  const goal = scrollY;
  if (reduced || Math.abs(goal - ys) > innerHeight * 2.5) ys = goal; // long jumps (menu, rail) cut instead of fast-forwarding
  else ys += (goal - ys) * (1 - Math.exp(-dt * (lenisOn ? 12 : 6)));
  const vel = (ys - yPrev) / dt;
  yPrev = ys;
  pointer[0] += (target[0] - pointer[0]) * 0.05; pointer[1] += (target[1] - pointer[1]) * 0.05;
  const k = introStart ? clamp((now - introStart) / 5000) : 0;
  const fx = {
    vel: reduced ? 0 : clamp(vel / innerHeight, -3, 3),
    phase: ys / innerHeight,
    lift: reduced ? 1 : 1 + 0.28 * (1 - ease(k)) * clamp(1 - ys / innerHeight),
    blur: reduced ? 0 : clamp(vel / (innerHeight * 2.4), -1, 1) * 0.05,
    pointer,
  };
  updateRoute(ys);
  velNow = fx.vel;
  const sc = sceneAt(ys);
  const drawn = renderer.frame(sc, now, fx);
  render3D(ys, now);
  if (sound?.on) sound.update(soundState(ys, sc, dt, fx.vel));
  return drawn;
}
function loop(now) {
  if (!running) return;
  render(now);
  requestAnimationFrame(loop);
}
let pending = false;
function redraw() {
  if (!reduced || pending || !renderer) return;
  pending = true;
  requestAnimationFrame((t) => { pending = false; render(t); });
}
function start() {
  if (running || !renderer) return;
  if (reduced) { redraw(); return; }
  running = true;
  requestAnimationFrame(loop);
}

function toFallback() {
  running = false;
  try { renderer?.stop(); } catch (error) { /* the lost context has nothing left to release */ }
  renderer = canvasRenderer();
  root.dataset.scene = 'fallback';
  try { three?.dispose(); } catch (error) { /* the 3D context may be lost too */ }
  three = null; threeOn = false; root.dataset.three = 'off';
  introCtl?.close();
  if (!renderer) return;
  start();
}

/** Split each narration line into word spans (text stays readable as one sentence) for the scroll-linked reveal. */
function splitNarration() {
  if (reduced) return;
  for (const el of document.querySelectorAll('.chapter .narration')) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'w'; span.style.setProperty('--w', i); span.textContent = w;
      el.append(span, i < words.length - 1 ? ' ' : '');
    });
  }
}

async function boot() {
  sound = soundscape();
  cursorLayer();
  smoothScroll();
  splitNarration();
  measure();
  ys = yPrev = scrollY;
  directPath();
  updateChrome();
  addEventListener('resize', () => { measure(); updateChrome(); redraw(); });
  document.fonts?.ready.then(() => { measure(); updateChrome(); redraw(); });
  addEventListener('load', () => { measure(); updateChrome(); redraw(); });
  addEventListener('scroll', () => { updateChrome(); redraw(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else start();
  });
  if (finePointer && !reduced) addEventListener('pointermove', (e) => { target = [e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5]; }, { passive: true });

  let gl = null;
  try { gl = webglRenderer(); } catch (error) { gl = null; /* WebGL unavailable: the 2D canvas renderer takes over */ }
  if (gl) {
    renderer = gl;
    gl.canvas.addEventListener('webglcontextlost', toFallback);
    introCtl = intro(!reduced);
    stackInteractions();
    load3D(gl.low);
  } else {
    toFallback();
  }
  if (!gl) root.dataset.three = 'off';

  let manifest = null;
  try { manifest = await (await fetch('seq/manifest.json')).json(); } catch (error) { manifest = null; /* no footage: the page stays a readable document */ }
  if (!manifest) { root.dataset.frames = 'missing'; return; }
  root.dataset.frames = 'loading';
  let shown = false;
  loadFrames(manifest.clips, (loaded, total, skeleton) => {
    frameShare = Math.min(1, loaded / skeleton);
    if (loaded < skeleton) introCtl?.progress(Math.round((loaded / skeleton) * 100));
    if (loaded === skeleton) {
      root.dataset.frames = 'skeleton';
      if (renderer === gl && root.dataset.scene !== 'fallback') root.dataset.scene = 'ready';
      introStart = performance.now();
      introCtl?.ready();
    }
    if (loaded === total) root.dataset.frames = 'all';
    if (!shown) { shown = true; start(); }
    redraw();
  });
}

boot();
