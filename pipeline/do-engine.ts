// Runs Divinum Officium's officium.pl from the command line, the same way its
// own regression scripts do, and returns the HTML body of one hour.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DO_ROOT = join(here, 'vendor', 'divinum-officium');
const HORAS_DIR = join(DO_ROOT, 'web', 'cgi-bin', 'horas');
/** Local Perl modules installed by setup-perl.ts (CGI.pm), if any. */
export const LOCAL_PERL_LIB = join(here, '.perl5');

export const VERSION = 'Rubrics 1960 - 1960';

/** DO's command names for each hour. */
export type DoHour = 'Matutinum' | 'Laudes' | 'Prima' | 'Tertia' | 'Sexta' | 'Nona' | 'Vespera' | 'Completorium';

// Perl runs from HORAS_DIR with relative paths only: Git for Windows' MSYS
// Perl can't resolve native Windows paths (C:\...) in @INC or FindBin.
function perlArgs(): string[] {
  if (!existsSync(LOCAL_PERL_LIB)) return [];
  return ['-I', relative(HORAS_DIR, LOCAL_PERL_LIB).replaceAll('\\', '/')];
}

/** Converts YYYY-MM-DD to DO's MM-DD-YYYY. */
function doDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y}`;
}

export function runHour(isoDate: string, hour: DoHour): Promise<string> {
  if (!existsSync(join(HORAS_DIR, 'officium.pl'))) {
    throw new Error(`Divinum Officium not found at ${DO_ROOT}. Run: git submodule update --init`);
  }
  const args = [
    ...perlArgs(),
    'officium.pl',
    `version=${VERSION}`,
    `command=pray${hour}`,
    `date=${doDate(isoDate)}`,
    'lang2=Latin',
    'content=1',
  ];
  return new Promise((resolve, reject) => {
    execFile(
      process.env.PERL ?? 'perl',
      args,
      { cwd: HORAS_DIR, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`officium.pl ${hour} ${isoDate} failed: ${stderr || err.message}`));
        // Drop the CGI headers (Set-Cookie, Content-type) before the first blank line.
        const body = stdout.replace(/^[\s\S]*?\r?\n\r?\n/, '');
        resolve(body);
      },
    );
  });
}
