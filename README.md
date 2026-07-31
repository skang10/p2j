# Daybook

Daybook is a small local check-in app for tracking a few goals and whether you showed
up for them each day.

The repository is named `p2j`, short for "P to J". The idea comes from the MBTI
Perceiving/Judging shorthand: taking a more spontaneous, feel-your-way-through-work style
and making planning feel a little more structured, visible, and fun.

## Project shape

- Desktop shell: Tauri 2
- Backend: Rust
- Frontend: one hand-written HTML file at `src/index.html`
- Package name: `checkin`
- App name: `Daybook`

There is no npm install, bundler, or frontend build step.

## Requirements

- Rust 1.77 or newer
- Tauri CLI 2
- macOS with Xcode command line tools for the tested build path

The code is not intentionally macOS-only, but this project has only been built and run
on macOS so far.

```bash
xcode-select --install
cargo install tauri-cli --version "^2"
```

## Build

```bash
git clone https://github.com/skang10/p2j
cd p2j/src-tauri
cargo tauri build
```

The macOS app bundle is written to:

```text
src-tauri/target/release/bundle/macos/Daybook.app
```

A `.dmg` is generated in the same bundle output area.

## Test

Frontend logic is covered by a lightweight Node harness that loads the script from
`src/index.html`.

```bash
node tests/test.js
```

## Data

Daybook stores data in one local JSON file and makes no network requests.

```text
~/Library/Application Support/com.checkin.app/checkin.json
```

The folder still uses `com.checkin.app` because that is the Tauri bundle identifier.
Changing it would make the app look in a new data directory and leave existing logs
behind.

The file is plain indented JSON. There is currently no export button, so back it up with
normal file tools such as `cp`.
