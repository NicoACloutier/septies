// Parses the HTML that Divinum Officium's officium.pl prints in content-only,
// Latin-only mode (content=1, lang2=Latin) into the structured Hour model.
//
// The markup is a small, stable set: one <TD> per section, <br/> between lines,
// and <FONT>/<I>/<B>/<SPAN> for red rubrics, drop-capitals and small notes.

import type { Headline, Hour, Line, LiturgicalColor, Run, RunStyle, Section } from '../src/types';

/** Run style before the heading/initial ambiguity is resolved. */
type RawStyle = RunStyle | 'big';
interface RawRun {
  text: string;
  style?: RawStyle;
}

interface Frame {
  tag: string;
  size?: string;
  color?: string;
  italic?: boolean;
  cross?: boolean;
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

function openFrame(tag: string, attrs: string): Frame {
  const frame: Frame = { tag };
  if (tag === 'font') {
    frame.size = attr(attrs, 'size');
    frame.color = attr(attrs, 'color')?.toLowerCase();
  } else if (tag === 'i') {
    frame.italic = true;
  } else if (tag === 'span') {
    const style = (attr(attrs, 'style') ?? '').toLowerCase();
    const color = /color:\s*([a-z#0-9]+)/.exec(style)?.[1];
    if (color) frame.color = color;
    if (color === 'red' && /font-size/.test(style)) frame.cross = true;
    if (attr(attrs, 'class') === 'nigra') frame.color = 'black';
  }
  return frame;
}

function styleOf(stack: Frame[]): RawStyle | undefined {
  const find = <K extends keyof Frame>(k: K) => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i][k] !== undefined) return stack[i][k];
    return undefined;
  };
  if (find('cross')) return 'cross';
  const color = find('color');
  const size = find('size');
  if (color === 'red') {
    if (size === '+1' || size === '+2') return 'big';
    if (size === '1') return 'mark';
    return 'rubric';
  }
  if (size === '-1') return 'small';
  if (find('italic')) return 'italic';
  return undefined;
}

/** Splits an HTML fragment into lines (at <br/>) of styled runs. */
function toRawLines(html: string): RawRun[][] {
  const lines: RawRun[][] = [];
  let line: RawRun[] = [];
  const stack: Frame[] = [];
  const token = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html))) {
    const [, closing, rawTag, attrs, text] = m;
    if (text !== undefined) {
      const t = decodeEntities(text).replace(/\s+/g, ' ');
      if (t) line.push({ text: t, style: styleOf(stack) });
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === 'br') {
      lines.push(line);
      line = [];
    } else if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (!attrs.trim().endsWith('/')) {
      stack.push(openFrame(tag, attrs));
    }
  }
  lines.push(line);
  return lines;
}

/** Merges adjacent runs of the same style and trims the line's outer whitespace. */
function tidy<T extends RawRun>(runs: T[]): T[] {
  const out: T[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.style === r.style) last.text += r.text;
    else out.push({ ...r });
  }
  for (const r of out) r.text = r.text.replace(/\s+/g, ' ');
  if (out.length) {
    out[0].text = out[0].text.trimStart();
    out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  }
  return out.filter((r) => r.text !== '');
}

const LABEL_KIND: Record<string, Line['kind']> = {
  'Ant.': 'antiphon',
  '℣.': 'versicle',
  '℟.': 'response',
};

function classify(raw: RawRun[]): Line {
  // Drop-capitals: a big red letter at the start of a word.
  let runs: Run[] = raw.map((r) => (r.style === 'big' ? { text: r.text, style: 'initial' } : (r as Run)));
  runs = tidy(runs);
  if (runs.length === 0) return { kind: 'break', runs: [] };

  const [first, ...rest] = runs;
  if (first.style === 'mark' && /^\d+:\d+[a-z]?$/.test(first.text.trim()) && rest.length) {
    return { kind: 'verse', label: first.text.trim(), runs: tidy(rest) };
  }
  if (first.style === 'rubric' && rest.length && /^(Ant\.|℣\.|℟\.|℟\.br\.|R\.br\.)$/.test(first.text.trim())) {
    const label = first.text.trim();
    return { kind: LABEL_KIND[label] ?? 'response', label, runs: tidy(rest) };
  }
  if (runs.every((r) => r.style === 'rubric' || r.style === 'mark' || r.style === 'small')) {
    return { kind: 'rubric', runs };
  }
  return { kind: 'text', runs };
}

function parseSection(cellHtml: string): Section {
  const html = cellHtml.replace(/<DIV ALIGN='right'>[\s\S]*?<\/DIV>/i, '');
  const raw = toRawLines(html).map((l) => tidy(l));

  // A cell holding only "Name{omittitur}" marks a part left out today.
  const nonEmpty = raw.filter((l) => l.length);
  if (nonEmpty.length === 1 && nonEmpty[0].every((r) => r.style === 'small')) {
    const text = nonEmpty[0].map((r) => r.text).join('');
    const m = /^(.*?)\s*\{omittitur\}$/.exec(text);
    if (m) return { heading: m[1], omitted: true, lines: [] };
  }

  const section: Section = { lines: [] };
  const head = (raw[0] ?? []).filter((r) => r.text.trim());
  if (head[0]?.style === 'big' && head.slice(1).every((r) => r.style === 'small')) {
    section.heading = head[0].text;
    const note = head
      .slice(1)
      .map((r) => r.text)
      .join(' ')
      .trim()
      .replace(/^\{(.*)\}$/, '$1');
    if (note) section.note = note;
    raw.shift();
  }

  for (const l of raw) {
    const line = classify(l);
    const prev = section.lines[section.lines.length - 1];
    if (line.kind === 'break' && (!prev || prev.kind === 'break')) continue;
    section.lines.push(line);
  }
  while (section.lines[section.lines.length - 1]?.kind === 'break') section.lines.pop();
  return section;
}

/** Maps Divinum Officium's display colors to liturgical colors. */
function liturgicalColor(doColor: string | undefined): LiturgicalColor {
  switch (doColor) {
    case 'green':
      return 'green';
    case 'red':
      return 'red';
    case 'purple':
      return 'violet';
    case 'grey':
      return 'black';
    case 'deeppink':
      return 'rose';
    default:
      // DO prints white feasts in black (no COLOR attribute) and Marian feasts in blue.
      return 'white';
  }
}

/** Parses the celebration line printed above an hour. */
export function parseHeadline(html: string): Headline {
  const p = /<P ALIGN=CENTER>([\s\S]*?)<\/P>/i.exec(html)?.[1] ?? '';
  const font = /<FONT\s*([^>]*)>([^<]*)<\/FONT>/i.exec(p);
  const full = decodeEntities(font?.[2] ?? '').trim();
  const [title, rank] = full.split(/\s+~\s+/);
  const notes = p
    .slice((font?.index ?? 0) + (font?.[0].length ?? 0))
    .split(/<br\/?>/i)
    .map((s) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return { title, rank, color: liturgicalColor(attr(font?.[1] ?? '', 'color')?.toLowerCase()), notes };
}

/** Parses one hour's officium.pl output. */
export function parseHour(html: string): Hour {
  const title = decodeEntities(/<H2[^>]*>([\s\S]*?)<\/H2>/i.exec(html)?.[1] ?? '').trim();
  const sections: Section[] = [];
  const cell = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
  let m: RegExpExecArray | null;
  while ((m = cell.exec(html))) {
    const s = parseSection(m[1]);
    if (s.heading || s.lines.length) sections.push(s);
  }
  return { title, headline: parseHeadline(html), sections };
}
