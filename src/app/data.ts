// Loads the generated JSON in public/data. Paths are relative so the site
// works under a GitHub Pages project path.

import type { DataIndex, HourFile, HourId } from '../types';

const cache = new Map<string, Promise<HourFile | null>>();

export async function loadIndex(): Promise<DataIndex | null> {
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    return res.ok ? ((await res.json()) as DataIndex) : null;
  } catch {
    return null;
  }
}

/** One hour of one day; resolves to null when it hasn't been generated. */
export function loadHour(date: string, hour: HourId): Promise<HourFile | null> {
  const key = `${date}/${hour}`;
  let file = cache.get(key);
  if (!file) {
    const [y, m, d] = date.split('-');
    file = fetch(`data/${y}/${m}-${d}/${hour}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<HourFile>) : null))
      .catch(() => null);
    cache.set(key, file);
  }
  return file;
}
