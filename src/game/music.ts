/**
 * Procedural SNES-adventure-style title music using WebAudio oscillators.
 * Two-part loop: a plucky lead (square wave) over an arpeggiated bass (triangle),
 * with a light delay send for that reverb-y console feel.
 *
 * Muted by default. Persisted to localStorage under "musicMuted" (defaults to true).
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noteTimer: number | null = null;
let nextNoteBeat = 0;
let nextNoteTime = 0;
let started = false;

const BPM = 108;
const BEAT_SEC = 60 / BPM;
const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.15;

// A cheerful adventure-y progression in D major (I – V – vi – IV loop),
// then a lighter bridge. Each entry: [rootMidi, chordType].
// Chord types: "maj" or "min". D=62, A=57, Bm=59, G=55.
const PROGRESSION: [number, "maj" | "min"][] = [
  [62, "maj"], // D
  [57, "maj"], // A
  [59, "min"], // Bm
  [55, "maj"], // G
  [62, "maj"], // D
  [55, "maj"], // G
  [57, "maj"], // A
  [57, "maj"], // A
];

// One melody phrase per chord — 8 sixteenth-note steps (2 beats). Values are
// scale-degree offsets from the chord root; null means rest. Kept simple and
// singable so it reads as retro/adventure.
const MELODY_STEPS: (number | null)[][] = [
  [12,  7, 12, 11,  9,  7,  9, 11],
  [ 9,  7,  9, 12,  9,  7,  4,  7],
  [ 7, 10, 12, 10,  7,  5,  7, 10],
  [ 7, 11, 14, 11,  7,  4,  7, 11],
  [12, 14, 12, 11,  9,  7,  9,  7],
  [ 7,  9, 11, 14, 11,  9,  7,  9],
  [ 9, 12,  9,  7,  9, 12,  9,  7],
  [12, 11,  9,  7,  4,  7,  9, 11],
];

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function chordNotes(root: number, kind: "maj" | "min"): number[] {
  const third = kind === "maj" ? 4 : 3;
  return [root, root + third, root + 7]; // root, third, fifth
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

function schedulePluck(freq: number, when: number, dur: number, type: OscillatorType, gainVal: number) {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gainVal, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(masterGain);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

function scheduleNoteBeat(beat: number, time: number) {
  const chordIdx = Math.floor(beat / 2) % PROGRESSION.length;
  const [root, kind] = PROGRESSION[chordIdx];
  const stepIdx = Math.floor((beat * 4) % 8); // sixteenth steps within the 2-beat chord
  const isDownbeat = beat % 1 === 0;
  const isChordChange = (beat * 4) % 8 === 0;

  // Bass: root on chord change, then fifth on beat 1 of chord (i.e. beat offset 1)
  if (isChordChange) {
    schedulePluck(midiToHz(root - 12), time, 0.9, "triangle", 0.14);
  } else if ((beat * 4) % 8 === 4) {
    schedulePluck(midiToHz(root - 12 + 7), time, 0.9, "triangle", 0.11);
  }

  // Arpeggio (soft) on every eighth
  if (isDownbeat || (beat * 2) % 1 === 0) {
    const arp = chordNotes(root, kind);
    const eighthWithinChord = Math.floor((beat * 2) % 4);
    const note = arp[eighthWithinChord % arp.length];
    schedulePluck(midiToHz(note), time + 0.005, 0.35, "square", 0.05);
  }

  // Lead melody: every sixteenth pulls from the current phrase
  const phrase = MELODY_STEPS[chordIdx];
  const step = phrase[stepIdx];
  if (step !== null) {
    schedulePluck(midiToHz(root + step), time, 0.28, "square", 0.09);
  }

  // Sparkle on strong beats (adds SNES sheen)
  if (isChordChange) {
    schedulePluck(midiToHz(root + 12 + 7), time + 0.02, 0.2, "sine", 0.045);
  }
}

function scheduler() {
  if (!ctx) return;
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleNoteBeat(nextNoteBeat, nextNoteTime);
    nextNoteTime += BEAT_SEC / 4; // 16th-note grid
    nextNoteBeat += 0.25;
  }
}

/** Called once (per app boot) to spin up the audio context and scheduler. */
export function startMusic(): void {
  const c = ensureCtx();
  if (!c || started) return;
  started = true;
  nextNoteTime = c.currentTime + 0.1;
  nextNoteBeat = 0;
  noteTimer = window.setInterval(scheduler, LOOK_AHEAD_MS);
  // Resume the context on first user gesture (browsers require it)
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

/** Read persisted mute state; defaults to muted. */
export function isMusicMuted(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem("musicMuted");
  if (v === null) return true;
  return v === "1";
}

/** Toggle or set mute state; persists to localStorage. Returns new muted state. */
export function setMusicMuted(muted: boolean): boolean {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("musicMuted", muted ? "1" : "0");
  }
  if (masterGain && ctx) {
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(muted ? 0 : 0.35, t + 0.25);
    if (!muted && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }
  return muted;
}

/** Fade out and stop the scheduler (used when leaving the title screen). */
export function stopMusic(): void {
  if (masterGain && ctx) {
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0, t + 0.5);
  }
  if (noteTimer !== null) {
    window.clearInterval(noteTimer);
    noteTimer = null;
  }
  started = false;
}
