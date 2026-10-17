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

/** break = blank line between stanzas or paragraphs. */
export type LineKind = 'antiphon' | 'versicle' | 'response' | 'verse' | 'rubric' | 'text' | 'break';

export interface Line {
  kind: LineKind;
  /** Red prefix pulled out of the line: "Ant.", "℣.", "℟.", or a verse number like "143:1". */
  label?: string;
  runs: Run[];
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
  sections: Section[];
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
