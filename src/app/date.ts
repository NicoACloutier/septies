// Date helpers. Dates are ISO strings (YYYY-MM-DD) in the viewer's local calendar.

const WEEKDAYS = ['Dominica', 'Feria II', 'Feria III', 'Feria IV', 'Feria V', 'Feria VI', 'Sabbato'];
const MONTHS = [
  'Ianuarii',
  'Februarii',
  'Martii',
  'Aprilis',
  'Maii',
  'Iunii',
  'Iulii',
  'Augusti',
  'Septembris',
  'Octobris',
  'Novembris',
  'Decembris',
];

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** e.g. "Sabbato, 17 Octobris 2026". */
export function latinDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
