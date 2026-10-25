# sunzy

**sunzy** is a free, open-source browser roguelike: a complete visual reskin and
web port of [Shattered Pixel Dungeon](https://shatteredpixel.com/shatteredpd/) v4.0.2.

Play in the browser (TeaVM / gdx-teavm WebGL build), no install needed.

## What this is

- **Gameplay-first fork**: mechanics, items, enemies, and balance are untouched
  Shattered Pixel Dungeon v4.0.2 — all credit for game design goes to
  [Evan Debenham (00-Evan)](https://github.com/00-Evan/shattered-pixel-dungeon)
  and the SPD contributors.
- **Original visual identity**: every player-facing asset — UI chrome, terrain
  (six regions + variants), heroes, monsters, bosses, NPCs, items, icons,
  splash paintings, and effects — has been procedurally restyled with an
  original "sunzy" palette (deep indigo `#1A2238`, amber gold `#FFC84A`,
  jade `#3DDC84`, sharp dark outlines). Asset transforms are scripted and
  reproducible (`tests/rebrand/`).
- **Browser port**: a Gradle `web` module compiles the game to WebAssembly/JS
  via [gdx-teavm](https://github.com/xpenatan/gdx-teavm), with saves in
  IndexedDB, touch + keyboard input, and upstream news/update services
  disabled (this fork never contacts upstream hosts).

## Legal

- sunzy is **GPL-3.0**, same as upstream — see [LICENSE.txt](LICENSE.txt).
- sunzy is not affiliated with or endorsed by Evan Debenham or Watabou.
- All source-file copyright headers and the in-game Credits/About scenes
  deliberately preserve the original authors' attribution.
- If you like the game, support the original developer:
  [Shattered Pixel Dungeon Patreon](https://www.patreon.com/ShatteredPixel),
  or support the original 2012 Pixel Dungeon by
  [Watabou](https://watabou.itch.io/).

## Building

Requires JDK 21 (Desktop check build) and Gradle wrapper:

```
gradlew :desktop:classes    # desktop compile gate
gradlew :web:webBuild       # web build (TeaVM)
```

Web build output goes to `web/build/dist`; serve it with any static file
server and open in a modern browser.

## Docs

Architecture, patch list, debugging postmortems (including a WebGL terrain
corruption root-cause story), and the reskin program record live in
[docs/web-port-architecture.md](docs/web-port-architecture.md).
