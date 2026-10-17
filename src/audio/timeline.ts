// Turns an Exsurge score into timed notes for playback, and tags the score's
// SVG so the sounding note and syllable can be highlighted.

/* eslint-disable @typescript-eslint/no-explicit-any -- Exsurge ships no types. */
type Exsurge = any;
type Score = any;

export interface TimedNote {
  /** Seconds from the start of the score. */
  time: number;
  duration: number;
  midi: number;
  /** Loudness, 0–1: stressed syllables a little louder, phrase ends softer. */
  level: number;
  /** Last note before a bar or the end: the organ voice breathes after it. */
  phraseEnd: boolean;
  /** data-k of the note's SVG group. */
  note: number;
  /** data-n of the notation (neume + its syllable). */
  notation: number;
}

export interface Timeline {
  notes: TimedNote[];
  duration: number;
}

/** Seconds per plain note (punctum); the basic pulse of the chant. */
export const PULSE = 0.42;

// Breaths at the divisions, in seconds.
const BREATH = { quarter: 0.25, half: 0.5, full: 0.9, double: 1.3 };

// Stops after punctuation in the text, in seconds. Where a bar falls at the same
// place (the usual case), the longer of the two is taken, not their sum.
const PUNCTUATION: [RegExp, number][] = [
  [/[.?!]$/, 0.7],
  [/[:;]$/, 0.4],
  [/,$/, 0.2],
];

/** Stressed syllables are held this much longer than the pulse. */
const STRESS = 1.1;

/** Runs of more than this many notes on one pitch (recitation) are taken faster… */
const RECITATION_RUN = 4;
/** …at this fraction of their normal duration. */
const RECITATION = 0.9;

/** The stop after a syllable ending in punctuation, or 0. */
function punctuationStop(notation: any): number {
  const text = (notation.lyrics?.[0]?.text ?? '').trim();
  for (const [mark, seconds] of PUNCTUATION) if (mark.test(text)) return seconds;
  return 0;
}

// Exsurge pitches are solfège-based and every clef has octave 2, so the clef's Do
// is toInt() 24 in every score, and an antiphon and its psalm agree whatever their
// clefs. Chant has no absolute pitch; Do at A3 puts it around a men's schola.
const DO_MIDI = 57;
const DO_INT = 24;

/**
 * Tags notations with data-n and notes with data-k in the SVG Exsurge generates.
 * Must run before the first createSvg; tags survive re-layout.
 */
export function tagScore(score: Score): void {
  if (score.__tagged) return;
  score.__tagged = true;
  let k = 0;
  score.notations.forEach((notation: any, n: number) => {
    const drawNotation = notation.createSvgFragment;
    notation.createSvgFragment = function (ctxt: unknown) {
      return drawNotation.call(this, ctxt).replace(/^<g /, `<g data-n="${n}" `);
    };
    for (const note of notation.notes ?? []) {
      const index = k++;
      note.__k = index;
      const drawNote = note.createSvgFragment;
      note.createSvgFragment = function (ctxt: unknown) {
        return `<g data-k="${index}">${drawNote.call(this, ctxt)}</g>`;
      };
    }
  });
}

/**
 * Whether a notation's syllable carries the word stress: the texts mark it with an
 * acute accent (Dómine), and DO's pointed psalms also set the tone's accents in bold.
 */
function isStressed(notation: any): boolean {
  const lyric = notation.lyrics?.[0];
  if (!lyric) return false;
  if (/[áéíóúýǽ]/i.test(lyric.text ?? '')) return true;
  return (lyric.spans ?? []).some((s: any) => /bold/.test(s.properties ?? ''));
}

interface RawNote {
  midi: number;
  note: number;
  notation: number;
  stressed: boolean;
  mora: boolean;
  episema: boolean;
  beforeQuilisma: boolean;
  /** Breath after this note, if it ends a phrase. */
  breath: number;
}

/**
 * A gentle, speech-like reading of the square notation. Notes share an equal
 * pulse, shaped by the text and the signs:
 * - a stressed syllable is held a little longer and sung a little louder;
 * - recitation (a run of more than four notes on one pitch) moves a little faster;
 * - a dot (mora) doubles a note, an episema lengthens it, the note before a
 *   quilisma is held;
 * - each phrase slows and softens into its bar or punctuation, followed by a
 *   breath whose length depends on the bar or punctuation mark.
 */
export function buildTimeline(ex: Exsurge, score: Score, pulse = PULSE): Timeline {
  const raw: RawNote[] = [];
  const pauseAfterLast = (seconds: number) => {
    const last = raw[raw.length - 1];
    if (last && seconds > last.breath) last.breath = seconds;
  };
  // The punctuation stop of the syllable being read; applied to its last note,
  // which is only known once the next syllable (or a bar, or the end) arrives.
  let syllableStop = 0;
  score.notations.forEach((notation: any, n: number) => {
    if (notation instanceof ex.Neume) {
      const list = (notation.notes as any[]).filter((note) => note.pitch);
      const hasLyric = !!notation.lyrics?.length;
      if (hasLyric) {
        pauseAfterLast(syllableStop);
        syllableStop = punctuationStop(notation);
      }
      const stressed = isStressed(notation);
      list.forEach((note, j) => {
        raw.push({
          midi: DO_MIDI + note.pitch.toInt() - DO_INT,
          note: note.__k,
          notation: n,
          stressed: stressed && j === 0,
          mora: !!note.morae?.length,
          episema: !!note.epismata?.length,
          beforeQuilisma: list[j + 1]?.shape === ex.NoteShape.Quilisma,
          breath: 0,
        });
      });
    } else if (raw.length) {
      // A bar closes the syllable before it.
      let bar = 0;
      if (notation instanceof ex.DoubleBar) bar = BREATH.double;
      else if (notation instanceof ex.FullBar) bar = BREATH.full;
      else if (notation instanceof ex.HalfBar) bar = BREATH.half;
      else if (notation instanceof ex.QuarterBar) bar = BREATH.quarter;
      if (bar) {
        pauseAfterLast(Math.max(bar, syllableStop));
        syllableStop = 0;
      }
    }
  });
  pauseAfterLast(Math.max(syllableStop, BREATH.full));

  const notes: TimedNote[] = [];
  let t = 0;
  // Distance (in notes) to the end of the current phrase, for the ritardando.
  const toPhraseEnd = new Array<number>(raw.length);
  for (let i = raw.length - 1, d = 0; i >= 0; i--) {
    d = raw[i].breath ? 0 : d + 1;
    toPhraseEnd[i] = d;
  }

  // Runs of repeated pitches (recitation); a breath ends a run.
  const inLongRun = new Array<boolean>(raw.length).fill(false);
  for (let i = 0; i < raw.length; ) {
    let j = i;
    while (j + 1 < raw.length && raw[j + 1].midi === raw[i].midi && !raw[j].breath) j++;
    if (j - i + 1 > RECITATION_RUN) inLongRun.fill(true, i, j + 1);
    i = j + 1;
  }

  raw.forEach((r, i) => {
    let duration = pulse;
    let level = 0.8;
    if (r.stressed) {
      duration *= STRESS;
      level = 1;
    }
    if (inLongRun[i]) duration *= RECITATION;
    if (r.mora) duration *= 2;
    if (r.episema) duration *= 1.5;
    if (r.beforeQuilisma) duration *= 1.6;
    // Ritardando and decrescendo over the last notes of the phrase.
    const fromEnd = toPhraseEnd[i];
    if (fromEnd === 0) {
      duration *= r.mora ? 1.15 : 1.4;
      level *= 0.75;
    } else if (fromEnd === 1) {
      duration *= 1.15;
      level *= 0.88;
    } else if (fromEnd === 2) {
      duration *= 1.05;
    }
    notes.push({ time: t, duration, midi: r.midi, level, phraseEnd: r.breath > 0, note: r.note, notation: r.notation });
    t += duration + r.breath;
  });
  return { notes, duration: t };
}
