// Loads the generated JSON in public/data. Paths are relative so the site
// works under a GitHub Pages project path.

import type { DataIndex, Day } from '../types';

const days = new Map<string, Promise<Day | null>>();

export async function loadIndex(): Promise<DataIndex | null> {
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    return res.ok ? ((await res.json()) as DataIndex) : null;
  } catch {
    return null;
  }
}

/** Resolves to null when the day hasn't been generated. */
export function loadDay(date: string): Promise<Day | null> {
  let day = days.get(date);
  if (!day) {
    const [y, m, d] = date.split('-');
    day = fetch(`data/${y}/${m}-${d}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Day>) : null))
      .catch(() => null);
    days.set(date, day);
  }
  return day;
}
