// Renders GABC chant scores to SVG with Exsurge. Uses the Exsurge build that
// ships with Divinum Officium, which understands DO's GABC dialect. It is
// loaded on first use, and each score is laid out only when it nears the screen.

import exsurgeUrl from '../../pipeline/vendor/divinum-officium/web/www/js/exsurge.js?url';
import type { Chant } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any -- Exsurge ships no types. */
type Exsurge = any;
type Score = any;
type Context = any;

declare global {
  interface Window {
    exsurge?: Exsurge;
  }
}

let exsurgeLoading: Promise<Exsurge> | null = null;

function loadExsurge(): Promise<Exsurge> {
  exsurgeLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = exsurgeUrl;
    script.onload = () => (window.exsurge ? resolve(window.exsurge) : reject(new Error('Exsurge did not load')));
    script.onerror = () => reject(new Error('Could not load Exsurge'));
    document.head.append(script);
  });
  return exsurgeLoading;
}

/**
 * Exsurge measures text on a canvas, so the fonts should be ready first. The wait
 * is capped so a stalled font load can never block the chant; scores then measure
 * with the fallback font.
 */
let fontsLoading: Promise<unknown> | null = null;
function loadFonts(): Promise<unknown> {
  fontsLoading ??= Promise.race([
    Promise.all([
      document.fonts.load('18px Fondamento'),
      document.fonts.load('italic 18px Fondamento'),
      document.fonts.load('48px UnifrakturMaguntia'),
    ]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  return fontsLoading;
}

interface Rendered {
  score: Score;
  ctxt: Context;
  width: number;
}
const rendered = new Map<HTMLElement, Rendered>();
const sources = new WeakMap<HTMLElement, Chant>();

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function createContext(ex: Exsurge): Context {
  const ctxt = new ex.ChantContext();
  const ink = cssVar('--fg');
  const rubric = cssVar('--rubric');
  ctxt.lyricTextFont = "'Fondamento', Georgia, serif";
  ctxt.lyricTextSize = 17;
  ctxt.lyricTextColor = ink;
  ctxt.neumeLineColor = ink;
  ctxt.dividerLineColor = ink;
  // Red staff lines, as in printed antiphonaries.
  ctxt.staffLineColor = rubric;
  ctxt.dropCapTextFont = "'UnifrakturMaguntia', serif";
  ctxt.dropCapTextColor = rubric;
  ctxt.annotationTextFont = ctxt.lyricTextFont;
  ctxt.annotationTextColor = rubric;
  ctxt.spaceBetweenSystems = 0;
  setGlyphScaling(ctxt, 1 / 13);
  return ctxt;
}

/**
 * Enlarges the neumes relative to the lyrics (Exsurge's default is 1/16).
 * Exsurge derives these values from glyphScaling in its constructor, so they are recomputed here.
 */
function setGlyphScaling(ctxt: Context, scaling: number): void {
  ctxt.glyphScaling = scaling;
  ctxt.staffInterval = ctxt.glyphPunctumWidth * scaling;
  ctxt.staffLineWeight = Math.round((ctxt.glyphPunctumWidth * scaling) / 8);
  ctxt.neumeLineWeight = ctxt.staffLineWeight;
  ctxt.dividerLineWeight = ctxt.staffLineWeight;
  ctxt.episemaLineWeight = ctxt.staffLineWeight;
  ctxt.intraNeumeSpacing = ctxt.staffInterval / 2;
}

function layout({ score, ctxt }: Rendered, el: HTMLElement, width: number): Promise<void> {
  return new Promise((resolve) => {
    score.layoutChantLines(ctxt, width, () => {
      el.innerHTML = score.createSvg(ctxt);
      resolve();
    });
  });
}

async function renderScore(el: HTMLElement, chant: Chant): Promise<void> {
  const [ex] = await Promise.all([loadExsurge(), loadFonts()]);
  const ctxt = createContext(ex);
  const useDropCap = chant.header['initial-style'] !== '0';
  const mappings = ex.Gabc.createMappingsFromSource(ctxt, chant.gabc);
  const score = new ex.ChantScore(ctxt, mappings, useDropCap);
  if (useDropCap && chant.header.annotation) score.annotation = new ex.Annotation(ctxt, chant.header.annotation);
  await new Promise<void>((resolve) => score.performLayoutAsync(ctxt, () => resolve()));
  const entry: Rendered = { score, ctxt, width: el.clientWidth };
  rendered.set(el, entry);
  await layout(entry, el, entry.width);
  el.classList.add('ready');
}

// Scores are rendered one at a time: many concurrent Exsurge layouts stall each
// other (seen with ~25 scores in view at once), and serial work keeps scrolling smooth.
let queue: Promise<void> = Promise.resolve();

function enqueue(el: HTMLElement, chant: Chant): void {
  queue = queue.then(async () => {
    if (!el.isConnected) return; // navigated away before its turn
    try {
      await renderScore(el, chant);
    } catch (err) {
      el.classList.add('failed');
      el.textContent = 'Cantus reddi non potuit.';
      console.error(err);
    }
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      observer.unobserve(el);
      const chant = sources.get(el);
      if (chant) enqueue(el, chant);
    }
  },
  { rootMargin: '800px 0px' },
);

/** Re-flows rendered scores when their width changes (window resize, rotation). */
let resizeTimer: number | undefined;
const resizer = new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    for (const [el, entry] of rendered) {
      if (!el.isConnected) {
        rendered.delete(el);
        continue;
      }
      const width = el.clientWidth;
      if (width && width !== entry.width) {
        entry.width = width;
        void layout(entry, el, width);
      }
    }
  }, 150);
});
resizer.observe(document.body);

/** Plain lyrics of a GABC score, for screen readers and as a fallback. */
export function chantLyrics(gabc: string): string {
  return gabc
    .replace(/\([^)]*\)/g, '')
    .replace(/<[^>]+>|[*_^]|\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** An element that turns into a rendered score when scrolled near. */
export function chantElement(chant: Chant): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chant-score';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', chantLyrics(chant.gabc));
  const source = [chant.header.book, chant.header.transcriber && `transcr. ${chant.header.transcriber}`]
    .filter(Boolean)
    .join(' · ');
  if (source) el.title = source;
  sources.set(el, chant);
  observer.observe(el);
  return el;
}
