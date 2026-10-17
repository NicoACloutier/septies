// Runs the Divinum Officium engine (1960 rubrics) for a date range and writes
// normalized day JSON to public/data/YYYY/MM-DD.json, plus public/data/index.json.
//
// Usage: npm run generate -- [--from YYYY-MM-DD] [--days N] [--jobs N]
// Defaults: from = 7 days ago, days = 30, jobs = number of CPUs.

import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { DataIndex, Day, HourId } from '../src/types';
import { runHour, type DoHour } from './do-engine';
import { parseHeadline, parseHour } from './parse-do';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

/** Hours included in the generated data (phase 1: Vespers and Compline). */
const HOURS: [HourId, DoHour][] = [
  ['vesperae', 'Vespera'],
  ['completorium', 'Completorium'],
];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function buildDay(date: string): Promise<Day> {
  // The day's own celebration is the one Lauds is said of; Vespers may already
  // belong to the following day.
  const [laudes, ...hours] = await Promise.all([
    runHour(date, 'Laudes'),
    ...HOURS.map(([, doHour]) => runHour(date, doHour)),
  ]);
  const day: Day = { date, rubrics: '1960', celebration: parseHeadline(laudes), hours: {} };
  HOURS.forEach(([id], i) => {
    day.hours[id] = parseHour(hours[i]);
  });
  return day;
}

async function writeDay(day: Day): Promise<void> {
  const [y, m, d] = day.date.split('-');
  const dir = join(OUT_DIR, y);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${m}-${d}.json`), JSON.stringify(day));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      days: { type: 'string' },
      jobs: { type: 'string' },
    },
  });
  const from = values.from ?? addDays(todayIso(), -7);
  const days = Number(values.days ?? 30);
  const jobs = Math.max(1, Number(values.jobs ?? availableParallelism()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !(days > 0)) {
    throw new Error('Usage: generate-days [--from YYYY-MM-DD] [--days N] [--jobs N]');
  }

  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < dates.length) {
      const date = dates[next++];
      await writeDay(await buildDay(date));
      done++;
      process.stdout.write(`\r${done}/${dates.length} ${date}`);
    }
  };
  // Each day already runs its hours in parallel, so divide the job budget.
  await Promise.all(Array.from({ length: Math.max(1, Math.floor(jobs / (HOURS.length + 1))) }, worker));
  process.stdout.write('\n');

  const index: DataIndex = { from, to: dates[dates.length - 1], generated: new Date().toISOString() };
  await writeFile(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`Wrote ${dates.length} days (${index.from} to ${index.to}) to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
