// Plays the chants of an hour on the organ, one after another, highlighting the
// sounding note and its syllable and keeping them in view.

import { ensureRendered } from '../chant/render';
import { Organ, type PhraseNote } from './organ';
import { onSettingsChange, playbackSettings } from './settings';
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
/** The chants of the run being played. */
let queue: HTMLElement[] = [];
/** The score on the audio clock: its notes (at the current tempo) and when note time 0 falls. */
let position: { el: HTMLElement; notes: TimedNote[]; origin: number } | null = null;
/** Tempo or pitch changed while paused: reschedule on resume. */
let changedWhilePaused = false;

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

/**
 * Plays one rendered score, from note `from` on; resolves when it has finished or
 * playback was cancelled.
 */
async function playScore(el: HTMLElement, token: number, runBus: GainNode, from = 0): Promise<boolean> {
  const rendered = await ensureRendered(el);
  if (!rendered || token !== run) return token === run;
  // Tempo and pitch are read now, so a change takes effect from here.
  const { tempo, transpose } = playbackSettings();
  const notes = buildTimeline(rendered.ex, rendered.score).notes.map((n) => ({
    ...n,
    time: n.time / tempo,
    duration: n.duration / tempo,
    midi: n.midi + transpose,
  }));
  if (from >= notes.length) return true;

  const o = organ!;
  // Audio time of note time 0 (earlier than now when starting partway through).
  const start = o.ctx.currentTime + 0.15 - notes[from].time;
  position = { el, notes, origin: start };
  // The whole score goes to the audio clock at once, phrase by phrase, so it plays
  // to the end even in a background tab, where animation frames stop and timers
  // are throttled.
  let phrase: PhraseNote[] = [];
  for (const n of notes.slice(from)) {
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
  let shown = from - 1;
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
  // A cancelled run leaves the element alone: a restart may already be playing it.
  if (token !== run) return false;
  position = null;
  el.classList.remove('playing');
  for (const s of el.querySelectorAll('.sounding')) s.classList.remove('sounding');
  return true;
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
 * Plays the given chant (from note `from`) and every chant after it in the hour.
 * Whatever was playing is stopped first, so only one chant ever sounds.
 */
export async function playFrom(scores: HTMLElement[], index: number, from = 0): Promise<void> {
  stop();
  queue = scores;
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
    if (!(await playScore(scores[i], token, runBus, i === index ? from : 0))) return;
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
  if (changedWhilePaused) return restartHere();
  void organ.ctx.resume();
  state = 'playing';
  emit();
}

export function stop(): void {
  run++;
  if (bus) {
    const b = bus;
    bus = null;
    if (organ!.ctx.state === 'suspended') {
      // Paused: the frozen sound is cut silently and the reverb emptied, and the
      // context stays suspended until the next play, so nothing of it is heard.
      b.disconnect();
      organ!.flush();
    } else {
      // Fade rather than cut, to avoid a click.
      b.gain.setTargetAtTime(0, organ!.ctx.currentTime, 0.05);
      setTimeout(() => b.disconnect(), 400);
    }
  }
  continueAfterText?.(); // release a wait at a text section; its run is cancelled
  clearHighlight();
  current = null;
  position = null;
  changedWhilePaused = false;
  if (state !== 'stopped') {
    state = 'stopped';
    emit();
  }
}

/** Reschedules the sounding chant from its current note, with the new tempo and pitch. */
function restartHere(): void {
  if (!organ || !position) return;
  const { el, notes, origin } = position;
  const now = organ.ctx.currentTime - origin;
  let note = 0;
  while (note + 1 < notes.length && notes[note + 1].time <= now) note++;
  const index = queue.indexOf(el);
  if (index >= 0) void playFrom(queue, index, note);
}

// A chant already on the audio clock is rescheduled; between chants, or while
// waiting at text, the next chant simply picks up the new settings.
onSettingsChange(() => {
  if (state === 'playing') restartHere();
  else if (state === 'paused' && position) changedWhilePaused = true;
});
