// Makes sure Perl can load CGI.pm, which officium.pl needs. If the system
// Perl lacks it (e.g. Git for Windows), downloads the pure-Perl CGI
// distribution from CPAN into pipeline/.perl5 (gitignored).
//
// On Debian/Ubuntu, `apt-get install libcgi-pm-perl` works too.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { LOCAL_PERL_LIB } from './do-engine';

const CGI_VERSION = '4.66';
const CGI_URL = `https://cpan.metacpan.org/authors/id/L/LE/LEEJO/CGI-${CGI_VERSION}.tar.gz`;

function perlHas(module: string): boolean {
  try {
    // Relative -I path: MSYS Perl on Windows can't resolve C:\ paths.
    execFileSync(process.env.PERL ?? 'perl', ['-I', basename(LOCAL_PERL_LIB), `-M${module}`, '-e1'], {
      cwd: dirname(LOCAL_PERL_LIB),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** Extracts entries under `prefix` from an uncompressed tar archive into `dest`. */
function untar(tar: Buffer, prefix: string, dest: string): number {
  let count = 0;
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, len: number) => header.subarray(start, start + len).toString('utf8').replace(/\0.*$/s, '');
    const name = field(345, 155) ? `${field(345, 155)}/${field(0, 100)}` : field(0, 100);
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    off += 512;
    if ((type === '0' || type === '') && name.startsWith(prefix)) {
      const out = join(dest, name.slice(prefix.length));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, tar.subarray(off, off + size));
      count++;
    }
    off += Math.ceil(size / 512) * 512;
  }
  return count;
}

async function main(): Promise<void> {
  if (perlHas('CGI')) {
    console.log('Perl can load CGI.pm; nothing to do.');
    return;
  }
  console.log(`Downloading CGI.pm ${CGI_VERSION} from CPAN...`);
  const res = await fetch(CGI_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const tar = gunzipSync(Buffer.from(await res.arrayBuffer()));
  const n = untar(tar, `CGI-${CGI_VERSION}/lib/`, LOCAL_PERL_LIB);
  console.log(`Installed ${n} files into ${LOCAL_PERL_LIB}`);
  if (!perlHas('CGI')) {
    throw new Error('Perl still cannot load CGI.pm (it also needs HTML::Entities and URI).');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
