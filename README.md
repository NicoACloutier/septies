# Septies

The Divine Office according to the 1960 *Breviarium Romanum*, in Latin with
Gregorian chant notation and organ playback, served as a static site on GitHub Pages.

- Texts and rubrics: [Divinum Officium](https://github.com/DivinumOfficium/divinum-officium)
- Chant: [GregoBase](https://gregobase.selapa.net) (GABC), rendered with [Exsurge](https://github.com/frmatthew/exsurge)
- Playback: Web Audio via [Tone.js](https://tonejs.github.io)

## Development

```sh
npm install
npm run dev        # local site
npm run generate   # build-time: regenerate public/data from Divinum Officium
npm run build      # typecheck + production build to dist/
```

## License

Code is [MIT](LICENSE). The liturgical texts and chant are public domain; the
third-party data and libraries above keep their own licenses.
