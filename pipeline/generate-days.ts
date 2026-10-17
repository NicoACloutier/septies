// Runs the Divinum Officium engine (1960 rubrics) for a date range and writes
// normalized JSON, one file per hour, to public/data/YYYY/MM-DD/<hour>.json,
// plus public/data/index.json.
//
// Usage: npm run generate -- [--from YYYY-MM-DD] [--days N] [--jobs N]
// Defaults: from = 7 days ago, days = 30, jobs = number of CPUs.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { DataIndex, Headline, Hour, HourFile, HourId } from '../src/types';
import { runHour, type DoHour } from './do-engine';
import { parseHour } from './parse-do';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

/** Every hour of the office, in order. */
const HOURS: [HourId, DoHour][] = [
  ['matutinum', 'Matutinum'],
  ['laudes', 'Laudes'],
  ['prima', 'Prima'],
  ['tertia', 'Tertia'],
  ['sexta', 'Sexta'],
  ['nona', 'Nona'],
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

interface Day {
  date: string;
  celebration: Headline;
  hours: [HourId, Hour][];
}

async function buildDay(date: string): Promise<Day> {
  // Each hour as text and as chant.
  const runs = await Promise.all(
    HOURS.flatMap(([, doHour]) => [runHour(date, doHour), runHour(date, doHour, true)]),
  );
  const hours = HOURS.map(([id], i): [HourId, Hour] => {
    const hour = parseHour(runs[2 * i]);
    hour.cantus = parseHour(runs[2 * i + 1]).sections;
    return [id, hour];
  });
  // The day's own celebration is the one Lauds is said of; Vespers may already
  // belong to the following day.
  const celebration = hours.find(([id]) => id === 'laudes')![1].headline;
  return { date, celebration, hours };
}

async function writeDay(day: Day): Promise<void> {
  const [y, m, d] = day.date.split('-');
  const dir = join(OUT_DIR, y, `${m}-${d}`);
  await mkdir(dir, { recursive: true });
  // The older single-file layout (YYYY/MM-DD.json), if left from an earlier run.
  await rm(join(OUT_DIR, y, `${m}-${d}.json`), { force: true });
  await Promise.all(
    day.hours.map(([id, hour]) => {
      const file: HourFile = { date: day.date, rubrics: '1960', celebration: day.celebration, hour };
      return writeFile(join(dir, `${id}.json`), JSON.stringify(file));
    }),
  );
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
  // Each day already runs a text and a chant run per hour in parallel, so divide the job budget.
  const perDay = 2 * HOURS.length;
  await Promise.all(Array.from({ length: Math.max(1, Math.floor(jobs / perDay)) }, worker));
  process.stdout.write('\n');

  const index: DataIndex = { from, to: dates[dates.length - 1], generated: new Date().toISOString() };
  await writeFile(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`Wrote ${dates.length} days (${index.from} to ${index.to}) to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
