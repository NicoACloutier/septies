// Renders one hour of the office from day JSON: rubrics in red, Latin text,
// and the celebration line with its liturgical color.

import type { Headline, Hour, Line, Run, Section } from '../types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderRun(run: Run): Node {
  if (!run.style) return document.createTextNode(run.text);
  return el('span', run.style, run.text);
}

/**
 * Splits runs at the mediant asterisk of a verse: everything up to and including
 * the "*" stays on the first line, the rest goes on an indented second line.
 * Returns null when the line has no asterisk.
 */
function splitAtMediant(runs: Run[]): [Run[], Run[]] | null {
  const i = runs.findIndex((r) => !r.style && r.text.includes('*'));
  if (i < 0) return null;
  const star = runs[i].text.indexOf('*');
  // Non-breaking space so the asterisk never wraps onto a line of its own.
  const before = runs[i].text.slice(0, star).trimEnd() + ' *';
  const after = runs[i].text.slice(star + 1).trimStart();
  return [
    [...runs.slice(0, i), { text: before }],
    [...(after ? [{ text: after }] : []), ...runs.slice(i + 1)],
  ];
}

function renderLine(line: Line): HTMLElement {
  if (line.kind === 'break') return el('div', 'break');
  const p = el('p', `line ${line.kind}`);
  if (line.label) p.append(el('span', line.kind === 'verse' ? 'verse-num' : 'label', line.label), ' ');
  // In antiphons the asterisk only marks the end of the intonation, so keep them on one line.
  const halves = line.kind === 'antiphon' ? null : splitAtMediant(line.runs);
  if (halves) {
    const second = el('span', 'second-half');
    second.append(...halves[1].map(renderRun));
    p.append(...halves[0].map(renderRun), second);
  } else {
    p.append(...line.runs.map(renderRun));
  }
  return p;
}

function renderSection(section: Section): HTMLElement {
  const s = el('section', section.omitted ? 'part omitted' : 'part');
  if (section.heading) {
    const h = el('h3', 'part-heading', section.heading);
    if (section.omitted) h.append(el('span', 'note', ' omittitur'));
    else if (section.note) h.append(el('span', 'note', ` ${section.note}`));
    s.append(h);
  }
  s.append(...section.lines.map(renderLine));
  return s;
}

export function renderHeadline(headline: Headline, className = 'celebration'): HTMLElement {
  const c = el('div', className);
  const title = el('p', 'celebration-title', headline.title);
  if (headline.rank) title.append(el('span', 'rank', ` · ${headline.rank}`));
  c.append(title);
  for (const n of headline.notes) c.append(el('p', 'celebration-note', n));
  return c;
}

export function renderHour(container: HTMLElement, hour: Hour, dayCelebration: Headline): void {
  const article = el('article', 'hour');
  // Show the hour's own celebration only when it differs (e.g. first Vespers of tomorrow).
  if (hour.headline.title !== dayCelebration.title) {
    article.append(renderHeadline(hour.headline, 'hour-celebration'));
  }
  article.append(el('h2', 'hour-title', hour.title), ...hour.sections.map(renderSection));
  container.replaceChildren(article);
}

export function renderMessage(container: HTMLElement, message: string): void {
  container.replaceChildren(el('p', 'message', message));
}
