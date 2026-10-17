// Plays the chants of an hour on the organ, one after another, highlighting the
// sounding note and its syllable and keeping them in view.

import { ensureRendered } from '../chant/render';
import { Organ, type PhraseNote } from './organ';
import { buildTimeline, type TimedNote } from './timeline';

/**
 * waiting = stopped at a stretch of text that has no chant, so the user can read
 * it aloud; `current` is then the chant that comes next, and resume() goes on there.
 */
export type PlayerState = 'stopped' | 'playing' | 'paused' | 'waiting';

/** Seconds of silence between consecutive chants. */
const GAP = 1.2;

let organ: Organ | null = null;
let run = 0; // incremented to cancel the current playback
let bus: GainNode | null = null;
let state: PlayerState = 'stopped';
const listeners = new Set<(state: PlayerState, current: HTMLElement | null) => void>();
let current: HTMLElement | null = null;
/** Set while waiting at a text section; calling it continues playback. */
let continueAfterText: (() => void) | null = null;

function emit(): void {
  for (const l of listeners) l(state, current);
}

export function onPlayerChange(listener: (state: PlayerState, current: HTMLElement | null) => void): void {
  listeners.add(listener);
}

export function playerState(): PlayerState {
  return state;
}

/** The chant element being played (or paused), if any. */
export function currentScore(): HTMLElement | null {
  return current;
}

function clearHighlight(): void {
  for (const el of document.querySelectorAll('.chant-score .sounding')) el.classList.remove('sounding');
  for (const el of document.querySelectorAll('.chant-score.playing')) el.classList.remove('playing');
}

/** Keeps the sounding note comfortably on screen. */
function follow(el: Element): void {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight;
  if (r.top < h * 0.15 || r.bottom > h * 0.8) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Plays one rendered score; resolves when it has finished or playback was cancelled. */
async function playScore(el: HTMLElement, token: number, runBus: GainNode): Promise<boolean> {
  const rendered = await ensureRendered(el);
  if (!rendered || token !== run) return token === run;
  const { notes } = buildTimeline(rendered.ex, rendered.score);
  if (!notes.length) return true;

  const o = organ!;
  const start = o.ctx.currentTime + 0.15;
  // The whole score goes to the audio clock at once, phrase by phrase, so it plays
  // to the end even in a background tab, where animation frames stop and timers
  // are throttled.
  let phrase: PhraseNote[] = [];
  for (const n of notes) {
    phrase.push({ midi: n.midi, start: start + n.time, duration: n.duration, level: n.level });
    if (n.phraseEnd) {
      o.phrase(runBus, phrase);
      phrase = [];
    }
  }
  o.phrase(runBus, phrase);
  current = el;
  el.classList.add('playing');
  emit();

  // Highlight the sounding note on animation frames (only needed while visible).
  // Elements are looked up each time, since a re-layout (resize) replaces the SVG.
  let shown = -1;
  let shownNotation = -1;
  const frame = () => {
    if (token !== run || current !== el) return;
    const now = o.ctx.currentTime - start;
    let i = shown;
    while (i + 1 < notes.length && notes[i + 1].time <= now) i++;
    if (i !== shown && i >= 0) {
      highlight(el, notes[i], shownNotation);
      shownNotation = notes[i].notation;
      shown = i;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const last = notes[notes.length - 1];
  await waitUntil(start + last.time + last.duration, token);
  el.classList.remove('playing');
  for (const s of el.querySelectorAll('.sounding')) s.classList.remove('sounding');
  return token === run;
}

function highlight(el: HTMLElement, note: TimedNote, previousNotation: number): void {
  for (const s of el.querySelectorAll('[data-k].sounding')) s.classList.remove('sounding');
  el.querySelector(`[data-k="${note.note}"]`)?.classList.add('sounding');
  if (note.notation !== previousNotation) {
    el.querySelector(`[data-n="${previousNotation}"]`)?.classList.remove('sounding');
    const notation = el.querySelector(`[data-n="${note.notation}"]`);
    if (notation) {
      notation.classList.add('sounding');
      follow(notation);
    }
  }
}

/**
 * Resolves when the audio clock reaches `time` or playback is cancelled. Polls with a
 * timer rather than animation frames so it keeps going in a background tab; the
 * audio clock stops while paused, so a pause also pauses this.
 */
function waitUntil(time: number, token: number): Promise<void> {
  const o = organ!;
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (token !== run || o.ctx.currentTime >= time) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

/**
 * Plays the given chant and every chant after it in the hour. Whatever was playing
 * is stopped first, so only one chant ever sounds.
 */
export async function playFrom(scores: HTMLElement[], index: number): Promise<void> {
  stop();
  // Claim this run and its bus before any await, so a second click that arrives
  // meanwhile cancels this one (and fades its bus) instead of overlapping it.
  const token = ++run;
  organ ??= new Organ();
  const runBus = organ.createBus();
  bus = runBus;
  state = 'playing';
  current = scores[index] ?? null;
  emit();
  await organ.ctx.resume();
  if (token !== run) return;
  for (let i = index; i < scores.length; i++) {
    if (!(await playScore(scores[i], token, runBus))) return;
    const next = scores[i + 1];
    if (!next) break;
    if (next.dataset.afterText) await waitForReader(next);
    else await waitUntil(organ.ctx.currentTime + GAP, token);
    if (token !== run) return;
  }
  if (token === run) stop();
}

/**
 * Stops at a stretch of text without chant so it can be read aloud, until the user
 * continues (resume(), from the bottom bar or the next chant's button).
 */
function waitForReader(next: HTMLElement): Promise<void> {
  state = 'waiting';
  current = next;
  emit();
  // Bring the text to read into view: the first readable line before the next chant.
  const lines = [...(next.closest('article')?.querySelectorAll<HTMLElement>('.read-start, .chant-score') ?? [])];
  const start = lines[lines.indexOf(next) - 1];
  if (start?.classList.contains('read-start')) start.scrollIntoView({ block: 'start', behavior: 'smooth' });
  return new Promise((resolve) => {
    continueAfterText = () => {
      continueAfterText = null;
      resolve();
    };
  });
}

export function pause(): void {
  if (state !== 'playing' || !organ) return;
  void organ.ctx.suspend();
  state = 'paused';
  emit();
}

/** Continues after a pause, or after a text section (with the chant that follows it). */
export function resume(): void {
  if (!organ) return;
  if (state === 'waiting') {
    state = 'playing';
    emit();
    continueAfterText?.();
    return;
  }
  if (state !== 'paused') return;
  void organ.ctx.resume();
  state = 'playing';
  emit();
}

export function stop(): void {
  run++;
  if (bus) {
    // Fade rather than cut, to avoid a click.
    const b = bus;
    const now = organ!.ctx.currentTime;
    b.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(() => b.disconnect(), 400);
    bus = null;
  }
  if (organ?.ctx.state === 'suspended') void organ.ctx.resume();
  continueAfterText?.(); // release a wait at a text section; its run is cancelled
  clearHighlight();
  current = null;
  if (state !== 'stopped') {
    state = 'stopped';
    emit();
  }
}
