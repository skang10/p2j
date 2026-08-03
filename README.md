# P2J Daybook

![P to J concept illustration: Prospecting ideas becoming Judging check-ins through Daybook](docs/p2j-concept.png)

P2J Daybook is a local check-in app for tracking a few goals and whether you showed
up for them each day.

`p2j`, short for "P to J". The idea comes from the MBTI
Perceiving/Judging shorthand: taking a more spontaneous, feel-your-way-through-work style to a more
structured, check-in style.

## App Preview

### Today

![P2J Daybook Today view](docs/daybook-today.png)

### Stats

![P2J Daybook monthly Stats view](docs/daybook-stats.png)

## Requirements

- Rust 1.77 or newer
- Tauri CLI 2
- macOS with Xcode command line tools for the tested build path

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

That leaves you in `src-tauri`. The app bundle and the installer are written below it:

```text
target/release/bundle/macos/Daybook.app
target/release/bundle/dmg/Daybook_0.1.0_aarch64.dmg
```

The `.dmg` is named for the architecture it was built on.

## Test

Frontend logic is covered by a lightweight Node harness that loads the script from
`src/index.html`. Run it from the repository root:

```bash
cd ..
node tests/test.js
```

## Data

Daybook stores data in one local JSON file and makes no network requests.

```text
~/Library/Application Support/com.skang10.daybook/checkin.json
```

The folder name is the Tauri bundle identifier, from `src-tauri/tauri.conf.json`. Change
it and the app looks in a new, empty directory — move the file across at the same time,
or the old one is orphaned.

The file is plain indented JSON. There is currently no export button, so back it up with
normal file tools such as `cp`.
