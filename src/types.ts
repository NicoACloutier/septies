// Shape of the per-day JSON files in public/data/YYYY/MM-DD.json,
// produced by pipeline/generate-days.ts.

export type HourId =
  | 'matutinum'
  | 'laudes'
  | 'prima'
  | 'tertia'
  | 'sexta'
  | 'nona'
  | 'vesperae'
  | 'completorium';

export const HOURS: HourId[] = [
  'matutinum',
  'laudes',
  'prima',
  'tertia',
  'sexta',
  'nona',
  'vesperae',
  'completorium',
];

export const HOUR_NAMES: Record<HourId, string> = {
  matutinum: 'Matutinum',
  laudes: 'Laudes',
  prima: 'Prima',
  tertia: 'Tertia',
  sexta: 'Sexta',
  nona: 'Nona',
  vesperae: 'Vesperæ',
  completorium: 'Completorium',
};

export type LiturgicalColor = 'white' | 'red' | 'green' | 'violet' | 'black' | 'rose';

/** The celebration line shown above an hour, e.g. "S. Teresiæ Virginis ~ III. classis". */
export interface Headline {
  title: string;
  rank?: string;
  color: LiturgicalColor;
  /** Secondary lines such as "Tempora: ..." or "Vespera de sequenti; ...". */
  notes: string[];
}

/**
 * Inline styling of a run of text:
 * rubric = red text, initial = red drop-capital, mark = small red sign (‡),
 * cross = sign of the cross (✠), small = small black note, italic = italic text.
 */
export type RunStyle = 'rubric' | 'initial' | 'mark' | 'cross' | 'small' | 'italic';

export interface Run {
  text: string;
  style?: RunStyle;
}

/** break = blank line between stanzas or paragraphs; chant = a GABC score. */
export type LineKind = 'antiphon' | 'versicle' | 'response' | 'verse' | 'rubric' | 'text' | 'break' | 'chant';

/** A chant score in GABC, as shipped by Divinum Officium (mostly from GregoBase). */
export interface Chant {
  /** GABC notation body, without the header. */
  gabc: string;
  /** GABC header fields, e.g. name, mode, annotation ("8.G"), book, transcriber, initial-style. */
  header: Record<string, string>;
}

export interface Line {
  kind: LineKind;
  /** Red prefix pulled out of the line: "Ant.", "℣.", "℟.", or a verse number like "143:1". */
  label?: string;
  runs: Run[];
  /** Only on chant lines. */
  chant?: Chant;
}

export interface Section {
  heading?: string;
  /** Source note next to the heading, e.g. "ex Proprio Sanctorum". */
  note?: string;
  /** True when the rubrics omit this part today (e.g. Preces Feriales). */
  omitted?: boolean;
  lines: Line[];
}

export interface Hour {
  /** Heading as printed, e.g. "Ad Vesperas". */
  title: string;
  /** Celebration this hour belongs to; differs from the day's at first Vespers. */
  headline: Headline;
  /** The hour as text. */
  sections: Section[];
  /** The hour as sung: chant scores where DO has them, text elsewhere. */
  cantus?: Section[];
}

export interface Day {
  date: string; // YYYY-MM-DD
  rubrics: '1960';
  celebration: Headline;
  hours: Partial<Record<HourId, Hour>>;
}

/** public/data/index.json: the range of dates that have been generated. */
export interface DataIndex {
  from: string;
  to: string;
  generated: string;
}
