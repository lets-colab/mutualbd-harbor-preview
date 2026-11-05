// MutualBD Voyage — spatial sound (concept). Loaded only after the visitor turns sound on.
// Every sound is synthesised here from noise and oscillators: no recordings, nothing to license.
// Sources sit in 3D around the listener (binaural HRTF panning, distance roll-off, a generated reverb) and follow
// the footage and the 3D scene as the visitor scrolls. Scroll speed drives the machines: the crane strains and the
// truck pulls harder when the visitor scrolls faster, and both idle when they stop.
// Axes: x right, y up, −z ahead of the listener; units are metres.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);
const smooth = (a, b, x) => ease(clamp((x - a) / (b - a)));
const band = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));
const C = 343; // speed of sound, m/s

// Loudest level of each continuous layer (before distance roll-off for the positioned ones).
const CEIL = { pad: 0.5, high: 0.55, sea: 0.5, lap: 0.6, rain: 0.42, wind: 0.32, port: 1.5, crane: 1.4, truck: 0.6, vessel: 1.6, city: 2.4 };
const CITY = [0, 3, -120];

/**
 * The score: what chapter `id` sounds like at hold progress p (0–1). Levels are 0–1 of each layer's ceiling;
 * positions follow what the footage shows at that moment (the port ahead, the crane overhead, the truck under
 * the container, then pulling away up the road).
 */
function mixAt(id, p) {
  const m = {
    pad: 0, high: 0, sea: 0, seaTone: 900, lap: 0, wet: 0.35,
    port: 0, portPos: [8, 3, -40], crane: 0, cranePos: [-4, 8, -10],
    truck: 0, truckPos: [0.3, -1.4, -10], truckRun: 0, vessel: 0, vesselPos: [-2, -0.6, -26], city: 0,
  };
  switch (id) {
    case 'prologue': // the globe, the dive, then the aerial sea with a ship far below
      m.pad = 1 - smooth(0.72, 0.92, p);
      m.high = smooth(0.5, 0.74, p);
      m.sea = 0.4 * smooth(0.7, 0.92, p); m.seaTone = 600;
      m.vessel = 0.5 * smooth(0.74, 0.92, p); m.vesselPos = [0.5, -24, -12];
      m.wet = lerp(0.62, 0.3, smooth(0.6, 0.9, p));
      break;
    case 'arrival': // low over the water at night, the port lights ahead
      m.sea = 0.85; m.seaTone = 1400; m.lap = 1; m.wet = 0.38;
      m.port = 0.85; m.portPos = [lerp(10, 6, p), 3, lerp(-80, -30, p)];
      break;
    case 'berth': // the quay: the crane overhead lowers a container onto the truck
      m.sea = lerp(0.55, 0.25, p); m.seaTone = 1000; m.lap = 0.5 * (1 - smooth(0.15, 0.45, p)); m.wet = 0.45;
      m.port = 0.75; m.portPos = [lerp(7, 9, p), 3, lerp(-28, -4, p)];
      m.crane = band(p, 0.12, 0.22, 0.72, 0.82);
      m.cranePos = [lerp(-6, 0.3, smooth(0.15, 0.72, p)), lerp(11, 3.5, smooth(0.3, 0.78, p)), -10];
      m.truck = 0.55 * smooth(0.55, 0.72, p);
      break;
    case 'clearance': // the loaded truck rolls right, past the stacks
      m.sea = 0.2; m.seaTone = 850; m.wet = 0.55;
      m.port = 0.35; m.portPos = [9, 3, 6];
      m.truck = 0.9; m.truckRun = 0.5; m.truckPos = [lerp(0.3, 3.2, p), -1.4, lerp(-10, -7, p)];
      break;
    case 'river': // calm water at dusk, a lit coaster ahead, moving away
      m.sea = 0.5; m.seaTone = 700; m.lap = 0.75; m.wet = 0.26;
      m.vessel = 1; m.vesselPos = [lerp(-2.4, -1.6, p), -0.6, lerp(-24, -40, p)];
      break;
    case 'road': // the truck pulls away up the wet highway toward the city
      m.sea = 0.08; m.wet = 0.32;
      m.truck = 1; m.truckRun = 1; m.truckPos = [lerp(2.8, 0.4, p), -1.4, lerp(-7, -44, ease(p))];
      m.city = smooth(0.2, 0.7, p);
      break;
    case 'group': // the 3D stack: its crane is driven by the stack itself
      m.sea = 0.22; m.seaTone = 750; m.wet = 0.42;
      break;
    case 'contact': // back on the globe
      m.pad = 0.75; m.sea = 0.3; m.seaTone = 1100; m.wet = 0.6;
      break;
    default:
  }
  return m;
}

/** Mix two chapters' scores; a positioned layer keeps the position of whichever side is audible. */
function blend(a, b, k) {
  const m = {};
  for (const key of Object.keys(a)) {
    if (key.endsWith('Pos')) {
      const level = key.slice(0, -3), la = a[level], lb = b[level];
      m[key] = la > 0 && lb > 0 ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lb > 0 ? b[key] : a[key];
    } else m[key] = lerp(a[key], b[key], k);
  }
  return m;
}

// Forward-scroll cues inside a chapter's hold, matched to frames of the footage. 'far' is steel meeting steel
// somewhere across the port, offset from the port machinery's position.
const CUES = {
  prologue: [[0.58, 'descent']], // the camera dives through the globe
  arrival: [[0.16, 'horn'], [0.48, 'far', [-12, 3, 4]], [0.76, 'far', [9, 5, -6]]], // the harbour comes into view
  berth: [[0.08, 'far', [10, 2, -8]], [0.3, 'unlatch'], [0.5, 'far', [-16, 4, -12]], [0.77, 'landTruck'], [0.95, 'airBrake']], // lift off the ship; down on the chassis; the puff of air
  clearance: [[0.36, 'puff']],
};
const cross = (a, b, at) => (a < at && b >= at ? 1 : a >= at && b < at ? -1 : 0);

/**
 * Build the sound engine on an audio context (realtime or offline).
 * @returns {{ enable(on: boolean): void, update(state: object): void, cue(name: string, k: number): void }}
 */
export function createSoundEngine(ctx) {
  const sr = ctx.sampleRate;
  const now = () => ctx.currentTime;
  const seen = new WeakMap();
  /** Glide a parameter toward v; repeats are skipped so a still page schedules nothing. */
  function glide(param, v, tau = 0.25) {
    if (!Number.isFinite(v)) return;
    const last = seen.get(param);
    if (last !== undefined && Math.abs(last - v) < 1e-4) return;
    seen.set(param, v);
    param.setTargetAtTime(v, now(), tau);
  }

  // ------------------------------------------------------------ material: noise, rain, sparks, a reverb tail
  function noise(seconds, colour) {
    const len = Math.floor(sr * seconds), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (colour === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (colour === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      else d[i] = w * 0.5;
    }
    const drift = d[len - 1] - d[0]; // close the loop so the end meets the start without a click
    for (let i = 0; i < len; i++) d[i] -= drift * (i / (len - 1));
    return buf;
  }
  function rainBuffer(seconds) {
    const len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let prev = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = (w - prev) * 0.16; prev = w; } // a bright hiss
      for (let k = 0; k < seconds * 80; k++) { // drops: short decaying ticks scattered through the loop
        const at = Math.floor(Math.random() * len), f = 1800 + Math.random() * 4200, n = Math.floor(sr * (0.004 + Math.random() * 0.012)), a = 0.04 + Math.random() * 0.2;
        for (let i = 0; i < n && at + i < len; i++) d[at + i] += Math.sin((2 * Math.PI * f * i) / sr) * a * Math.exp((-5 * i) / n);
      }
    }
    return buf;
  }
  function sparkBuffer(seconds) {
    const len = Math.floor(sr * seconds), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = Math.floor(sr * 0.01); i < len;) {
      const x = i / len, a = (0.3 + Math.random() * 0.7) * (1 - x), w = 2 + Math.floor(Math.random() * 6);
      for (let j = 0; j < w && i + j < len; j++) d[i + j] += (Math.random() * 2 - 1) * a * (1 - j / w);
      i += Math.floor(sr * (0.004 + Math.random() * 0.03 * (1 + 4 * x)));
    }
    return buf;
  }
  function impulse(seconds) {
    const len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len, k = 0.1 + 0.82 * x; // the tail darkens as it decays
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * Math.sqrt((1 + k) / (1 - k)) * Math.pow(1 - x, 3.2) * Math.min(1, i / (sr * 0.012));
      }
      // Early reflections off quay walls and hulls, offset between the ears.
      [[13, 0.55], [27, 0.4], [41, 0.32], [59, 0.24], [83, 0.18], [117, 0.12]].forEach(([ms, g], n) => {
        const j = Math.floor(((ms + c * 3.7) * sr) / 1000);
        if (j < len) d[j] += g * (n % 2 ? -1 : 1);
      });
    }
    return buf;
  }
  const SOFT = new Float32Array(1024).map((_, i) => Math.tanh(1.8 * ((i / 1023) * 2 - 1)));
  const BROWN = noise(6, 'brown'), PINK = noise(5, 'pink'), WHITE = noise(3, 'white'), RAIN = rainBuffer(4), SPARKS = sparkBuffer(1.4);

  const osc = (type, f, at = now()) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(at); return o; };
  const amp = (g) => { const n = ctx.createGain(); n.gain.value = g; return n; };
  const filter = (type, f, Q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
  const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(now(), Math.random() * buf.duration); return s; };

  // ------------------------------------------------------------ graph: dry and reverb buses into a gentle limiter
  const out = ctx.createGain(); out.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.3;
  // Master tone: nothing below 35 Hz (inaudible on most speakers, it only eats headroom), less low-mid mud, a little air.
  const floor = filter('highpass', 35, 0.7), body = filter('lowshelf', 220), air = filter('highshelf', 4000);
  body.gain.value = -3; air.gain.value = 2;
  out.connect(floor).connect(body).connect(air).connect(comp).connect(ctx.destination);
  const dry = ctx.createGain(); dry.connect(out);
  const wetIn = ctx.createGain(), wet = ctx.createGain(); wet.gain.value = 0.35;
  const verbCut = filter('highpass', 170); // keep rumble out of the tail
  const verb = ctx.createConvolver(); verb.buffer = impulse(2.8);
  wetIn.connect(verbCut).connect(verb).connect(wet).connect(out);

  const L = ctx.listener;
  if (L.positionX) { L.positionX.value = 0; L.positionY.value = 0; L.positionZ.value = 0; }
  /** Turn the listener's head (radians, + to the right); the pointer looks around the soundfield. */
  function face(a) {
    const fx = Math.sin(a), fz = -Math.cos(a);
    if (L.forwardX) { glide(L.forwardX, fx, 0.15); glide(L.forwardY, 0, 0.15); glide(L.forwardZ, fz, 0.15); glide(L.upY, 1, 0.15); }
    else L.setOrientation(fx, 0, fz, 0, 1, 0);
  }

  function panner(ref) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 1000;
    return p;
  }
  function placeNow(p, [x, y, z]) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }

  // ------------------------------------------------------------ continuous layers
  const voices = [];
  /** A layer with a level, an air-absorption filter and either a 3D position or a fixed stereo place. */
  function voice({ ref = 0, pan = 0, send = 0.3 } = {}) {
    const input = amp(0), air = filter('lowpass', 18000, 0.5);
    const place = ref ? panner(ref) : ctx.createStereoPanner();
    if (!ref) place.pan.value = pan;
    const s = amp(send);
    input.connect(air).connect(place);
    let linked = false, idle = 0, level = 0;
    // Silent layers leave the graph after a few seconds so they cost nothing to render.
    const link = (v) => {
      if (v === linked) return;
      linked = v;
      if (v) { place.connect(dry); place.connect(s); s.connect(wetIn); } else { place.disconnect(); s.disconnect(); }
    };
    const v = {
      input, place,
      set(x, tau = 0.3) { level = x; glide(input.gain, x, tau); if (x > 1e-4) { idle = 0; link(true); } },
      at(pos) {
        if (!ref) return;
        if (place.positionX) { glide(place.positionX, pos[0], 0.08); glide(place.positionY, pos[1], 0.08); glide(place.positionZ, pos[2], 0.08); }
        else place.setPosition(...pos);
        glide(air.frequency, clamp(22000 * Math.exp(-Math.hypot(...pos) / 28), 900, 18000), 0.2); // distance dulls the highs
      },
      tick(dt) { if (level <= 1e-4 && linked) { idle += dt; if (idle > 3) link(false); } },
    };
    voices.push(v);
    return v;
  }

  // Sea: two slow swells out of step, left and right; a wash of pink noise over a little low body.
  const sea = [-0.8, 0.8].map((pan, k) => {
    const v = voice({ pan, send: 0.12 }), f = filter('lowpass', 900, 0.5), g = amp(0.55), swell = osc('sine', k ? 0.053 : 0.071);
    swell.connect(amp(0.3)).connect(g.gain); swell.connect(amp(380)).connect(f.frequency); // crests are louder and brighter
    loop(PINK).connect(filter('highpass', 90, 0.7)).connect(f).connect(g).connect(v.input);
    loop(BROWN).connect(filter('lowpass', 240, 0.5)).connect(amp(0.12)).connect(g);
    return { v, f };
  });
  // Water lapping close to the camera.
  const lap = [-0.55, 0.55].map((pan, k) => {
    const v = voice({ pan, send: 0.1 }), f = filter('bandpass', k ? 640 : 520, 0.9), g = amp(0.45);
    const a = osc('sine', k ? 0.47 : 0.36), b = osc('sine', k ? 1.13 : 0.83);
    a.connect(amp(0.3)).connect(g.gain); b.connect(amp(0.18)).connect(g.gain); b.connect(amp(120)).connect(f.frequency);
    loop(PINK).connect(f).connect(g).connect(v.input);
    return v;
  });
  // Rain, following the footage's weather.
  const rain = voice({ send: 0.15 });
  loop(RAIN).connect(filter('lowpass', 7000, 0.3)).connect(rain.input);
  // Wind that rises with scroll speed.
  const wind = [-0.6, 0.6].map((pan) => {
    const v = voice({ pan, send: 0.05 }), f = filter('bandpass', 700, 0.6);
    loop(WHITE).connect(f).connect(v.input);
    return { v, f };
  });
  // Altitude wind for the aerial shot after the dive.
  const high = [-0.7, 0.7].map((pan, k) => {
    const v = voice({ pan, send: 0.2 }), f = filter('bandpass', k ? 520 : 430, 0.5), g = amp(0.6);
    osc('sine', k ? 0.11 : 0.17).connect(amp(0.35)).connect(g.gain);
    loop(PINK).connect(f).connect(g).connect(v.input);
    return v;
  });
  // The globe: a low drone, glassy partials that drift in and out, and a resonant whistle of air.
  const pad = [-0.55, 0.55].map((pan, k) => {
    const v = voice({ pan, send: 0.7 }), body = filter('lowpass', 2400, 0.3);
    for (const [f, g] of [[55, 0.05], [110, 0.1], [164.81, 0.05], [440, 0.026], [659.25, 0.02], [880, 0.014], [1318.5, 0.008]]) {
      const o = osc('sine', f); o.detune.value = k ? 4 : -4;
      const a = amp(g); o.connect(a).connect(body);
      if (f > 100) osc('sine', 0.04 + Math.random() * 0.07).connect(amp(g)).connect(a.gain); // each partial breathes on its own
    }
    const air = filter('bandpass', k ? 1150 : 900, 6), ag = amp(0.18);
    osc('sine', k ? 0.023 : 0.031).connect(amp(380)).connect(air.frequency);
    loop(PINK).connect(air).connect(ag).connect(v.input);
    body.connect(v.input);
    return v;
  });
  // Port machinery ahead: generator hum, a pump's beat, a low rumble.
  const port = voice({ ref: 10, send: 0.45 });
  {
    const g = amp(1), hum = filter('lowpass', 420, 0.8);
    osc('sawtooth', 99).connect(amp(0.06)).connect(hum); osc('sawtooth', 149.6).connect(amp(0.04)).connect(hum); // a generator's 50 Hz, heard by its harmonics
    osc('sine', 2.3).connect(amp(0.25)).connect(g.gain);
    loop(BROWN).connect(filter('bandpass', 160, 1.4)).connect(amp(0.25)).connect(g);
    loop(PINK).connect(filter('bandpass', 620, 1.2)).connect(amp(0.16)).connect(g);
    hum.connect(g); g.connect(port.input);
  }
  // Crane: a straining motor and the chatter of its gears.
  const crane = voice({ ref: 6, send: 0.35 });
  const craneMotor = [osc('sawtooth', 62), osc('sawtooth', 93.4)];
  const chatter = amp(0.03);
  {
    const tone = filter('bandpass', 480, 0.8), g = amp(1);
    craneMotor[0].connect(amp(0.6)).connect(tone); craneMotor[1].connect(amp(0.35)).connect(tone);
    const teeth = amp(0.5); osc('square', 17).connect(amp(0.5)).connect(teeth.gain); // gear teeth: a 17 Hz gate
    loop(WHITE).connect(filter('bandpass', 2300, 3)).connect(teeth).connect(chatter).connect(g);
    tone.connect(g); g.connect(crane.input);
  }
  // Truck: a deep engine, tyres on wet tarmac and the spray behind them.
  const truck = voice({ ref: 5, send: 0.3 });
  const engine = [osc('sawtooth', 44), osc('sine', 88)];
  const tyre = amp(0), spray = amp(0);
  {
    const g = amp(1), body = filter('lowpass', 380, 0.9), shaper = ctx.createWaveShaper(); shaper.curve = SOFT;
    engine[0].connect(amp(0.32)).connect(shaper).connect(filter('highpass', 70, 0.7)).connect(body); engine[1].connect(amp(0.12)).connect(body);
    loop(PINK).connect(filter('bandpass', 2200, 0.6)).connect(tyre).connect(g);
    loop(WHITE).connect(filter('highpass', 3500, 0.5)).connect(spray).connect(g);
    body.connect(g); g.connect(truck.input);
  }
  // A coaster's diesel and its wake.
  const vessel = voice({ ref: 8, send: 0.35 });
  {
    const g = amp(0.6), body = filter('lowpass', 320, 1), wake = amp(0.25);
    osc('sawtooth', 51).connect(amp(0.3)).connect(filter('highpass', 70, 0.7)).connect(body);
    osc('sine', 4.1).connect(amp(0.35)).connect(g.gain); // the diesel's slow beat
    osc('sine', 0.21).connect(amp(0.1)).connect(wake.gain);
    loop(PINK).connect(filter('bandpass', 850, 0.6)).connect(wake).connect(vessel.input);
    body.connect(g).connect(vessel.input);
  }
  // The city far ahead of the road.
  const city = voice({ ref: 40, send: 0.4 });
  loop(PINK).connect(filter('highpass', 80, 0.7)).connect(filter('lowpass', 520, 0.5)).connect(amp(0.5)).connect(city.input);
  loop(PINK).connect(filter('bandpass', 900, 0.8)).connect(amp(0.12)).connect(city.input);
  city.at(CITY);

  // ------------------------------------------------------------ one-shot sounds, each placed where it happens
  let live = 0;
  function shot(pos, { ref = 5, send = 0.4, must = false } = {}) {
    if (live >= 12 && !must) return null;
    live++;
    const g = amp(1), p = panner(ref), s = amp(send);
    placeNow(p, pos);
    g.connect(p); p.connect(dry); p.connect(s); s.connect(wetIn);
    return { g, p, done: () => { live--; g.disconnect(); p.disconnect(); s.disconnect(); } };
  }
  function finish(v, end) {
    const c = ctx.createConstantSource(); c.offset.value = 0; c.connect(v.g);
    c.onended = v.done; c.start(); c.stop(end + 0.1);
  }
  /** Envelope: up to `peak` in `att` seconds from t, then a decay with time constant `tau`. */
  function strike(param, t, peak, att, tau) {
    param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + att); param.setTargetAtTime(0, t + att, tau);
  }

  function horn(pos, f, dur, level, delay = 0) {
    const v = shot(pos, { ref: 6, send: 1.1, must: true });
    const t = now() + 0.03 + delay, end = t + dur + 2.2;
    const shaper = ctx.createWaveShaper(); shaper.curve = SOFT;
    const env = amp(0);
    for (const [r, g, det] of [[1, 0.42, -7], [1, 0.42, 7], [2, 0.16, 2], [3, 0.07, -3]]) {
      const o = osc('sawtooth', f * r, t);
      o.detune.setValueAtTime(det - 80, t); o.detune.linearRampToValueAtTime(det, t + 0.4); // an air horn bends up to pitch
      o.connect(amp(g)).connect(shaper); o.stop(end);
    }
    const breath = ctx.createBufferSource(); breath.buffer = PINK; breath.loop = true;
    breath.connect(filter('bandpass', f * 4, 1.5)).connect(amp(0.25)).connect(shaper); breath.start(t, Math.random()); breath.stop(end);
    shaper.connect(filter('lowpass', f * 6.5, 1.1)).connect(env).connect(v.g);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(level, t + 0.28);
    env.gain.setValueAtTime(level, t + dur); env.gain.setTargetAtTime(0, t + dur, 0.32);
    finish(v, end);
  }
  /** Struck steel: inharmonic modes ringing down, a burst of noise for the hit, an optional falling thud for weight. */
  function clank(pos, { size = 1, level = 1, thud = 0, delay = 0, must = false } = {}) {
    const v = shot(pos, { ref: 4, send: 0.55, must });
    if (!v) return;
    const t = now() + 0.01 + delay, f0 = 165 / size;
    for (const [r, g, d] of [[1, 1, 0.9], [2.32, 0.55, 0.7], [4.25, 0.32, 0.5], [6.63, 0.2, 0.32], [9.38, 0.12, 0.2]]) {
      const o = osc('sine', f0 * r * (1 + (Math.random() - 0.5) * 0.02), t), e = amp(0);
      strike(e.gain, t, g * 0.3 * level, 0.003, d * size * 0.35);
      o.connect(e).connect(v.g); o.stop(t + d * size * 2.2 + 0.1);
    }
    const hit = ctx.createBufferSource(); hit.buffer = WHITE;
    const he = amp(0); strike(he.gain, t, 0.6 * level, 0.002, 0.014);
    hit.connect(filter('bandpass', 1400 / size, 0.9)).connect(he).connect(v.g); hit.start(t, Math.random() * 2); hit.stop(t + 0.15);
    if (thud) {
      const o = osc('sine', 120, t), e = amp(0);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.25); strike(e.gain, t, thud, 0.006, 0.12);
      o.connect(e).connect(v.g); o.stop(t + 0.9);
    }
    finish(v, t + 2.2 * size + 0.3);
  }
  /** Compressed air let go: a bright burst that settles into a falling hiss. */
  function hiss(pos, dur, level, sparks = 0) {
    const v = shot(pos, { ref: 4, send: 0.35 });
    if (!v) return;
    const t = now() + 0.01, end = t + dur * 2 + 0.2;
    const n = ctx.createBufferSource(); n.buffer = WHITE; n.loop = true;
    const hp = filter('highpass', 3600, 0.7), body = filter('peaking', 5400, 1.3); body.gain.value = 5;
    hp.frequency.setValueAtTime(3600, t); hp.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const e = amp(0);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(level, t + 0.012);
    e.gain.setTargetAtTime(level * 0.5, t + 0.04, 0.06); e.gain.setTargetAtTime(0, t + 0.2, dur * 0.32);
    n.connect(hp).connect(body).connect(e).connect(v.g); n.start(t, Math.random() * 2); n.stop(end);
    if (sparks) {
      const s = ctx.createBufferSource(); s.buffer = SPARKS;
      s.connect(filter('highpass', 2500, 0.7)).connect(amp(sparks)).connect(v.g); s.start(t + 0.05);
    }
    finish(v, end);
  }
  /** Filtered noise travelling from one point to another. */
  function whoosh(from, to, { dur = 1.2, f1 = 300, f2 = 2000, level = 0.5, q = 0.8, type = 'bandpass', must = false } = {}) {
    const v = shot(from, { ref: 3, send: 0.5, must });
    if (!v) return;
    const t = now() + 0.01;
    if (v.p.positionX) [v.p.positionX, v.p.positionY, v.p.positionZ].forEach((param, i) => { param.setValueAtTime(from[i], t); param.linearRampToValueAtTime(to[i], t + dur); });
    const n = ctx.createBufferSource(); n.buffer = PINK; n.loop = true;
    const f = filter(type, f1, q); f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const e = amp(0); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(level, t + dur * 0.6); e.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f).connect(e).connect(v.g); n.start(t, Math.random() * 2); n.stop(t + dur + 0.05);
    finish(v, t + dur + 0.1);
  }
  /** The tide wipe: water rising past both ears (falling when scrolling back). */
  function surge(up) {
    for (const x of [-2.6, 2.6]) whoosh([x, up ? -3.5 : 3, -2.5], [x * 0.7, up ? 2.5 : -3, -3], { dur: 1.5, f1: up ? 220 : 1600, f2: up ? 1600 : 220, level: 0.45, q: 0.5, type: 'lowpass' });
  }
  function boom(pos, level, dur) {
    const v = shot(pos, { ref: 4, send: 0.6 });
    if (!v) return;
    const t = now() + 0.01, o = osc('sine', 90, t), e = amp(0);
    o.frequency.exponentialRampToValueAtTime(40, t + dur);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(level, t + 0.6); e.gain.setTargetAtTime(0, t + 0.8, dur * 0.3);
    o.connect(e).connect(v.g); o.stop(t + dur + 1);
    finish(v, t + dur + 1);
  }
  function tick(pos) {
    const v = shot(pos, { ref: 3, send: 0.15 });
    if (!v) return;
    const t = now() + 0.005;
    for (const [f, g] of [[2100, 0.1], [3170, 0.05]]) { const o = osc('sine', f, t), e = amp(0); strike(e.gain, t, g, 0.001, 0.012); o.connect(e).connect(v.g); o.stop(t + 0.12); }
    finish(v, t + 0.15);
  }
  /** Home: a soft bell from the Chittagong marker on the closing globe. */
  function ping(pos) {
    const v = shot(pos, { ref: 4, send: 1.2, must: true });
    const t = now() + 0.01;
    for (const [f, g, d] of [[659.25, 0.16, 1.6], [987.77, 0.09, 1.2], [1318.5, 0.04, 0.8]]) {
      const o = osc('sine', f, t), e = amp(0); strike(e.gain, t, g, 0.01, d * 0.45); o.connect(e).connect(v.g); o.stop(t + d * 3);
    }
    finish(v, t + 5);
  }

  const fired = {};
  function fire(name, arg, m) {
    const t = now(), key = arg ? name + arg.join() : name;
    if (fired[key] !== undefined && t - fired[key] < (name === 'horn' ? 18 : 0.6)) return;
    fired[key] = t;
    switch (name) {
      case 'far': clank(m.portPos.map((v, i) => v + arg[i]), { size: 1.3, level: 0.6 }); break;
      case 'descent': whoosh([0, 6, -7], [0, -2, -1.5], { dur: 2.4, f1: 2600, f2: 220, level: 0.4, q: 0.5, must: true }); boom([0, -3, -3], 0.35, 2); break;
      case 'horn': horn([11, 2, -58], 98, 2.6, 2.4); horn([-34, 4, -96], 123.47, 1.7, 2.2, 2.9); break; // and a ship further off answers
      case 'unlatch': clank([6, 4, -20], { size: 0.8, level: 0.8, must: true }); clank([6, 4, -20], { size: 0.45, level: 0.5, delay: 0.14 }); break;
      case 'landTruck': clank([0.3, -0.6, -9], { size: 1.3, level: 1.1, thud: 0.5, must: true }); clank([-0.6, -0.6, -9], { size: 0.5, level: 0.5, delay: 0.18 }); break;
      case 'airBrake': hiss([-2.2, -1.4, -7], 1.6, 0.6, 0.3); break;
      case 'puff': hiss([-1.2, -1.4, -7.5], 0.9, 0.38); break;
      case 'home': ping([1.2, 0.6, -5]); break;
      default:
    }
  }

  // ------------------------------------------------------------ per-frame update
  let prev = null, truckDist = null, doppler = 0;
  const toAudio = (c, s, z = -6) => [(c.x / s.w - 0.5) * 8, (0.5 - c.y / s.h) * 5, z];

  function update(s) {
    const dt = clamp(s.dt || 1 / 60, 1 / 240, 0.1);
    const jump = !prev || Math.abs(s.y - prev.y) > s.h * 1.2; // menu and rail jumps cut: no cues, no Doppler
    let m = mixAt(s.id, s.t > 0 ? 1 : s.p);
    if (s.next && s.t > 0) m = blend(m, mixAt(s.next, 0), smooth(0.12, 0.88, s.t));
    const speed = Math.abs(s.vel || 0);
    const work = clamp(speed / 1.2);

    // The 3D stack drives the crane: it rides the container being lowered, then winds up and away.
    if (s.stack) {
      const st = s.stack, n = st.count;
      let active = -1;
      for (let k = 0; k < n; k++) { const d = (st.p - (0.04 + k * 0.075)) / 0.2; if (d > 0 && d < 1) { active = k; break; } }
      const after = clamp((st.p - (0.04 + (n - 1) * 0.075 + 0.2)) / 0.15);
      if (active >= 0) { const c = toAudio(st.project(active), s); m.crane = 0.75; m.cranePos = [c[0], c[1] + 0.6, c[2]]; }
      else if (after > 0 && after < 1) { const c = toAudio(st.project(n - 1), s); m.crane = 0.75 * (1 - after); m.cranePos = [c[0], c[1] + 0.6 + after * 4, c[2]]; }
    }

    for (const v of pad) v.set(m.pad * CEIL.pad, 0.8);
    for (const v of high) v.set(m.high * CEIL.high, 0.5);
    for (const { v, f } of sea) { v.set(m.sea * CEIL.sea, 0.8); glide(f.frequency, m.seaTone, 0.8); }
    for (const v of lap) v.set(m.lap * CEIL.lap, 0.6);
    rain.set(clamp(s.rain || 0) * CEIL.rain, 0.6);
    for (const { v, f } of wind) { v.set(Math.min(CEIL.wind, speed * 0.16), 0.15); glide(f.frequency, 600 + 1100 * clamp(speed / 2), 0.2); }
    port.set(m.port * CEIL.port, 0.6); port.at(m.portPos);
    crane.set(m.crane * CEIL.crane * (0.55 + 0.45 * work), 0.25); crane.at(m.cranePos);
    for (const o of craneMotor) glide(o.detune, 380 * work, 0.2);
    glide(chatter.gain, 0.02 + 0.08 * work, 0.2);
    vessel.set(m.vessel * CEIL.vessel, 0.8); vessel.at(m.vesselPos);
    city.set(m.city * CEIL.city, 1);
    glide(wet.gain, m.wet, 0.8);

    // The truck: throttle follows scroll speed; its pitch bends with its motion toward or away from the listener.
    truck.set(m.truck * CEIL.truck, 0.4); truck.at(m.truckPos);
    // Only an audible truck moves; a silent one can be re-placed without a pitch swoop.
    const d = Math.hypot(...m.truckPos), vr = jump || truckDist === null ? 0 : clamp((d - truckDist) / dt, -C / 2, C / 2);
    truckDist = m.truck > 0.01 ? d : null;
    doppler += (clamp(-1200 * Math.log2(1 + vr / C), -240, 240) - doppler) * Math.min(1, dt * 8);
    const throttle = m.truckRun * clamp(speed / 1.4);
    for (const o of engine) glide(o.detune, doppler + 560 * throttle, 0.1);
    glide(tyre.gain, m.truckRun ? 0.04 + 0.3 * throttle : 0, 0.15);
    glide(spray.gain, m.truckRun ? (0.02 + 0.16 * throttle) * clamp((s.rain || 0) * 1.5) : 0, 0.15);

    face((s.pointer?.[0] || 0) * 0.55);
    for (const v of voices) v.tick(dt);
    if (!jump) cues(prev, s, m);
    prev = s;
  }

  function cues(a, b, m) {
    if (a.id === b.id) {
      for (const [at, name, arg] of CUES[b.id] || []) if (cross(a.p, b.p, at) > 0) fire(name, arg, m);
      if (b.exit === 'tide') { const c = cross(a.t, b.t, 0.3); if (c) surge(c > 0); }
      if (b.id === 'group' && cross(a.t, b.t, 0.72) > 0) fire('home');
    }
    if (a.stack && b.stack) {
      for (let k = 0; k < b.stack.count; k++) {
        const c = cross(a.stack.p, b.stack.p, 0.24 + 0.075 * k);
        if (!c) continue;
        const pos = toAudio(b.stack.project(k), b);
        if (c > 0) { clank(pos, { size: 1, level: 0.6, thud: 0.4, must: true }); clank(pos, { size: 0.42, level: 0.45, delay: 0.16, must: true }); } // it lands, its twist-locks catch
        else clank(pos, { size: 0.7, level: 0.35 }); // lifted back off when scrolling up
      }
    }
  }

  return {
    enable(on) { glide(out.gain, on ? 0.6 : 0, on ? 0.5 : 0.2); },
    update,
    /** Interface sounds placed at a stack container: 'hover' ticks, 'fly' rushes into it. */
    cue(name, k) {
      if (!prev?.stack || k < 0) return;
      const pos = toAudio(prev.stack.project(k), prev);
      if (name === 'hover') tick(pos);
      if (name === 'fly') { whoosh([pos[0], pos[1], -7], [0, 0, -0.5], { dur: 0.75, f1: 350, f2: 2600, level: 0.5, must: true }); clank([0, 0, -1], { size: 0.6, level: 0.4, delay: 0.7 }); }
    },
  };
}
