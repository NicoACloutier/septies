# Septies

The Divine Office according to the 1960 *Breviarium Romanum*, in Latin with
Gregorian chant notation and organ playback, served as a static site on GitHub Pages.

- Texts and rubrics: [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium)
- Chant: [GregoBase](https://gregobase.selapa.net) (GABC), rendered with [Exsurge](https://github.com/frmatthew/exsurge)
- Playback: Web Audio via [Tone.js](https://tonejs.github.io)

## Development

Requires Node 22+ and Perl 5.

```sh
git submodule update --init   # Divinum Officium (texts + rubrics engine)
npm install
npm run setup:perl            # installs CGI.pm locally if your Perl lacks it
npm run generate              # writes public/data for 7 days ago through 23 days ahead
npm run dev                   # local site
npm run build                 # typecheck + production build to dist/
```

`npm run generate -- --from 2026-12-20 --days 14` generates a specific range.

### How the data is made

`pipeline/generate-days.ts` runs Divinum Officium's `officium.pl` (1960 rubrics,
Latin only, content-only output) for each day and hour, and `pipeline/parse-do.ts`
turns its HTML into the JSON model in `src/types.ts`. The generated files are not
committed; the deploy workflow regenerates about a year of days on every push and weekly.

## License

Code is [MIT](LICENSE). The liturgical texts and chant are public domain; the
third-party data and libraries above keep their own licenses.
