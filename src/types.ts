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

export type LiturgicalColor = 'white' | 'red' | 'green' | 'violet' | 'black' | 'rose';

export interface Celebration {
  name: string;
  rank: string;
  color: LiturgicalColor;
}

export type OfficeItemType =
  | 'rubric'
  | 'versicle'
  | 'antiphon'
  | 'psalm'
  | 'canticle'
  | 'hymn'
  | 'chapter'
  | 'responsory'
  | 'lesson'
  | 'prayer';

export interface OfficeItem {
  type: OfficeItemType;
  label?: string;
  ref?: string;
  text: string;
  /** GABC notation, or null when no chant is available. */
  gabc: string | null;
  /** Mode and termination, e.g. "8G". */
  mode?: string;
}

export interface Day {
  date: string; // YYYY-MM-DD
  rubrics: '1960';
  celebration: Celebration;
  commemorations: Celebration[];
  hours: Partial<Record<HourId, OfficeItem[]>>;
}
