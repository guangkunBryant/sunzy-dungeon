# Architecture: Shattered Pixel Dungeon v4.0.2 → Browser (TeaVM/WASM-JS via gdx-teavm)

**Status:** Design document
**Target game:** Shattered Pixel Dungeon v4.0.2 (upstream commit `57a4e06a4caf162446d1c28caa7983f0493fecf0`, tag `v4.0.2`)
**Backend:** xpenatan/gdx-teavm **1.5.5** (libGDX 1.14.0 / TeaVM 0.14.0), Maven Central
**Ground truth:** github.com/glassesmonkey/shattered-pixel-dungeon-web — an existing, *playable* experimental port of the same game using the same backend. Every patch in this document marked **[PROVEN]** was extracted as a working diff from that repository and verified against upstream v4.0.2 source.

---

## 0. The seam (deep module vocabulary)

```
┌─────────────────────────────────────────────────────────────────┐
│  DEEP IMPLEMENTATION (do not touch, except patches in §2)        │
│  • core/     — game content (Dungeon, scenes, items, levels)     │
│  • SPD-classes/ — noosa engine + watabou utils (Game, Bundle,    │
│    FileUtils, glwrap, noosa, input)                              │
├────────────────── INTERFACE / SEAM ──────────────────────────────┤
│  • libGDX core APIs      (Gdx.app/audio/files/gl/input/net)      │
│  • com.watabou.utils.PlatformSupport  (fonts, insets, vibration) │
│  • com.watabou.utils.GameSettings    (Preferences-backed config) │
│  • com.watabou.utils.FileUtils       (default file type + path)  │
├─────────────────────────────────────────────────────────────────┤
│  NEW ADAPTER: web/ module (this port)                            │
│  WebLauncher · WebShatteredPixelDungeon · WebPlatformSupport ·   │
│  BuildWeb (TeaVM compiler + reflection + output patcher)         │
└─────────────────────────────────────────────────────────────────┘
```

The game already funnels **everything platform-specific** through four seams:

| Concern | Seam (v4.0.2 source) | Wired by launchers via |
|---|---|---|
| Fonts, insets, vibration, full-screen, openURI | `com.watabou.utils.PlatformSupport` (abstract, `SPD-classes/.../utils/PlatformSupport.java`) | `new ShatteredPixelDungeon(platform)` → stored in `Game.platform` |
| Saves, badges, rankings, bones, journal, keybinds | `com.watabou.utils.FileUtils.setDefaultFileProperties(Files.FileType, String)` → `Gdx.files.*` | called once in launcher `main()` |
| Settings | `com.watabou.utils.GameSettings.get()` → `Gdx.app.getPreferences("settings.xml")` | lazy default; no launcher call needed |
| Audio, GL, input | `Gdx.*` facades | backend-web implements them |

**Consequence:** the entire port is a new `web/` Gradle module of ~4 classes plus a small, enumerable patch list inside SPD-classes/core. Desktop (`DesktopLauncher.java`) is the behavioral oracle: if the desktop build is unchanged and green, the game is unchanged.

---

## 1. Module / adapter structure

### 1.1 New Gradle module `web/`

Exact `web/build.gradle` (**[PROVEN]** — copied from glassesmonkey, adjusted for v4.0.2 comments):

```groovy
plugins {
	id 'java-library'
}

[compileJava, compileTestJava]*.options*.encoding = 'UTF-8'
java.sourceCompatibility = java.targetCompatibility = appJavaCompatibility

def teavmBackendVersion = '1.5.5'

dependencies {
	implementation project(':core')

	implementation "com.badlogicgames.gdx:gdx:$gdxVersion"
	implementation "com.badlogicgames.gdx:gdx-freetype:$gdxVersion"
	implementation "com.badlogicgames.gdx-controllers:gdx-controllers-core:$gdxControllersVersion"
	implementation "com.github.xpenatan.gdx-teavm:backend-web:$teavmBackendVersion"
	implementation "com.github.xpenatan.gdx-teavm:gdx-freetype-teavm:$teavmBackendVersion"
	implementation "com.github.xpenatan.gdx-teavm:gdx-controllers-teavm:$teavmBackendVersion"

	// SPD-classes keeps org.json as an implementation dependency; the web
	// target needs it explicitly because TeaVM compiles the whole reachable app.
	implementation "org.json:json:20170516"
}

tasks.register('webBuild', JavaExec) {
	group = 'web'
	description = 'Builds the TeaVM browser version into web/build/dist/webapp.'
	dependsOn classes
	classpath = sourceSets.main.runtimeClasspath
	mainClass = 'com.shatteredpixel.shatteredpixeldungeon.web.BuildWeb'
	workingDir = rootDir
	args 'build'
}

tasks.register('webRun', JavaExec) {
	group = 'web'
	description = 'Builds and serves the TeaVM browser version on http://localhost:8080/.'
	dependsOn classes
	classpath = sourceSets.main.runtimeClasspath
	mainClass = 'com.shatteredpixel.shatteredpixeldungeon.web.BuildWeb'
	workingDir = rootDir
	args 'run'
}
```

Add `include 'web'` to root `settings.gradle`. Root `gradle.properties` already defines `gdxVersion=1.14.0`, `appJavaCompatibility`; add nothing else.

> **Critical version note:** gdx-teavm **1.5.5 has no Gradle plugin** — the plugin (`com.github.xpenatan.gdx-teavm`, `gdx-freetype-web` module naming, `gdxTeaVM {}` extension, dev-server) only exists from ~1.6.x/master. At 1.5.5 you use the **manual builder API** (`TeaCompiler`/`TeaBuilder`) as above, and the FreeType module is named **`gdx-freetype-teavm`**, not `gdx-freetype-web`. Do not mix 1.5.5 coordinates with the 1.6+ plugin docs. If a later upgrade to 1.6.1+/master is wanted, that unlocks the plugin + TeaVM dev server, but is a separate migration (reflection API changed completely between 1.5.x and master).

### 1.2 Class layout (exact package layout, **[PROVEN]**)

```
web/
  build.gradle
  src/main/java/com/shatteredpixel/shatteredpixeldungeon/web/
    WebLauncher.java                // TeaVM entry point (static main)
    WebShatteredPixelDungeon.java   // extends ShatteredPixelDungeon — browser lifecycle
    WebPlatformSupport.java         // extends com.watabou.utils.PlatformSupport
    BuildWeb.java                   // build-time only: TeaCompiler + reflection scan + app.js patcher
```

### 1.3 Who implements what

| Seam interface | Web adapter | Notes |
|---|---|---|
| `com.watabou.utils.PlatformSupport` | **`WebPlatformSupport`** | `updateDisplaySize()`/`updateSystemUI()` no-ops (canvas owned by `WebApplicationConfiguration`); `supportsFullScreen()=false`; `connectedToUnmeteredNetwork()=true`; `supportsVibration()` via `Gdx.input.isPeripheralAvailable(Peripheral.Vibrator)`; fonts via **gdx-freetype-teavm**: `setupFontGenerators` loads `fonts/pixel_font.ttf` + `fonts/droid_sans.ttf` with `FreeTypeFontGenerator`, Asian-char detection in `getGeneratorForString`, and `splitforTextBlock` reimplementation (ground truth: fork's 130-line file, copy verbatim) |
| `ApplicationListener` / game entry | **`WebShatteredPixelDungeon`** | `extends ShatteredPixelDungeon`; `create()` does intro-recovery (see §4); `render()` does 3s periodic autosave (see §4). Constructed as `new WebShatteredPixelDungeon(new WebPlatformSupport())` |
| Launcher | **`WebLauncher`** | sets `Game.version`/`Game.versionCode`, calls `FileUtils.setDefaultFileProperties(Files.FileType.Local, "shattered-pixel-dungeon/")` + `FileUtils.setBundleCompression(false)`, creates `WebApplicationConfiguration("canvas")` with `storagePrefix`, `showDownloadLogs=true`, `preloadListener = assetLoader -> assetLoader.loadScript("freetype.js")`, then `new WebApplication(game, config)` |
| TeaVM build | **`BuildWeb`** | manual `TeaCompiler` + `WebBackend`; reflection list from classpath scan; post-compile `app.js` patcher (§2 P9) |
| `Gdx.audio` (Sound/Music) | backend-web runtime (no adapter class) | SPD's `Sample`/`Music` enums call `Gdx.audio.*`; only the `Music` caching patch is needed (P6) |
| `News` / `Updates` services | **not wired** | like iOS; `News.service`/`Updates.service` stay null — core guards on null. `WebLauncher` simply doesn't set them (desktop does via `NewsImpl`/`UpdateImpl`) |
| Preferences | backend-web runtime (no adapter class) | `GameSettings` lazily calls `Gdx.app.getPreferences("settings.xml")`; backend-web implements `Preferences` against browser storage scoped by `config.storagePrefix` |

Key `WebLauncher` body (**[PROVEN]**, adjust version strings for v4.0.2):

```java
public static void main(String[] args) {
    Game.version = "4.0.2-WEB";
    Game.versionCode = 911;               // mirror upstream v4.0.0 code+1 per upstream convention

    FileUtils.setDefaultFileProperties(Files.FileType.Local, "shattered-pixel-dungeon/");
    FileUtils.setBundleCompression(false);

    WebApplicationConfiguration config = new WebApplicationConfiguration("canvas");
    config.width = 0;                      // full-window canvas
    config.height = 0;
    config.storagePrefix = "shattered-pixel-dungeon";
    config.showDownloadLogs = true;
    config.preloadListener = assetLoader -> assetLoader.loadScript("freetype.js");

    new WebApplication(new WebShatteredPixelDungeon(new WebPlatformSupport()), config);
}
```

---

## 2. Patch list (changes inside SPD-classes/core)

Method: apply only this list. **Everything else in the glassesmonkey diff is upstream version-gap noise** (their base is ~v3.3.8) — see §2.3 "do NOT copy" list. GL patches are gated behind `DeviceCompat.isWeb()` so desktop behavior is bit-identical.

### 2.1 Required patches

| # | File | Change | Risk | Avoid touching core? |
|---|---|---|---|---|
| P1 | `SPD-classes/.../com/watabou/utils/DeviceCompat.java` | Replace `SharedLibraryLoader.os == Os.X` checks with `Gdx.app.getType() == ApplicationType.X` (null-guarded) and add `public static boolean isWeb() { return Gdx.app != null && Gdx.app.getType() == ApplicationType.WebGL; }` **[PROVEN]** | **trivial** | No — but it is *the* enabling patch for all others. (Classpath-replacement tricks not worth it; 20-line diff.) |
| P2 | `SPD-classes/.../com/watabou/glwrap/Vertexbuffer.java` | `updateGLData()`: WebGL's `glBufferSubData` via the TeaVM bridge uploads the **entire** typed-array view, so a partial update with `vertices.position(updateStart)` corrupts data. Fix: when `isWeb()`, copy the dirty range into a scratch `BufferUtils.newFloatBuffer(updateEnd-updateStart)` and upload that; also `position(0)` before full `glBufferData`. Keep the original path for desktop. **[PROVEN]** (21-line diff, exact code in fork) | **moderate** (visual corruption if wrong; easy to test) | No — every call site constructs `Vertexbuffer` directly. *Alternative seam:* patch backend-web's GL bridge instead — rejected: game-side is proven and backend stays vanilla. Note v4.0.2's new `CustomTilemap.updateMapCell` partial-update path depends on this. |
| P3 | `SPD-classes/.../com/watabou/noosa/RenderedText.java` | (a) `measure()`: don't throw "text measured from the actor thread" when `isWeb()` (TeaVM threads make the actor-thread assertion misfire) **[PROVEN]**; (b) the nested `RenderedTextBitmapFontCache.draw()`: cache one `Vertexbuffer` per quad-count keyed map, invalidate on `Game.scene()` switch (scene switches clear all GPU buffers), call `script.drawQuadSet(vertexBuffer, count/20, 0)` instead of uploading a raw `FloatBuffer` **[PROVEN]** | **moderate** | No — static nested class instantiated inside `RenderedText`. |
| P4 | `SPD-classes/.../com/watabou/noosa/NoosaScript.java` | Add `public void drawTriangles(Vertexbuffer buffer, int size)` — bind, `aXY/aUV.vertexBuffer(...)`, `glDrawArrays(GL_TRIANGLES, 0, size)`. Additive method; nothing existing changes. **[PROVEN]** | **trivial** | No. (Upstream v4.0.2 already has `drawQuadSet(Vertexbuffer, length, offset)` and `drawQuad(Vertexbuffer)` — only `drawTriangles` is missing.) |
| P5 | `core/.../effects/Flare.java`, `core/.../effects/CircleArc.java` | Replace indexed drawing (`FloatBuffer` vertices + `ShortBuffer` indices, `drawElements`) with expanded triangle vertices in one `Vertexbuffer` drawn via the new `drawTriangles` **[PROVEN]**. Rationale: TeaVM/WebGL element-array path is unproven in this stack; the fork's expansion approach is proven. | **moderate** (self-contained ~60-line rewrites of `updateTriangles()`/`draw()`) | Partly — **experiment first**: keep upstream `drawElements` and check Flare/CircleArc render in M2. If they render, skip P5 entirely (smaller diff). If not, apply the fork's rewrite. |
| P6 | `SPD-classes/.../com/watabou/noosa/audio/Music.java` | Drop the `trackPlayers` HashMap player cache (v4.0.2 `reset()`/`createPlayer()` cache `Gdx.audio.Music` instances across scenes — breaks on web because AudioContext instances are invalidated by page reload/autoplay policy); `stop()` → `dispose()` + null; `playNextTrack` off-thread for non-desktop **[PROVEN]**. Companion: upstream `Game.dispose()` calls `Music.INSTANCE.reset()` — either patch `Game.java` to call `stop()` (fork) or keep `reset()` but make its body cache-free (cleaner for v4.0.2, leaves `Game.java` untouched). | **moderate** (regression risk on native if done wrong — keep the cache on desktop? No: the cache-free version is behaviorally fine on desktop too, and keeps one code path; but gate behind `isWeb()` if paranoid) | No — `Music` is an enum singleton; cannot override from the web module. |
| P7 | `SPD-classes/.../com/watabou/utils/FileUtils.java` | Add `private static boolean bundleCompression = true;` + `public static void setBundleCompression(boolean)`; `bundleToStream` passes it to `Bundle.write(bundle, output, bundleCompression)` **[PROVEN]**. Upstream v4.0.2 `Bundle.write` **already has** the 3-arg overload (`Bundle.java:539`), so `Bundle.java` itself needs **zero** changes. Reason: TeaVM's `GZIPOutputStream` path is problematic/slow; read path auto-detects compression by `0x1f8b` header (`Bundle.java:494-502`), so uncompressed web saves and compressed desktop saves coexist. | **trivial** | No (static method). Alternative: leave compression on and test — rejected; fork proved disabled is safe. |
| P8 | `core/.../scenes/GameScene.java` | Actor-thread lifecycle for TeaVM semantics: (a) `destroy()`-path: `if (isWeb()) endActorThread(); else if (!waitForActorThread(4500,true)) ...` (the 4.5s blocking wait hangs under TeaVM) **[PROVEN]**; (b) replace `actorThread.interrupt()` with `synchronized (actorThread) { actorThread.notify(); }` when web (TeaVM throws JavaError interrupting a thread during monitor unwinding) **[PROVEN]**; (c) guards on `Actor.processing()` around `waitForActorThread(500,false)` **[PROVEN]** | **hard** (concurrency semantics; highest reasoning burden) — but the diff is ~20 lines and proven | No. |
| P9 | *(not core — build-time)* `BuildWeb.patchTeaVmOutput()` | Post-compile patch of generated `webapp/app.js`: (1) TeaVM's `$rt_simpleConstructors` table can list constructors whose bodies were eliminated — alias them to the nearest defined superclass constructor (fork's ~130-line resolver, **[PROVEN]**, runs only when aliases are needed); (2) null-guard the second of the two `pagehide`/`visibilitychange` listeners backend-web registers (double-pause crash on reload) **[PROVEN]**; (3) inject `<link rel="icon" href="data:,">` into `index.html` to silence favicon 404s. | **moderate** — **brittle**: regexes over generated JS; **pin TeaVM exactly 1.5.5** and `node --check` after every build (CI gate) | Yes — this is outside core by design. |

### 2.2 Implicitly covered (no patch needed, verify at M2)

- **Tilemaps** (`noosa/Tilemap.java`, `tiles/Dungeon*Tilemap.java`): upstream `Tilemap.updateMap/updateMapCell` already use `Vertexbuffer` — P2 fixes their partial uploads. The glassesmonkey tiles diffs are version-gap (v4.0.2's `updateMapCell`, `MiningLevel`, mine-crystal visuals), **not** web patches.
- **Input**: SPD's `InputHandler` consumes libGDX `InputProcessor` events; backend-web maps mouse/touch/keys. Expect no patch.
- **Scene/window save-restore on resize** (`ShatteredPixelDungeon.resize`): pure libGDX, works.
- **org.json**: `SPD-classes` uses it (`News` parsing); explicitly added to web deps (§1.1).

### 2.3 Do NOT copy from glassesmonkey (upstream version-gap noise)

Their base predates v4.0.2; these diffs exist only because of the version gap and would be **wrong** on v4.0.2:
`Emitter` (`target.width()` → field access), `TorchHalo` (same), `CustomTilemap` (removal of `updateMap`/`updateCell`/`allowWater` — v4.0.2 features), `DungeonTerrainTilemap`/`TerrainFeaturesTilemap`/`DungeonTileSheet` (v4.0 raised-terrain rework), `TargetedCell`/`CheckedCell` (Bundlable-ization is a v4.0.2 feature, keep it), `SpectralWallParticle`, `CharSprite`/`ItemSprite`/`FloatingText`/`Button`/`BlobEmitter`, and all `Vault*`/trinket content. Fork's `WebShatteredPixelDungeon.hasSavedGame()` also hardcodes `MAX_SLOTS` paths — fine to keep, but keep upstream-consistent.

### 2.4 Reflection (the invisible patch that must not be forgotten)

`Bundle` (SPD-classes) deserializes via `Reflection.forName(clName)` → libGDX `ClassReflection.forName`/`newInstance` for **every `Bundlable` class** (~500 classes across core + SPD-classes: mobs, items, buffs, levels, rooms...). TeaVM dead-strips reflective-only classes unless registered.

**[PROVEN]** approach (in `BuildWeb`, build-time only):
1. Scan `java.class.path` (dirs + jars) for `.class` names starting `com.shatteredpixel.shatteredpixeldungeon.` or `com.watabou.`;
2. Keep only concrete classes with a no-arg (or non-private) constructor via `Class.forName(name, false, loader)` + `getDeclaredConstructor()`;
3. Feed to `DefaultReflectionListener.addClassOrPackage(name)` (gdx-teavm 1.5.5 API);
4. The `app.js` constructor-alias patcher (P9.1) covers the residual TeaVM compiler gap where a registered class's simple constructor was eliminated.

This is build-time code — **zero core changes**, but it is why saves work at all. A startup self-test (§5, M1) validates it early.

---

## 3. Build pipeline

### 3.1 Toolchain & repositories

- JDK **17+** (fork requirement; Gradle 9.5 wrapper). TeaVM compiles from bytecode, so core stays Java 11 target.
- Root `build.gradle` repositories:
  ```groovy
  repositories {
      mavenCentral()
      maven { url = uri("https://central.sonatype.com/repository/maven-snapshots/") } // only needed for -SNAPSHOT
      // fallback if TeaVM artifacts don't resolve from Central:
      // maven { url = uri("https://teavm.org/maven/repository/") }
  }
  ```
- Exact coordinates (1.5.5, all on Maven Central):
  - `com.github.xpenatan.gdx-teavm:backend-web:1.5.5`
  - `com.github.xpenatan.gdx-teavm:gdx-freetype-teavm:1.5.5`
  - `com.github.xpenatan.gdx-teavm:gdx-controllers-teavm:1.5.5`
  - Plus `com.badlogicgames.gdx:gdx:1.14.0`, `gdx-freetype:1.14.0`, `gdx-controllers-core` (already pinned in root gradle.properties).

### 3.2 TeaVM compilation flags (**[PROVEN]** — `BuildWeb.main`)

```java
WebBackend backend = new WebBackend()
        .setHtmlTitle("Shattered Pixel Dungeon")
        .setHtmlWidth(720)
        .setHtmlHeight(1280)
        .setJettyPort(8080)
        .setStartJettyAfterBuild(runAfterBuild);   // true for 'run' arg

new TeaCompiler(backend)
        .addAssets(new AssetFileHandle("core/src/main/assets"))
        .addAssets(new AssetFileHandle("desktop/src/main/assets"))   // window icons
        .setMainClass(WebLauncher.class.getName())
        .setOutputName("app")
        .setOptimizationLevel(TeaVMOptimizationLevel.ADVANCED)  // NOT FULL — FULL was not proven; ADVANCED ≈ minutes
        .setObfuscated(false)
        .setMinHeapSize(64 * 1024 * 1024)
        .setMaxHeapSize(512 * 1024 * 1024)      // SPD allocates heavily at dungeon gen
        .setMinDirectBuffersSize(64 * 1024 * 1024) // GL + audio buffers
        .setReflectionListener(buildReflectionList())
        .build(new File("web/build/dist"));
// then: patchTeaVmOutput(); disableMissingFaviconRequest();
```

### 3.3 JS vs WASM output — **recommendation: JS (single target) for v1**

- gdx-teavm 1.5.5's `WebBackend` supports WASM (`setWebAssembly(true)`), but the fork — the only proven reference — ships **JS**, and TeaVM 0.14's WasmGC support is immature. JS output is also debuggable with source maps and `node --check` (our CI gate).
- Plan: JS only for M0–M5; revisit WASM after a full-run validation on a newer gdx-teavm (1.6.1+ / TeaVM 0.15+), as a separate initiative.
- Output: `web/build/dist/webapp/` — `index.html`, `app.js`, `freetype.js` runtime, copied assets. Generated output is never committed.

### 3.4 Asset packaging & size expectations

- Assets are **copied into the output dir** (served as regular HTTP files), *not* packed into a JAR: `TeaCompiler.addAssets` copies `core/src/main/assets` as libGDX-internal assets; backend-web compiles a **preload manifest into the TeaVM output** (a generated runtime class — no `assets/preload.txt`) preserving `Gdx.files.internal(...)` semantics. `freetype.js` is loaded via `preloadListener.loadScript("freetype.js")` before the game boots so FreeType glyph generation works.
- Expected sizes: SPD core assets ≈ **7–9 MB** (spritesheets ~2MB, sounds ~4MB OGG, music streaming on demand, fonts ~1MB); `app.js` unobfuscated ADVANCED ≈ **15–25 MB** (≈ 5–8 MB gzipped). Total dist ≈ **30–40 MB**, ≈ **12–15 MB over the wire** with gzip/brotli. Music `.ogg` files load lazily per scene (upstream behavior) — fine for HTTP.
- Hosting: any static file server; **enable gzip/brotli** (biggest single win for `app.js`). `WebPreloadApplicationListener` shows a loading logo during asset download.

### 3.5 Local dev loop (**[PROVEN]**)

```bash
./gradlew :desktop:classes :web:webBuild --stacktrace   # compile + TeaVM build
node --check web/build/dist/webapp/app.js               # generated-JS syntax gate
cd web/build/dist/webapp && python3 -m http.server 8081 --bind 127.0.0.1
# open http://127.0.0.1:8081/
```
or `./gradlew :web:webRun` → builds and serves on `http://localhost:8080/` via the backend's embedded Jetty. Faster iteration during patching: iterate with `args 'run'` and keep the Jetty task alive (re-run `webBuild` + refresh; no TeaVM incremental dev server at 1.5.5 — that arrives with the 1.6+ plugin's `devServer`).

---

## 4. Save persistence design

### 4.1 What SPD writes, and where it lands

All persistence funnels through `com.watabou.utils.FileUtils` (SPD-classes) → `Gdx.files.local("shattered-pixel-dungeon/" + name)` in the web adapter (set by `WebLauncher`):

| Data | Path (under base) | Writer |
|---|---|---|
| Game slot metadata+state | `game{N}/game.dat` | `Dungeon.saveGame` → `FileUtils.bundleToFile` |
| Level state per depth | `game{N}/depth{D}.dat`, `game{N}/depth{D}-branch{B}.dat` | `Dungeon.saveLevel` |
| Badges / rankings | `badges.dat` / `rankings.dat` | `Badges` / `Rankings` |
| Bones (dropped items) | `bones.dat` | `Bones` |
| Journal | `journal.dat` | `Journal` |
| Key bindings | keybindings file | `SPDAction` |
| Settings | `settings.xml` (Preferences) | `GameSettings` (lazy `Gdx.app.getPreferences`) |

**Browser mapping:** backend-web implements `FileHandle` (Local/Internal) and `Preferences` over browser storage, namespaced by `config.storagePrefix = "shattered-pixel-dungeon"`. Values are byte-array-backed virtual files under that prefix. *(Open verification task for M0: read backend-web 1.5.5 source to confirm the exact backing store — IndexedDB vs localStorage vs emscripten IDBFS. The fork's tested refresh→continue flow proves the default works either way; knowing the backing store matters for quota and write-atomicity reasoning.)*

**Why not localStorage for saves:** settings.xml via `Preferences` is small (fine anywhere), but `depth{n}.dat` files can reach hundreds of KB gzipped and `Bundle.write` streams bytes — IndexedDB-backed virtual FS (backend-web's default) is the right carrier and requires zero game-side code.

### 4.2 Compression

`FileUtils.setBundleCompression(false)` in `WebLauncher` (**[PROVEN]**): saves are written as plain serialized bundles (P7). Reads auto-detect by GZIP magic header (`Bundle.java:494`), so desktop-created compressed saves still load.

### 4.3 Atomicity & corruption recovery

Upstream already designs for interrupted writes:
- `FileUtils.bundleToFile` writes `name + ".spdtmp"` then `moveTo(name)` ( SPD-classes `FileUtils.java:200-219`);
- on boot, `FileUtils.cleanTempFiles()` recovers `.spdtmp` newer than the base file (`FileUtils.java:79-118`);
- `GamesInProgress.gameExists` treats length ≤ 1 as nonexistent.

Web adapter duties: **verify `moveTo`, `list()`, `deleteDirectory`, `lastModified` all work on backend-web's virtual FS in M0** (these are the FileHandle methods the recovery path uses; a missing one is a save-corruption bug). No core change expected.

### 4.4 Reload lifecycle (**[PROVEN]** — the fork's three mitigations)

Browser tabs reload abruptly; IndexedDB writes issued during `pagehide` can be cancelled mid-write. Three defenses, all in the web module:

1. **Periodic autosave** — `WebShatteredPixelDungeon.render()` calls `Dungeon.saveAll()` at most every 3 s, only when `Game.scene() instanceof GameScene && Dungeon.hero != null && Dungeon.hero.ready`. Loss window ≤ ~3 s of a turn; writes happen on stable frames, not during teardown.
2. **Intro recovery** — `create()`: if `SPDSettings.intro()` is still true (reload before finishing first-run tutorial) but a `game{N}/game.dat` > 1 byte exists, clear the intro flag so `WelcomeScene`/`TitleScene` resumes the existing run instead of always opening a new slot.
3. **app.js lifecycle guard** (P9.2) — backend-web clears its page listener on `pagehide`, then `visibilitychange` tries to pause it again → NPE crash on reload; patcher injects a null guard.

`Game.pause()/resume()/dispose()` (`noosa/Game.java:174-204`) are driven by backend-web's visibility handling — upstream code, no patch.

---

## 5. Testing strategy

### 5.1 Static gates (every build, CI)

```bash
./gradlew :desktop:classes            # oracle: game logic compiles + desktop untouched
./gradlew :web:webBuild --stacktrace  # TeaVM compile
node --check web/build/dist/webapp/app.js   # generated JS syntax
```

### 5.2 Headless browser verification (Node + Playwright)

Serve `web/build/dist/webapp` (static), then drive headless Chromium (`chromium.launch({ args: ['--use-gl=angle'] })` — SwiftShader/ANGLE for WebGL in headless):

- **Boot probe:** `page.goto(...)`, wait for `canvas`, assert no console errors (the **expected** `"The AudioContext was not allowed to start."` warning is allowlisted — Chrome autoplay policy, resumes on first gesture **[PROVEN]**).
- **Screenshot ladder:** capture PNG at each checkpoint (title, hero select, floor 1, each depth reached) → diff against golden images for visual regressions.
- **Scripted playthrough:** dispatch keyboard/touch events (tap-based movement works via pointer events) to enter the dungeon, move room-to-room, fight; descend stairs and screenshot each depth.
- **Save/reload matrix:** reach floor N → `page.reload()` → assert save slot appears in title UI and "continue" restores the explored dungeon (depth + fog state via screenshot compare).
- **Debug logs:** `config.showDownloadLogs = true` pipes backend logs to console — assert on them (asset manifest complete, no GL errors).

### 5.3 Milestones

| Milestone | Exit criteria |
|---|---|
| **M0 — build + boot** | `:web:webBuild` produces `webapp/`; page loads, canvas boots, preload manifest loads all assets, FreeType script loads; FileHandle `moveTo/list/lastModified/deleteDirectory` verified on backend-web FS; no console errors beyond autoplay warning |
| **M1 — title + font** | Title screen renders with correct pixel font (FreeType glyphs, flipped, bordered); text blocks wrap via `WebPlatformSupport.splitforTextBlock`; **startup reflection self-test**: `Bundle` round-trips a throwaway `Bundlable` in a dev-only scene → proves P-reflection + P9 aliases before gameplay |
| **M2 — gameplay render** | Floor 1 renders: tilemaps (terrain/walls/features), sprites, effects; **Flare + CircleArc decision point** (P5): test upstream `drawElements` first, apply fork rewrite only if broken; HUD/status pane render |
| **M3 — input + audio** | Tap/keyboard movement, doors, enemy combat, item pickup; music starts on first user gesture; SFX play; `Sample`/`Music` behave across scene switches (P6 verified) |
| **M4 — save/load** | Save slot detected on title; refresh → continue into explored dungeon; `.spdtmp` recovery simulated (kill page mid-write); intro-recovery works; settings persist across reload |
| **M5 — full-run validation** | Scripted deep run: descend through all 5 regions (or as far as automation allows), boss floors, shop, journal, rankings write; memory stable (512 MB heap OK); soak test 30+ min; mobile-browser touch spot-check |

---

## 6. Risk register (top 5, ranked)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **TeaVM reflection/serialization gaps**: dead-stripped `Bundlable` classes, eliminated `$rt_simpleConstructors`, `ClassReflection.forName` failures → saves can't load / items vanish | High (structural; TeaVM 0.14) | Critical (game broken mid-run) | Fork's classpath-scan reflection listener + constructor-alias patcher (**[PROVEN]**); **pin TeaVM to exactly 1.5.5** (patcher regexes are version-sensitive); M1 startup Bundle self-test fails fast; `node --check` + full build in CI on every commit |
| 2 | **Thread semantics under TeaVM**: actor-thread waits/interrupts hang or throw `JavaError`; `RenderedText` measure assertion misfires | High (proven by fork needing 3 separate patches) | High (hangs, crashes) | P3 + P8 exactly as proven; forbid *new* threading in the web module; never call `Thread.interrupt()` on the actor thread when `isWeb()` |
| 3 | **WebGL buffer semantics**: partial VBO uploads (P2) and element-array indices (P5) silently corrupt rendering rather than failing loudly | Medium | High (invisible corruption, hard to trace) | P2 is a contained 21-line proven diff; gate all GL changes behind `DeviceCompat.isWeb()` so desktop stays the oracle; screenshot-ladder diffs at M2 catch corruption early; try upstream `drawElements` before adopting the fork's triangle expansion |
| 4 | **Save durability on abrupt reload**: async browser-storage writes cancelled during `pagehide` → corrupt/lost saves | Medium | High (player trust) | Three-layer defense (§4.4): 3s stable-frame autosave, intro recovery, app.js lifecycle guard; `.spdtmp` recovery already in upstream; M4 kill-mid-write test; verify backend-web FS atomicity primitives in M0 |
| 5 | **Upstream drift / version-gap confusion**: glassesmonkey's base is ~v3.3.8 — its diff contains ~200 files of *non-web* changes; copying them wholesale onto v4.0.2 regresses the game; conversely v4.0.2 additions (`CustomTilemap.updateMapCell`) depend on P2 | High (already observed during this design) | High (subtle gameplay regressions) | Apply **only** the §2 patch list; §2.3 explicitly lists what NOT to copy; keep every patch `isWeb()`-gated; `:desktop:classes` + desktop smoke run as behavioral oracle; re-diff against upstream `v4.0.2` tag when cherry-picking fork code |

**Watch list (below top 5):** TeaVM build resource needs (ADVANCED optimization: multi-minute, ~2 GB heap — set `org.gradle.jvmargs` accordingly); first-load payload (~12–15 MB gzipped — enable brotli in hosting); iOS/web-controllers edge cases (defer); backend-web storage backing unknown (resolve in M0); audio `AudioContext` autoplay policy (expected warning, first-gesture resume).

---

## Appendix A: Ground-truth provenance

Everything marked **[PROVEN]** was verified from the glassesmonkey repository (cloned, `web` module + `SPD-classes`/`core` read, and diffed file-by-file against upstream `v4.0.2` tag `57a4e06`):

- `web/build.gradle` — exact deps (§1.1), JavaExec tasks
- `web/src/main/java/.../web/{WebLauncher,WebShatteredPixelDungeon,WebPlatformSupport,BuildWeb}.java` — adapter bodies (§1.3, §2 P9, §4.4)
- SPD-classes diffs (fork vs upstream): `Vertexbuffer` (+21/−2), `RenderedText` (+20/−2), `NoosaScript` (+16), `Music` (+27/−56), `DeviceCompat` (+8/−5), `FileUtils` (+6/−1), `Game` (±1)
- Core diffs confirmed web-related: `GameScene` actor-thread hunks; `Flare`/`CircleArc` index→triangle rewrite. All other core diffs attributed to the v3.3.8→v4.0.2 version gap (§2.3).
- Fork's tested status: playable, title→hero-select→floor 1→combat→refresh→continue; expected autoplay warning.

## Appendix B: Working-copy reference paths

- Upstream v4.0.2 sparse clone: `%TEMP%\opencode\spd2` (SPD-classes/src, core/src, desktop/src)
- Fork clone: `%TEMP%\opencode\spdw` (web, SPD-classes/src, core/src)
- gdx-teavm docs (master): https://github.com/xpenatan/gdx-teavm/blob/master/docs/usage.md — **note**: reflects 1.6+ plugin; 1.5.5 = manual builder only
