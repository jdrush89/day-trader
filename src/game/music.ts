/**
 * Procedural SNES-adventure-style multi-track music engine.
 *
 * One WebAudio context and one 16th-note scheduler. A `TrackDef` describes the
 * chord progression, per-chord melody phrase, tempo, and instrumentation
 * "style" — the scheduler renders whatever track is currently selected, and
 * cross-fades between tracks when the selection changes.
 *
 * Volume 0-100 is persisted as "musicVolume" in localStorage (default 0 = muted).
 * "musicLastVolume" remembers the last non-zero level for the mute toggle.
 */

// ---------- Audio context / scheduler state ---------------------------------

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noteTimer: number | null = null;
let nextNoteBeat = 0;
let nextNoteTime = 0;
let started = false;

const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.15;
const MAX_GAIN = 0.4;

// ---------- Track definitions -----------------------------------------------

type Chord = [number, "maj" | "min"];

/**
 * Instrument style flags — each track picks a set of layers to render for its
 * signature feel. Kept simple so the scheduler stays readable.
 */
type Style = {
  pad?: boolean;         // sustained detuned-square chord pad
  arp?: boolean;         // 16th sine arpeggio in upper octave
  arpEighths?: boolean;  // arpeggio only on 8ths (calmer)
  bass?: "walk" | "root-fifth" | "root-only" | "eighths" | "shuffle";
  counter?: boolean;     // triangle counter-melody echo, one octave down
  thump?: boolean;       // timpani thump on chord change
  sparkle?: boolean;     // high sine sparkle on each beat
  lead?: OscillatorType; // waveform for lead melody
  bassOct?: number;      // how many octaves below chord root the bass sits
  leadGain?: number;     // override lead gain
};

type TrackDef = {
  id: string;
  bpm: number;
  progression: Chord[];
  /** Melody phrase per chord, 8 sixteenth-note steps each (2 beats/chord). */
  melody: (number | null)[][];
  style: Style;
};

/** Note utility */
function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function chordNotes(root: number, kind: "maj" | "min"): number[] {
  const third = kind === "maj" ? 4 : 3;
  return [root, root + third, root + 7];
}

// -- title: existing epic D-minor overture (kept from previous version) ------

const TITLE_PROGRESSION: Chord[] = [
  // A
  [62, "min"], [58, "maj"], [65, "maj"], [60, "maj"],
  [62, "min"], [58, "maj"], [55, "min"], [57, "maj"],
  // B
  [65, "maj"], [60, "maj"], [62, "min"], [57, "min"],
  [58, "maj"], [65, "maj"], [55, "min"], [57, "maj"],
  // C
  [62, "min"], [57, "maj"], [58, "maj"], [65, "maj"],
  [55, "min"], [62, "min"], [58, "maj"], [57, "maj"],
  // D
  [65, "maj"], [60, "maj"], [55, "min"], [62, "min"],
  [58, "maj"], [57, "maj"], [62, "min"], [62, "min"],
];
const TITLE_MELODY: (number | null)[][] = [
  [ 0,  7, 12, 10,  7,  5,  7, 10],
  [ 5,  7, 10, 12, 10,  7,  5,  3],
  [ 7,  5,  4,  7,  9, 12,  9,  7],
  [ 4,  7, 12,  7,  4,  0,  4,  7],
  [ 0,  7, 12, 15, 14, 12, 10,  7],
  [ 5,  7, 10, 12, 14, 12, 10,  7],
  [ 7, 10,  7,  5,  7, 10, 12, 10],
  [12, 11,  9,  7,  4,  7,  9, 11],

  [ 4,  7, 12,  7,  9,  7,  4,  0],
  [ 0,  4,  7, 12,  7,  4,  0, -3],
  [ 0,  3,  7, 12, 10,  7,  3,  0],
  [ 0,  4,  7, 12,  7,  4,  0, -5],
  [ 5,  7, 10, 12, 10,  7,  5,  7],
  [ 4,  7, 12, 16, 14, 12,  7,  4],
  [ 7, 10, 12, 15, 14, 12, 10,  7],
  [ 4,  7, 12, 11,  9,  7,  4,  0],

  [12, 14, 15, 17, 14, 12, 10,  9],
  [ 9, 12, 16, 12,  9,  7,  9, 12],
  [10, 12, 15, 17, 15, 14, 12, 10],
  [12, 16, 17, 16, 12,  9,  7,  9],
  [ 7, 10, 15, 17, 15, 12, 10,  7],
  [12, 15, 17, 19, 17, 15, 14, 12],
  [14, 12, 10,  7, 10, 12, 14, 15],
  [12, 16, 14, 12,  9,  7,  4,  7],

  [ 5,  7, 12,  7,  5,  0,  5,  7],
  [ 4,  7, 12,  7,  4,  0,  4, -3],
  [ 3,  7, 10,  7,  3, -2,  3,  7],
  [ 0,  7, 12, 10,  7,  5,  4,  0],
  [ 5,  7, 12, 15, 14, 12, 10,  7],
  [ 4,  9, 12, 16, 14, 12,  9,  4],
  [ 0,  3,  7, 12, 14, 12,  7,  3],
  [ 0,  7,  0,  7, 12,  7, 12, 24],
];

// -- Compact per-track configs ----------------------------------------------
// Each non-title track uses 8 chords / 8 phrases = ~16 beats. That's ~9-10s at
// most tempos, enough to feel like a real theme when you're on a screen for a
// minute or two.

const TRACKS: Record<string, TrackDef> = {
  title: {
    id: "title", bpm: 110,
    progression: TITLE_PROGRESSION, melody: TITLE_MELODY,
    style: { pad: true, arp: true, counter: true, thump: true, sparkle: true, bass: "walk", lead: "square", bassOct: 2 },
  },

  // Trading: fast neon-floor chiptune. No pad: clipped bass and rapid arpeggios
  // keep it far away from the suspended feel of the pause theme.
  trading: {
    id: "trading", bpm: 152,
    progression: [
      [61, "min"], [64, "maj"], [59, "maj"], [66, "maj"],
      [61, "min"], [57, "maj"], [59, "maj"], [61, "min"],
    ],
    melody: [
      [ 0,  3,  7, 12, 15, 12,  7,  3],
      [12,  7,  4,  0,  4,  7, 11,  7],
      [ 0,  4,  7, 11, 14, 11,  7,  4],
      [ 7, 11, 14, 19, 14, 11,  7,  4],
      [12, 10,  7,  3,  0,  3,  7, 10],
      [ 0,  4,  7, 12,  9,  7,  4,  0],
      [ 0,  4,  7, 11,  7, 11, 14, 11],
      [12,  7,  3,  0,  7, 10, 15, 19],
    ],
    style: { bass: "eighths", lead: "square", arp: true, thump: true, sparkle: true, bassOct: 2, leadGain: 0.12 },
  },

  // Trading start: brash opening-bell fanfare with a rising whole-tone flavor.
  "trading-start": {
    id: "trading-start", bpm: 144,
    progression: [
      [66, "maj"], [61, "maj"], [63, "maj"], [68, "maj"],
      [66, "maj"], [70, "maj"], [61, "maj"], [66, "maj"],
    ],
    melody: [
      [ 0,  4,  7, 12, 16, 19, 16, 12],
      [ 7, 12, 16, 19, 16, 12,  7,  4],
      [ 0,  4,  7, 11, 14, 19, 14, 11],
      [ 7, 12, 16, 19, 24, 19, 16, 12],
      [12, 16, 19, 24, 19, 16, 12,  7],
      [ 7, 11, 14, 19, 23, 19, 14, 11],
      [ 0,  4,  7, 12, 16, 12,  7,  4],
      [12, 16, 19, 24, 19, 24, 28, 31],
    ],
    style: { bass: "eighths", sparkle: true, arp: true, thump: true, lead: "square", bassOct: 2, leadGain: 0.13 },
  },

  // Restaurant: bouncy diner in F major. Playful, syncopated.
  // F=65, Bb=58, C=60, Dm=62, Gm=55
  restaurant: {
    id: "restaurant", bpm: 132,
    progression: [
      [65, "maj"], [62, "min"], [58, "maj"], [60, "maj"],
      [65, "maj"], [55, "min"], [60, "maj"], [65, "maj"],
    ],
    melody: [
      [ 7, 12,  9,  7, 12, 16, 12,  9],
      [ 0,  7, 12,  7,  4,  7, 12,  7],
      [ 7, 10, 14, 10,  7, 14, 10,  7],
      [ 4,  9, 12, 16, 12,  9,  4,  9],
      [ 0,  7, 12, 16, 12,  9,  7,  4],
      [ 3,  7, 10, 14, 10,  7,  3,  0],
      [ 4,  7, 12,  9,  4,  7, 12, 16],
      [ 7, 12, 16, 19, 16, 12,  7, 12],
    ],
    style: { bass: "shuffle", pad: true, arpEighths: true, lead: "square", bassOct: 2 },
  },

  // Shwendy's start screen: retro jingle, brighter and shorter feel
  "restaurant-start": {
    id: "restaurant-start", bpm: 138,
    progression: [
      [65, "maj"], [60, "maj"], [65, "maj"], [58, "maj"],
      [65, "maj"], [60, "maj"], [67, "maj"], [65, "maj"],
    ],
    melody: [
      [12,  7, 12, 16, 12,  7, 12, 16],
      [ 4,  7, 12,  7,  4,  7, 12,  7],
      [12,  7, 12, 16, 12, 19, 16, 12],
      [ 7,  9, 12, 14,  9,  7,  9,  4],
      [12, 16, 19, 24, 19, 16, 12,  7],
      [ 7,  4,  7, 12,  7,  4,  0,  4],
      [ 5,  9, 12, 16, 12,  9,  5,  9],
      [12, 16, 12,  7, 12, 16, 12, 19],
    ],
    style: { bass: "root-fifth", sparkle: true, arp: true, lead: "square", bassOct: 2, leadGain: 0.13 },
  },

  // EOD summary/challenges/upgrades: reflective, mid-tempo A minor
  eod: {
    id: "eod", bpm: 96,
    progression: [
      [57, "min"], [65, "maj"], [60, "maj"], [67, "maj"],
      [57, "min"], [62, "min"], [58, "maj"], [64, "maj"],
    ],
    melody: [
      [ 0,  3,  7, 12,  7,  3,  0, -2],
      [ 0,  4,  7, 12,  9,  7,  4,  0],
      [ 0,  4,  7, 11,  7,  4,  0,  4],
      [ 0,  4,  7, 12,  7,  4,  0, -5],
      [ 3,  0,  7, 10, 12, 10,  7,  3],
      [ 0,  5,  7, 10,  7,  5,  0,  3],
      [ 0,  4,  7, 12, 10,  7,  4,  0],
      [12,  9,  7,  4,  7,  9, 12,  7],
    ],
    style: { pad: true, arpEighths: true, counter: true, bass: "root-fifth", lead: "triangle", bassOct: 2 },
  },

  // Store: warm jazzy shopping tune in Ab major
  // Ab=56, Db=61, Eb=63, Fm=65 (F=65 min), Bbm=58 min, C=60
  store: {
    id: "store", bpm: 100,
    progression: [
      [56, "maj"], [65, "min"], [61, "maj"], [63, "maj"],
      [56, "maj"], [58, "min"], [61, "maj"], [63, "maj"],
    ],
    melody: [
      [ 7,  4,  0,  4,  7, 12,  7,  4],
      [ 0,  3,  7, 12,  7,  3,  0,  3],
      [ 4,  7, 12,  9,  4,  7, 12,  9],
      [ 4,  7, 11, 14, 11,  7,  4,  0],
      [ 7,  4,  0,  4,  7, 11,  7,  4],
      [ 0,  3,  7, 10,  7,  3,  0,  3],
      [ 4,  9, 12,  7,  4,  9, 12,  7],
      [16, 12,  7,  4,  0,  4,  7, 11],
    ],
    style: { pad: true, arpEighths: true, bass: "walk", lead: "triangle", bassOct: 2, leadGain: 0.08 },
  },

  // Pause: slow, suspended-in-time drone in F major
  pause: {
    id: "pause", bpm: 72,
    progression: [
      [65, "maj"], [60, "maj"], [62, "min"], [58, "maj"],
      [65, "maj"], [57, "min"], [58, "maj"], [65, "maj"],
    ],
    melody: [
      [ 0, null, 7, null, 12, null,  7, null],
      [ 0, null, 4, null,  7, null, 12, null],
      [ 7, null, 3, null,  0, null,  3, null],
      [ 5, null, 7, null, 12, null, 14, null],
      [12, null, 7, null,  4, null,  0, null],
      [ 0, null, 3, null,  7, null, 12, null],
      [ 5, null, 9, null, 12, null,  9, null],
      [ 0, null, 4, null,  7, null, 12, null],
    ],
    style: { pad: true, bass: "root-only", lead: "sine", bassOct: 2, leadGain: 0.09 },
  },

  // Fishing: gentle G-major lakeside waltz feel (still in 4/4 but sparse)
  "leisure-fishing": {
    id: "leisure-fishing", bpm: 84,
    progression: [
      [55, "maj"], [59, "min"], [60, "maj"], [62, "maj"],
      [55, "maj"], [57, "min"], [60, "maj"], [62, "maj"],
    ],
    melody: [
      [ 7, null, 12, null,  7, null, 4, null],
      [ 0, null,  4, null,  7, null, 3, null],
      [ 4, null,  7, null, 12, null, 7, null],
      [ 0, null,  4, null,  7, null, 4, null],
      [ 7, null, 12, null, 16, null,12, null],
      [ 0, null,  3, null,  7, null,10, null],
      [ 4, null,  7, null, 12, null, 9, null],
      [ 0, null,  7, null, 12, null,19, null],
    ],
    style: { pad: true, arpEighths: true, bass: "root-only", lead: "triangle", bassOct: 2, leadGain: 0.08 },
  },

  // Casino: jazzy walking Bb, sparkle. Bb=58, Eb=63, F=65, Cm=60 min, Gm=55 min
  "leisure-casino": {
    id: "leisure-casino", bpm: 120,
    progression: [
      [58, "maj"], [55, "min"], [60, "min"], [65, "maj"],
      [58, "maj"], [63, "maj"], [55, "min"], [65, "maj"],
    ],
    melody: [
      [ 0,  3,  7, 10,  7,  3,  0,  3],
      [ 0,  4,  7, 10,  7,  4,  0, -3],
      [ 3,  7, 10, 14, 10,  7,  3,  0],
      [ 4,  7, 12,  7,  4,  0,  4,  7],
      [ 0,  3,  7, 10,  7,  3,  0, -2],
      [ 4,  7, 11, 14, 11,  7,  4,  0],
      [ 3,  7, 10,  7,  3,  0,  3,  7],
      [ 4,  9, 12, 16, 12,  9,  7,  4],
    ],
    style: { bass: "walk", sparkle: true, arpEighths: true, lead: "square", bassOct: 2, leadGain: 0.09 },
  },

  // Tennis: sporty A-major march, staccato, driving
  // A=57, D=62, E=64, F#m=54, Bm=59
  "leisure-tennis": {
    id: "leisure-tennis", bpm: 140,
    progression: [
      [57, "maj"], [62, "maj"], [64, "maj"], [57, "maj"],
      [54, "min"], [62, "maj"], [64, "maj"], [57, "maj"],
    ],
    melody: [
      [ 0,  7, 12,  7,  0,  7, 12, 16],
      [ 4,  7, 11,  7,  4,  7, 11, 14],
      [ 4,  7, 11,  7,  4,  7, 11, 14],
      [ 0,  4,  7, 12,  7,  4,  0,  4],
      [ 0,  3,  7, 12,  7,  3,  0,  3],
      [ 7,  4,  9, 12,  9,  4,  7, 11],
      [12, 11,  7,  4,  7, 11, 12, 16],
      [ 0,  7, 12,  4,  7, 12,  7, 19],
    ],
    style: { bass: "eighths", pad: true, sparkle: true, lead: "square", bassOct: 2 },
  },

  // Quick Tac Toe: frantic chiptune, high tempo E minor
  "leisure-quicktactoe": {
    id: "leisure-quicktactoe", bpm: 168,
    progression: [
      [64, "min"], [64, "min"], [62, "maj"], [59, "maj"],
      [64, "min"], [57, "min"], [62, "maj"], [59, "maj"],
    ],
    melody: [
      [ 0,  3,  7, 10,  0,  3,  7, 10],
      [ 3,  7, 10,  7,  3,  7, 10,  7],
      [ 0,  4,  7, 12,  7,  4,  0,  4],
      [ 0,  3,  7, 10,  7,  3,  0,  3],
      [ 0,  3,  7, 10, 12,  7,  3,  0],
      [ 0,  3,  7, 12,  7,  3,  0,  3],
      [ 7, 11,  7,  4,  0,  4,  7, 11],
      [12,  7,  4,  0,  3,  7, 10,  7],
    ],
    style: { bass: "eighths", lead: "square", arp: true, bassOct: 2, leadGain: 0.12 },
  },

  // Bowling: retro lounge / surf in F, walking bass, laid back
  "leisure-bowling": {
    id: "leisure-bowling", bpm: 104,
    progression: [
      [65, "maj"], [58, "maj"], [65, "maj"], [58, "maj"],
      [60, "maj"], [58, "maj"], [65, "maj"], [65, "maj"],
    ],
    melody: [
      [ 0,  4,  7, 12,  7,  4,  0,  4],
      [ 3,  7, 10,  7,  3,  0,  3,  7],
      [ 4,  7, 12,  9,  4,  7, 12,  9],
      [ 3,  7, 10,  7,  3,  0,  3,  7],
      [ 4,  7, 11, 14, 11,  7,  4,  0],
      [ 3,  7, 10,  7,  3,  0,  3,  7],
      [ 0,  4,  7, 12,  7,  4,  0,  4],
      [ 7,  4,  0,  4,  7, 12,  7,  4],
    ],
    style: { bass: "walk", pad: true, arpEighths: true, lead: "triangle", bassOct: 2, leadGain: 0.08 },
  },
};

export type TrackId = keyof typeof TRACKS;

let currentTrackId: TrackId = "title";
let currentTrack: TrackDef = TRACKS.title;

// ---------- Audio graph -----------------------------------------------------

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

// ---------- Scheduler -------------------------------------------------------

function scheduleNoteBeat(beat: number, time: number) {
  const track = currentTrack;
  const style = track.style;
  const beatSec = 60 / track.bpm;
  const prog = track.progression;
  const chordIdx = Math.floor(beat / 2) % prog.length;
  const [root, kind] = prog[chordIdx];
  const stepIdx = Math.floor((beat * 4) % 8);
  const isChordChange = (beat * 4) % 8 === 0;
  const isBeat = beat % 1 === 0;
  const isEighth = (beat * 2) % 1 === 0;
  const bassOct = style.bassOct ?? 2;
  const bassRootMidi = root - 12 * bassOct;
  const leadType: OscillatorType = style.lead ?? "square";
  const leadGain = style.leadGain ?? 0.11;

  // Bass
  if (style.bass === "eighths") {
    if (isEighth) {
      const alt = (beat * 2) % 2 === 0 ? 0 : 7;
      playTone(midiToHz(bassRootMidi + alt), time, beatSec * 0.5, "triangle", 0.12, 0.02);
    }
  } else if (style.bass === "walk") {
    // walking quarter notes: root, third, fifth, sixth
    if (isBeat) {
      const walkNotes = [0, kind === "maj" ? 4 : 3, 7, kind === "maj" ? 9 : 10];
      const offset = walkNotes[Math.floor(beat) % walkNotes.length];
      playTone(midiToHz(bassRootMidi + offset), time, beatSec * 0.9, "triangle", 0.12, 0.02);
    }
  } else if (style.bass === "shuffle") {
    // dotted swing feel: beat + and-of-2
    if (isChordChange) {
      playTone(midiToHz(bassRootMidi), time, beatSec * 0.6, "triangle", 0.13, 0.02);
    } else if ((beat * 4) % 8 === 3) {
      playTone(midiToHz(bassRootMidi + 7), time, beatSec * 0.5, "triangle", 0.11, 0.02);
    } else if ((beat * 4) % 8 === 4) {
      playTone(midiToHz(bassRootMidi), time, beatSec * 0.6, "triangle", 0.11, 0.02);
    }
  } else if (style.bass === "root-only") {
    if (isChordChange) {
      playTone(midiToHz(bassRootMidi), time, beatSec * 2, "triangle", 0.13, 0.04);
    }
  } else {
    // root-fifth (default)
    if (isChordChange) {
      playTone(midiToHz(bassRootMidi), time, beatSec * 1.6, "triangle", 0.14, 0.02);
    } else if ((beat * 4) % 8 === 4) {
      playTone(midiToHz(bassRootMidi + 7), time, beatSec, "triangle", 0.11, 0.02);
    }
  }

  // Thump
  if (style.thump && isChordChange) {
    playThump(midiToHz(bassRootMidi - 12), time, 0.22);
  }

  // Pad
  if (style.pad && isChordChange) {
    const [r, t3, fifth] = chordNotes(root - 12, kind);
    const padDur = 2 * beatSec - 0.05;
    for (const n of [r, t3, fifth]) {
      playTone(midiToHz(n), time, padDur, "square", 0.04, 0.06, -6);
      playTone(midiToHz(n), time, padDur, "square", 0.04, 0.06, +6);
    }
  }

  // Arpeggio
  const arpActive = style.arp || (style.arpEighths && isEighth);
  if (arpActive) {
    const arp = chordNotes(root + 12, kind);
    const noteIdx = style.arpEighths ? Math.floor(beat * 2) % arp.length : stepIdx % arp.length;
    playTone(midiToHz(arp[noteIdx]), time + 0.003, 0.18, "sine", 0.05, 0.005);
  }

  // Lead
  const phrase = track.melody[chordIdx];
  const step = phrase[stepIdx];
  if (step !== null) {
    playTone(midiToHz(root + step), time, 0.28, leadType, leadGain, 0.008);
  }

  // Counter-melody
  if (style.counter && isEighth) {
    const prev = phrase[(stepIdx - 2 + 8) % 8];
    if (prev !== null) {
      playTone(midiToHz(root + prev - 12), time, 0.32, "triangle", 0.06, 0.02);
    }
  }

  // Sparkle
  if (style.sparkle && isBeat) {
    playTone(midiToHz(root + 24), time + 0.01, 0.14, "sine", 0.045, 0.005);
  }
}

function scheduler() {
  if (!ctx) return;
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleNoteBeat(nextNoteBeat, nextNoteTime);
    const beatSec = 60 / currentTrack.bpm;
    nextNoteTime += beatSec / 4;
    nextNoteBeat += 0.25;
  }
}

// ---------- Track selection -------------------------------------------------

/** Switch to a different track; restarts the phrase for a clean intro. */
export function setTrack(id: TrackId): void {
  if (!TRACKS[id]) return;
  if (currentTrackId === id) return;
  currentTrackId = id;
  currentTrack = TRACKS[id];
  // Reset phrase position so the new track starts on chord 1
  if (ctx) {
    nextNoteTime = ctx.currentTime + 0.05;
    nextNoteBeat = 0;
  }
}

export function getCurrentTrack(): TrackId {
  return currentTrackId;
}

// ---------- Volume API ------------------------------------------------------

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

export function getMusicVolume(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(VOL_KEY);
  if (v === null) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? clamp(n, 0, 100) : 0;
}

export function setMusicVolume(vol: number): number {
  const v = Math.round(clamp(vol, 0, 100));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VOL_KEY, String(v));
    if (v > 0) window.localStorage.setItem(LAST_VOL_KEY, String(v));
  }
  applyGain(v);
  return v;
}

export function isMusicMuted(): boolean {
  return getMusicVolume() === 0;
}

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

// ---------- Lifecycle -------------------------------------------------------

/** Start the scheduler. Idempotent — safe to call multiple times. */
export function startMusic(): void {
  const c = ensureCtx();
  if (!c) return;
  if (!started) {
    started = true;
    nextNoteTime = c.currentTime + 0.1;
    nextNoteBeat = 0;
    noteTimer = window.setInterval(scheduler, LOOK_AHEAD_MS);
  }
  applyGain(getMusicVolume());
  if (c.state === "suspended") c.resume().catch(() => {});
}

/** Stop the scheduler and fade out the master gain. */
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
