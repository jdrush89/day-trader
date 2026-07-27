/**
 * Procedural SNES adventure–style title music using WebAudio oscillators.
 * An epic D‑minor overture in four sections (A/B/C/D), each 8 chords × 2 beats,
 * giving a 64‑beat loop (~35 s at 110 BPM). Layered voices:
 *   - Lead melody       (square, punchy attack)
 *   - Counter‑melody    (triangle, softer echo of the lead)
 *   - Chord pad         (two detuned squares, sustained)
 *   - Arpeggio          (sine, gentle sixteenths, upper octave)
 *   - Bass              (triangle, root/fifth walking pattern)
 *   - Timpani thump     (sine boom on chord changes for drama)
 *
 * Volume 0 = muted. Persisted in localStorage as "musicVolume" (0‑100, default 0).
 * "musicLastVolume" remembers the last non‑zero volume so the speaker toggle can
 * restore it.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noteTimer: number | null = null;
let nextNoteBeat = 0;
let nextNoteTime = 0;
let started = false;

const BPM = 110;
const BEAT_SEC = 60 / BPM;
const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.15;
const MAX_GAIN = 0.4; // gain when volume = 100

// ---- Progression -----------------------------------------------------------
// D natural minor with occasional major-V feel. Each entry: [rootMidi, quality].
// D3=50, F3=53, G3=55, A3=57, Bb3=58, C4=60, Dm root we treat as MIDI 62 (D4)
// for the lead layer; bass drops these an octave.
type Chord = [number, "maj" | "min"];
const SECTION_A: Chord[] = [
  [62, "min"], [58, "maj"], [65, "maj"], [60, "maj"], // Dm  Bb  F  C
  [62, "min"], [58, "maj"], [55, "min"], [57, "maj"], // Dm  Bb  Gm A
];
const SECTION_B: Chord[] = [
  [65, "maj"], [60, "maj"], [62, "min"], [57, "min"], // F   C   Dm Am
  [58, "maj"], [65, "maj"], [55, "min"], [57, "maj"], // Bb  F   Gm A
];
const SECTION_C: Chord[] = [
  [62, "min"], [57, "maj"], [58, "maj"], [65, "maj"], // Dm  A   Bb F  (climb)
  [55, "min"], [62, "min"], [58, "maj"], [57, "maj"], // Gm  Dm  Bb A
];
const SECTION_D: Chord[] = [
  [65, "maj"], [60, "maj"], [55, "min"], [62, "min"], // F   C   Gm Dm
  [58, "maj"], [57, "maj"], [62, "min"], [62, "min"], // Bb  A   Dm Dm  (resolve)
];
const PROGRESSION: Chord[] = [
  ...SECTION_A, ...SECTION_B, ...SECTION_C, ...SECTION_D,
];

// ---- Melodies --------------------------------------------------------------
// Each phrase is 8 sixteenth‑note steps (= 2 beats), values are semitone
// offsets from the chord root; null = rest. One phrase per chord (32 total).
const MELODY: (number | null)[][] = [
  // Section A — statement of the theme
  [ 0,  7, 12, 10,  7,  5,  7, 10],
  [ 5,  7, 10, 12, 10,  7,  5,  3],
  [ 7,  5,  4,  7,  9, 12,  9,  7],
  [ 4,  7, 12,  7,  4,  0,  4,  7],
  [ 0,  7, 12, 15, 14, 12, 10,  7],
  [ 5,  7, 10, 12, 14, 12, 10,  7],
  [ 7, 10,  7,  5,  7, 10, 12, 10],
  [12, 11,  9,  7,  4,  7,  9, 11],

  // Section B — restatement + variation
  [ 4,  7, 12,  7,  9,  7,  4,  0],
  [ 0,  4,  7, 12,  7,  4,  0, -3],
  [ 0,  3,  7, 12, 10,  7,  3,  0],
  [ 0,  4,  7, 12,  7,  4,  0, -5],
  [ 5,  7, 10, 12, 10,  7,  5,  7],
  [ 4,  7, 12, 16, 14, 12,  7,  4],
  [ 7, 10, 12, 15, 14, 12, 10,  7],
  [ 4,  7, 12, 11,  9,  7,  4,  0],

  // Section C — climb: register jumps up, phrases push forward
  [12, 14, 15, 17, 14, 12, 10,  9],
  [ 9, 12, 16, 12,  9,  7,  9, 12],
  [10, 12, 15, 17, 15, 14, 12, 10],
  [12, 16, 17, 16, 12,  9,  7,  9],
  [ 7, 10, 15, 17, 15, 12, 10,  7],
  [12, 15, 17, 19, 17, 15, 14, 12],
  [14, 12, 10,  7, 10, 12, 14, 15],
  [12, 16, 14, 12,  9,  7,  4,  7],

  // Section D — release, come home
  [ 5,  7, 12,  7,  5,  0,  5,  7],
  [ 4,  7, 12,  7,  4,  0,  4, -3],
  [ 3,  7, 10,  7,  3, -2,  3,  7],
  [ 0,  7, 12, 10,  7,  5,  4,  0],
  [ 5,  7, 12, 15, 14, 12, 10,  7],
  [ 4,  9, 12, 16, 14, 12,  9,  4],
  [ 0,  3,  7, 12, 14, 12,  7,  3],
  [ 0,  7,  0,  7, 12,  7, 12, 24], // final flourish → high tonic
];

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function chordNotes(root: number, kind: "maj" | "min"): number[] {
  const third = kind === "maj" ? 4 : 3;
  return [root, root + third, root + 7];
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);
  return ctx;
}

function playTone(
  freq: number,
  when: number,
  dur: number,
  type: OscillatorType,
  peakGain: number,
  attack = 0.01,
  detune = 0,
) {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peakGain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(masterGain);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

// Timpani‑ish thump: pitched sine that pitch‑drops quickly.
function playThump(freq: number, when: number, peakGain: number) {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.25);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peakGain, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
  osc.connect(g).connect(masterGain);
  osc.start(when);
  osc.stop(when + 0.5);
}

function scheduleNoteBeat(beat: number, time: number) {
  const chordIdx = Math.floor(beat / 2) % PROGRESSION.length;
  const [root, kind] = PROGRESSION[chordIdx];
  const stepIdx = Math.floor((beat * 4) % 8);
  const isChordChange = (beat * 4) % 8 === 0;
  const isBeat = beat % 1 === 0;
  const isEighth = (beat * 2) % 1 === 0;

  // Which macro section are we in — used to grow the arrangement over the loop
  const section = Math.floor(chordIdx / 8); // 0..3 A/B/C/D

  // --- Bass: root on chord change, walking fifth mid‑bar
  if (isChordChange) {
    const bassRoot = root - 24; // two octaves down
    playTone(midiToHz(bassRoot), time, 1.6, "triangle", 0.16, 0.02);
    playThump(midiToHz(bassRoot - 12), time, section >= 2 ? 0.25 : 0.15);
  } else if ((beat * 4) % 8 === 4) {
    const fifth = root - 24 + 7;
    playTone(midiToHz(fifth), time, 1.0, "triangle", 0.12, 0.02);
  }

  // --- Chord pad: two detuned squares held for the full 2‑beat chord
  if (isChordChange) {
    const [r, t3, fifth] = chordNotes(root - 12, kind);
    const padDur = 2 * BEAT_SEC - 0.05;
    const padGain = section >= 1 ? 0.045 : 0.035;
    for (const n of [r, t3, fifth]) {
      playTone(midiToHz(n), time, padDur, "square", padGain, 0.06, -6);
      playTone(midiToHz(n), time, padDur, "square", padGain, 0.06, +6);
    }
  }

  // --- Arpeggio: sixteenth notes climbing the chord (upper octave)
  // Adds sparkle in sections B/C/D; sparse in A.
  if (section >= 1 || isBeat) {
    const arp = chordNotes(root + 12, kind);
    const note = arp[stepIdx % arp.length];
    playTone(midiToHz(note), time + 0.003, 0.18, "sine", 0.05, 0.005);
  }

  // --- Lead melody (square, punchy)
  const phrase = MELODY[chordIdx];
  const step = phrase[stepIdx];
  if (step !== null) {
    playTone(midiToHz(root + step), time, 0.28, "square", 0.11, 0.008);
  }

  // --- Counter‑melody: triangle echo an eighth after the lead, one octave down
  // Only in sections B/C/D so the arrangement grows over time.
  if (section >= 1 && isEighth) {
    const prevStep = phrase[(stepIdx - 2 + 8) % 8];
    if (prevStep !== null) {
      playTone(midiToHz(root + prevStep - 12), time, 0.32, "triangle", 0.06, 0.02);
    }
  }

  // --- Section C climax: high sparkle octave on every beat
  if (section === 2 && isBeat) {
    playTone(midiToHz(root + 24), time + 0.01, 0.14, "sine", 0.045, 0.005);
  }
}

function scheduler() {
  if (!ctx) return;
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleNoteBeat(nextNoteBeat, nextNoteTime);
    nextNoteTime += BEAT_SEC / 4; // 16th‑note grid
    nextNoteBeat += 0.25;
  }
}

// ---- Volume API ------------------------------------------------------------
const VOL_KEY = "musicVolume";
const LAST_VOL_KEY = "musicLastVolume";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function applyGain(vol: number) {
  if (!ctx || !masterGain) return;
  const t = ctx.currentTime;
  const target = (clamp(vol, 0, 100) / 100) * MAX_GAIN;
  masterGain.gain.cancelScheduledValues(t);
  masterGain.gain.setValueAtTime(masterGain.gain.value, t);
  masterGain.gain.linearRampToValueAtTime(target, t + 0.15);
  if (target > 0 && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/** Current music volume, 0‑100. Defaults to 0 (muted). */
export function getMusicVolume(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(VOL_KEY);
  if (v === null) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? clamp(n, 0, 100) : 0;
}

/** Set music volume 0‑100. Persists to localStorage. Remembers last non‑zero. */
export function setMusicVolume(vol: number): number {
  const v = Math.round(clamp(vol, 0, 100));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VOL_KEY, String(v));
    if (v > 0) window.localStorage.setItem(LAST_VOL_KEY, String(v));
  }
  applyGain(v);
  return v;
}

/** True if volume is currently 0. */
export function isMusicMuted(): boolean {
  return getMusicVolume() === 0;
}

/**
 * Toggle mute. When unmuting, restores the last non‑zero volume (or 50 if none).
 * Returns the new muted state.
 */
export function toggleMusicMute(): boolean {
  const cur = getMusicVolume();
  if (cur > 0) {
    setMusicVolume(0);
    return true;
  }
  let last = 50;
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LAST_VOL_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n) && n > 0) last = clamp(n, 1, 100);
  }
  setMusicVolume(last);
  return false;
}

// ---- Lifecycle -------------------------------------------------------------

/** Spin up the audio context and start the scheduler. Idempotent. */
export function startMusic(): void {
  const c = ensureCtx();
  if (!c || started) return;
  started = true;
  nextNoteTime = c.currentTime + 0.1;
  nextNoteBeat = 0;
  noteTimer = window.setInterval(scheduler, LOOK_AHEAD_MS);
  applyGain(getMusicVolume());
  if (c.state === "suspended") c.resume().catch(() => {});
}

/** Fade out and stop the scheduler (used when leaving the title screen). */
export function stopMusic(): void {
  if (masterGain && ctx) {
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0, t + 0.4);
  }
  if (noteTimer !== null) {
    window.clearInterval(noteTimer);
    noteTimer = null;
  }
  started = false;
}
