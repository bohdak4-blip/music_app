# AGENTS.md — music_app

## What this is

A small desktop app for guitarists that combines three tools:

1. **AI voice-leading assistant** — given a 4-chord progression, it searches all
   playable fingerings on the middle four strings and picks the smoothest /
   most ergonomic path from chord to chord (a Viterbi-style dynamic program).
2. **Scale & mode viewer, guitar or piano** — shows any of the 7 diatonic modes
   (major-family: Ionian, Lydian, Mixolydian; minor-family: Aeolian, Dorian,
   Phrygian, Locrian) laid out on either a guitar fretboard or a 2-octave
   piano keyboard, with scale-degree labels and the degrees that differ from
   standard major/minor highlighted orange. An "Інструмент" selector next to
   the fretboard-view selector switches between the two.
3. **Modulation assistant tab** — UI for picking a "from" and "to" key to get
   modulation guidance (static Rick-Beato-style list + a dynamic assistant
   section; see `templates/index.html` around the `tabMod` section).
4. **Chord detection from audio** — upload a local audio file and get back a
   read-only timeline of the chords a lightweight local analyzer heard in it.

It's a Python desktop app: Flask serves the UI, `pywebview` wraps it in a
native window (no browser tab, no separate server process to manage).

## Stack

- **Backend**: Python 3, Flask (`app.py`)
- **Desktop shell**: `pywebview` (`webview.create_window` + `webview.start()`)
- **Chord detection**: `librosa` + `numpy` (chroma features + template
  matching — see below). Optional at runtime: the app still starts and the
  other two tabs work fine if these aren't installed; only the detection tab
  reports an error.
- **Frontend**: `templates/index.html` (markup only) + `static/css/style.css`
  + three plain (non-module) `<script src>` files loaded in this order:
  `static/js/theory.js` → `static/js/app.js` → `static/js/audio-chords.js`.
  No build step, no framework. UI text is in Ukrainian.

### Why three separate script files, and why plain scripts (not ES modules)

They were originally one big inline `<script>` block; they got split out so
the HTML file holds markup only. The split follows what each file *is*:

- `static/js/theory.js` — pure music-theory data and pure functions. No DOM
  access. `modesData`, `referenceMode`, `getAlteredIndices()`,
  `chordIntervalNames`, `chromaticDegrees`, `customChordTypes`, `tuning`,
  `noteNames`.
- `static/js/app.js` — the DOM/controller layer for tabs 1 and 2: the `ui`
  object, fretboard `render()`, progression slots, playback, the modulation
  presets (`loadMod`), `calculateVoiceLeading()` (the only fetch call before
  this feature, to `/api/voice-lead`), and `switchTab()` / `TAB_DEFS` (the
  tab-button ↔ panel-id map — add a tab by adding one entry here plus its
  button/panel in the HTML).
- `static/js/audio-chords.js` — the DOM/controller layer for tab 3:
  `analyzeAudioFile()` (posts to `/api/detect-chords`) and
  `renderChordTimeline()`.

They're loaded as plain `<script src>` tags (not `type="module"`) *on
purpose*: classic scripts on one page share a single top-level lexical scope,
so a top-level `const`/`function` in `theory.js` is directly visible in
`app.js` and `audio-chords.js` with zero imports/exports — this preserves the
exact behavior of the original single inline script. Load order matters
(theory → app → audio-chords) since later files reference earlier ones;
switching any of them to ES modules would break this implicit sharing and
require explicit `import`/`export`.

## Running it

```
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
python app.py
```

`requirements.txt`: `Flask` and `pywebview` are required for the app to start
at all. `numpy` + `librosa` are required only for the "Розпізнавання акордів"
tab — `app.py` catches their absence at import time (`AUDIO_DEPS_AVAILABLE`)
and the other two tabs work fine without them; `/api/detect-chords` just
returns a friendly error telling the user to `pip install -r requirements.txt`.
`librosa` pulls in `scipy`/`numba`/`soundfile`/`audioread` automatically as
its own dependencies. `soundfile` (libsndfile) reads `.wav`/`.flac` directly;
for `.mp3`/`.m4a`/other compressed formats, `librosa.load` falls back to
`audioread`, which needs an `ffmpeg` binary on `PATH` — install one if MP3
uploads fail to load.

## Building a Windows .exe (PyInstaller)

```
pip install -r requirements.txt -r requirements-build.txt
pyinstaller music_app.spec
```

Result: `dist/music_app/music_app.exe`, a folder ("onedir") containing the
`.exe` plus its dependencies alongside it — copy/zip the whole
`dist/music_app/` folder, not just the `.exe` file, to move it elsewhere.

**Important: this has not actually been run/tested.** It was written and
syntax-checked (`ast.parse` on the `.spec` file, and the `app.py` change
compiles), but no session so far has had a way to actually invoke
`pyinstaller` or run the resulting `.exe` — this environment's shell into
your computer is an isolated Linux sandbox that can't execute Windows
binaries at all (same reason `pip install` for `librosa` had to be run by
you directly, back when that was set up). So: run the build yourself, and
if it doesn't work first try, that's expected risk, not a sign you did
something wrong — see "If the build or the .exe fails" below before asking
for help elsewhere.

**Why a `.spec` file instead of a one-line `pyinstaller app.py` command**:
this dependency stack (`librosa` → `numba`/`llvmlite`/`scipy`/`soundfile`,
plus `pywebview`'s Windows GUI backend) is one of the trickier combinations
to freeze correctly — PyInstaller's automatic import analysis can miss
`numba`'s JIT-related data files, `llvmlite`'s bundled LLVM binaries,
`soundfile`'s bundled `libsndfile` DLL, and `webview`'s backend-selection
data. The spec uses `PyInstaller.utils.hooks.collect_all()` for each of
those five packages (`librosa`, `numba`, `llvmlite`, `soundfile`, `webview`)
to grab everything unconditionally rather than hoping the automatic
analysis finds it — bigger output, much better odds of actually working on
the first try, which matters a lot here since no session can iterate on a
failing build by actually running it.

**Why `app.py` needed a code change for this** (the `resource_path()`
helper + `Flask(__name__, template_folder=..., static_folder=...)`): Flask
normally locates `templates/`/`static/` relative to `app.py`'s own file
path. PyInstaller extracts bundled data files into a different location at
runtime (`sys._MEIPASS`, only set when frozen) — without `resource_path()`
pointing Flask at that location, the built `.exe` would launch but show a
blank window or a 404, unable to find `index.html`. This same helper works
unchanged for the normal `python app.py` case (falls back to the file's own
directory), so nothing about running from source changed.

**Why "onedir" (a folder) instead of "onefile" (a single `.exe`)**: onefile
re-extracts everything to a fresh temp directory on *every* launch, which
is slow for a dependency stack this size, and specifically bad for `numba`
— it caches JIT-compiled machine code to disk, and onefile gives it a new
empty cache directory every run, forcing a slower recompile every single
launch instead of once. Onedir keeps a stable folder next to the `.exe`, so
`numba`'s cache (and startup time generally) actually persists between
runs. If a single portable file still matters more than startup speed, the
spec has a comment block marked `ONEFILE` explaining the one-line change
(and the tradeoff) to flip it.

### If the build or the .exe fails

- `pyinstaller` prints its own errors to the terminal — read those first;
  "no module named X" appearing at runtime (in the built .exe, not during the build itself) usually
  means X needs its own `collect_all()` entry added to the spec's `for pkg
  in (...)` list.
- If the `.exe` itself closes instantly with no visible error: temporarily
  set `console=True` in the `EXE(...)` call in `music_app.spec` and
  rebuild — a console window will then stay open showing the Python
  traceback instead of the window just disappearing. Set it back to
  `False` once you've fixed the underlying issue (a GUI app shouldn't ship
  with a console window).
- A blank/white `pywebview` window that never loads the UI usually means
  either the WebView2 Runtime isn't installed on the machine running the
  `.exe` (present by default on current Windows 10/11, but worth checking
  on an older machine — pywebview's `edgechromium` backend needs it), or
  `resource_path()` isn't finding `templates`/`static` (double-check the
  `datas` list in the spec still lists both).
- The chord-detection tab failing only in the `.exe` (while working from
  source) most likely means one of `librosa`/`numba`/`llvmlite`/`soundfile`
  is missing a file that `collect_all()` didn't catch — the error message
  Flask returns to the tab (or the console, if you turned it on per above)
  will name the missing module/file.

## Backend (`app.py`)

- `TUNING`: only 4 strings are modeled — string 5 = A, string 4 = D,
  string 3 = G, string 2 = B (i.e. the middle four strings of standard
  tuning; low E and high E are intentionally excluded from voicing search).
- `generate_voicings(target_pcs)`: brute-forces every fret combination
  0–14 on those 4 strings, keeps the ones whose pitch classes exactly match
  the target chord tones and whose fretted (non-open) notes span ≤4 frets
  (a hand-sized stretch).
- `transition_cost(v1, v2)`: Manhattan distance between two voicings —
  proxy for physical movement between chords.
- `shape_difficulty(v, target_pcs)`: an ergonomic/"how normal does this
  chord sound" heuristic — penalizes wide spans and open-string-plus-high-fret
  combos, rewards barre-like shapes (few distinct frets) and having the
  chord root in the bass, penalizes a muddy (interval ≤2 semitones) bottom
  two strings.
- `api_voice_lead` (`POST /api/voice-lead`): takes `{progression: [[pcs...], ...], algorithm}`,
  runs a DP over all valid voicings per chord. `algorithm: 'ergonomic'`
  weights `transition_cost * 1.5 + shape_difficulty`; `algorithm: 'strict'`
  minimizes `transition_cost` alone (shortest physical path, ignoring
  comfort/shape). Returns the optimal path as fret positions per string.
- `detect_chords_from_audio(path)` + `api_detect_chords`
  (`POST /api/detect-chords`, multipart form field `audio`): see next section.

### Chord detection from audio (`detect_chords_from_audio`)

Deliberately **not** a neural chord recognizer (no madmom/BTC/Essentia) —
those are far more accurate but painful to install on Windows (C++ build
tools, pinned old numpy, Cython) or not published for Windows at all. This
is a classic DSP approach that installs with a plain `pip install`:

1. `librosa.load` the file → mono waveform at 22.05kHz.
2. `librosa.effects.harmonic` — strip the percussive component (drum hits
   pollute chroma with broadband noise) before computing chroma.
3. `librosa.feature.chroma_cqt` — a 12-bin pitch-class-energy vector per
   analysis frame.
4. Average chroma into fixed ~0.5s windows (`window_seconds`), for
   stability — a single frame is too noisy to key a chord off of.
5. Build a **template bank**: for each of 12 roots × 9 chord qualities
   (maj, m, 7, maj7, m7, dim, aug, sus2, sus4 — the same qualities
   `customChordTypes` in `theory.js` already knows about) construct the
   unit-normalized 12-vector with 1s at that chord's pitch classes.
6. For each windowed chroma vector, cosine-match against every template;
   the best-scoring label wins. Near-silent windows (energy below a
   threshold) get the label `"N"` (no chord / silence) instead.
7. Merge consecutive identical-label windows into segments, then merge any
   segment shorter than `min_segment_seconds` (default 1.0s — likely a
   transient/misfire) into its predecessor, and re-collapse any
   now-adjacent identical labels that merge produced.

Returns `[{start, end, chord}, ...]` (seconds, chord name like `"Am7"` or
`"N"`). The frontend renders `"N"` as `—` styled as a dimmed row.

This logic (template bank + segment merging) has a standalone unit test
that feeds it synthetic chroma vectors instead of real audio, so it's
verified without needing librosa installed — see the "Testing this project"
section below for how to re-run that style of check.

## Frontend

### `templates/index.html`

Markup only, three tabs (`tabProg`, `tabMod`, `tabChords`) plus the shared
fretboard/legend at the bottom. Static assets referenced via
`{{ url_for('static', filename='...') }}`.

### `static/js/theory.js` (pure data/model — see the "why three files" note above)

- `modesData` — the 7 modes, grouped by parent scale (`major` / `minor`),
  each with `intervals` (semitones from tonic) and `labels` (scale-degree
  names like `"1"`, `"#4"`, `"b7"`).
- `referenceMode` + `getAlteredIndices(baseScaleKey, modeKey)` — compares a
  mode's `labels` against its group's reference mode (Ionian for major,
  Aeolian/natural-minor for minor) and returns the set of scale-degree
  indices that differ, so `render()` can highlight them orange
  (`.scale-altered`) instead of the default blue (`.scale-regular`).
  Concretely: Lydian → `#4`; Mixolydian → `b7`; Dorian → natural `6` (vs.
  Aeolian's `b6`); Phrygian → `b2`; Locrian → `b2` and `b5`; Ionian/Aeolian →
  nothing (they *are* the references). Index-based, not hardcoded per mode,
  so a future harmonic/melodic-minor group just needs a `referenceMode`
  entry to get the same highlighting.
- `customChordTypes` — chord qualities (maj7, m7, 7, m7b5, dim7, aug7, 6,
  m6, sus2, sus4) used to color chord tones (root / 3rd / 5th / 7th) on the
  fretboard.
- `chromaticDegrees` — Roman-numeral labels for the 12 chromatic degrees,
  used in the modulation tab.

### `static/js/app.js` (tabs 1 & 2 controller)

- `TAB_DEFS` + `switchTab(tabId)` — see "why three files" above.
- `render()` — branches on `ui.instrumentView.value` (`'guitar'` default or
  `'piano'`) right after building the shared chord-display/legend text and
  `chordInfo`, then either runs the original 6-string × 15-fret loop or
  calls `renderPianoKeyboard()` and returns.
  - **Guitar** ("scale" view: all notes of the current mode, altered degrees
    highlighted; "chord" view: the current progression slot's chord tones,
    dimmed background scale, and — once "Find AI path" has run — the
    highlighted recommended voicing/fret position).
  - **Piano** (`renderPianoKeyboard()` + `buildPianoNoteMarker()`, using the
    pure `buildPianoLayout()` from `theory.js`): a fixed 2-octave keyboard
    (14 white keys, 10 black keys) built fresh on every render. Each pitch
    class gets the same scale/chord classification as the guitar view
    (`.scale-tonic`/`.scale-altered`/`.scale-regular`, `.chord-R/3/5/7`,
    `.dimmed`), so a given pitch class is marked identically in every octave
    it appears in. **Deliberately simpler in chord view than guitar**: since
    a piano key isn't a fret position, there's no "AI path"/single-voicing
    concept to pick — every occurrence of every chord tone across both
    octaves is shown brightly (never dimmed), rather than dimming
    non-selected fingerings the way the guitar view does.
- `calculateVoiceLeading()` — the progression tab's only network call, to
  `POST /api/voice-lead`. Guitar-only (voice-leading is about fret
  positions); switching to piano view doesn't change what this computes,
  it only changes how the resulting chord tones are drawn.

### `static/js/audio-chords.js` (tab 3 controller)

- `analyzeAudioFile()` — reads the selected `<input type="file">`, posts it
  as `multipart/form-data` to `POST /api/detect-chords`, shows a status
  line, and calls `renderChordTimeline()` on success.
- `renderChordTimeline(segments)` — one row per detected segment: time
  range, chord name (or `—` for silence/no-chord), duration.

This tab is intentionally **read-only in this version** — detected chords
don't feed back into the 4-slot voice-leading tool. See "Known gaps" below.

## Testing this project

There's no test framework wired in (no pytest, no npm). What exists so far
is ad hoc but real:

- **JS**: `node --check <file>.js` catches syntax errors in each of the
  three script files. Because they share global scope (see above), a
  meaningful smoke test needs to run all three in one `vm` context with a
  hand-rolled DOM stub (no `jsdom` available in this environment — no
  network egress to npm) — see the session history for the pattern:
  fake `document.getElementById`/`createElement` with a minimal
  `classList`, override `fetch`, `vm.runInContext` each file in order, then
  call `render()`/`switchTab()`/`analyzeAudioFile()` and assert on the fake
  DOM tree it built.
- **Chord-detection math**: the template-bank + segment-merging logic in
  `detect_chords_from_audio` was verified with a standalone numpy script
  that copies those two pieces verbatim and feeds them synthetic chroma
  vectors (e.g. an exact C-major chroma vector must classify as `"C"`; a
  short glitch segment must get absorbed into its neighbor) — this doesn't
  require librosa or a real audio file, just numpy.
- **Backend**: `python -m py_compile app.py` for a quick syntax check.

If this project grows, promoting these into a real `pytest` suite (for
`generate_voicings`/`shape_difficulty`/`api_voice_lead`'s DP and for the
chord-detection template bank) would be the natural next step — see "Known
gaps".

## Known gaps / ideas for next session

- **The PyInstaller build (`music_app.spec`) has never actually been run.** Written and syntax-checked only — no session has had a way to execute `pyinstaller` or run the resulting `.exe` (isolated Linux sandbox shell, can't run Windows binaries). Treat the first real build as a first real test, not a known-working thing; see "If the build or the .exe fails" in the "Building a Windows .exe" section.
- Only the 7 major-scale modes are modeled. No harmonic minor, melodic
  minor, or their modes (e.g. no Phrygian Dominant, no Lydian Dominant).
- Voicing search is limited to 4 strings (A–D–G–B); low E and high E never
  appear in a generated voicing.
- No automated test suite (pytest/JS runner) — see "Testing this project".
- No `.gitignore` at the repo root visible outside `.idea/` — `.venv/` should
  stay untracked if this is ever put under git.
- Piano view is a fixed 2-octave keyboard (no scrolling/zooming to more
  octaves) and, in chord view, shows every occurrence of a chord tone lit up
  identically rather than picking one voicing/inversion the way the guitar
  tab's AI path does — there's no concept of "which octave/inversion is
  easiest to play" for piano yet, unlike the guitar side's whole
  ergonomic-voicing machinery.
- **Chord detection is read-only.** It doesn't feed into the 4-slot
  progression/voice-leading tool, and the progression tool is hardcoded to
  exactly 4 slots — a real song's detected chord sequence is almost always
  longer than that. Closing this loop would mean: (a) reworking the fixed
  4-slot UI (`initSlots()` in `app.js`) into a variable-length list, and
  (b) adding a way to select a consecutive stretch of the detected timeline
  and push it into that list. Skipped for this version by explicit choice
  (kept it to a simple read-only timeline first).
- **Chord detection is local-file-only, and template-matching, by explicit
  choice.** Two upgrades considered and deferred:
  - *Links (e.g. YouTube) as an input*, via `yt-dlp` + `ffmpeg` to fetch
    audio before running the same detector. Deferred because downloading
    audio from a site like YouTube can conflict with its ToS even for
    personal practice use, so it needs a deliberate decision, not a default.
  - *A trained model (madmom/BTC/Essentia)* instead of template matching,
    for real accuracy gains especially on jazz/extended harmony. Deferred
    because madmom is notoriously hard to install on Windows (MS C++ build
    tools, Cython, pinned old numpy) and Essentia has no real Windows
    distribution; template matching was chosen specifically because
    `pip install librosa` just works.
