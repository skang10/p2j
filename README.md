# Polaris

![A small blue star climbing a dotted trail toward the gold North Star](docs/daybook-concept.gif)

Polaris is a local check-in app for tracking a few goals and whether you showed
up for them each day.

Polaris is the north star: the fixed point you steer by. The app holds up to seven
goals — few enough to stay in view — and records whether you showed up for each one,
day by day. The goals are the star; the daily check-ins are the climb toward it.

## Download

<!-- x-release-please-start-version -->
| Version | Platform | Architecture | Download |
| --- | --- | --- | --- |
| v0.4.0 | macOS | Apple Silicon (arm64) | [DMG installer](https://github.com/skang10/polaris/releases/latest/download/Polaris_aarch64.dmg) |
<!-- x-release-please-end -->

This build is not notarized. If macOS blocks it the first time, right-click **Polaris**
and choose **Open**.

Upgrading from a version named Daybook? Your check-in records carry over untouched —
they are stored against the app's identifier, which has not changed. Delete the old
`Daybook.app` once `Polaris.app` is in place.

## App Preview

### Daily check-ins

Tap a sub-goal to record it. Counters, the monthly progress bar, and the
consistency heatmap update as you go.

![Recording check-ins on the Today view](docs/daybook-checkin.gif)

### Notes on the way to done

List goals carry a markdown note per item. Write as you learn, then mark the
item complete — it moves to Done and keeps the note.

![Writing a markdown note and completing a list item](docs/daybook-notes.gif)

### Stats

The Stats tab reviews the month: records per goal, active days, a category
mix, and everything completed — each with its note a click away.

![Browsing the monthly Stats review](docs/daybook-stats.gif)

### Every day is kept

Any past day opens from the calendar as a read-only snapshot, including the
notes exactly as they were completed that day.

![Opening a past day snapshot and its note](docs/daybook-history.gif)

## Development

### Requirements

- Rust 1.77 or newer
- Tauri CLI 2
- macOS with Xcode command line tools for the tested build path

```bash
xcode-select --install
cargo install tauri-cli --version "^2"
```

### Build

```bash
git clone https://github.com/skang10/polaris
cd polaris/src-tauri
cargo tauri build
```

That leaves you in `src-tauri`. The app bundle and the installer are written below it:

```text
target/release/bundle/macos/Polaris.app
target/release/bundle/dmg/Polaris_<version>_aarch64.dmg
```

The `.dmg` is named for the architecture it was built on.

The bundle identifier stays `com.skang10.daybook` even though the app is now Polaris.
macOS derives the app's data directory from that identifier, so changing it would
strand the check-in records of every existing install. Renaming the identifier needs a
migration; renaming the app did not.

### Icons

All icons derive from `docs/icon.png`. To rebuild them after changing that file:

```bash
scripts/build-icns.sh
```

Do not run `cargo tauri icon` on its own. The `.icns` is assembled by hand so the
16pt and 32pt slices can carry simplified art — at those sizes the dotted trail
resolves to noise, so they show an enlarged star instead. `cargo tauri icon`
overwrites the `.icns` with single-art slices and that detail is lost silently.
`scripts/build-icns.sh` runs it in the right order and rebuilds the `.icns` after.

### Test

Frontend logic is covered by a lightweight Node harness that loads `src/app.js`
in a minimal DOM environment. Run it from the repository root:

```bash
cd ..
node tests/test.js
```

### Local data

Polaris stores data in one local JSON file and makes no network requests.

```text
~/Library/Application Support/com.skang10.daybook/checkin.json
```

The folder name is the Tauri bundle identifier, from `src-tauri/tauri.conf.json`. Change
it and the app looks in a new, empty directory — move the file across at the same time,
or the old one is orphaned.

The file is plain indented JSON. There is currently no export button, so back it up with
normal file tools such as `cp`.
