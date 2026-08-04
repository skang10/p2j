# P2J Daybook

![P to J concept illustration: Prospecting ideas becoming Judging check-ins through Daybook](docs/p2j-concept.png)

P2J Daybook is a local check-in app for tracking a few goals and whether you showed
up for them each day.

`p2j`, short for "P to J". The idea comes from the MBTI
Perceiving/Judging shorthand: taking a more spontaneous, feel-your-way-through-work style to a more
structured, check-in style.

## Download

| Version | Platform | Architecture | Download |
| --- | --- | --- | --- |
| v0.2.0 | macOS | Apple Silicon (arm64) | [DMG installer](https://github.com/skang10/p2j/releases/download/v0.2.0/Daybook_0.2.0_aarch64.dmg) |

This build is not notarized. If macOS blocks it the first time, right-click Daybook and
choose **Open**.

## App Preview

### Today

![P2J Daybook Today view](docs/daybook-today.png)

### Stats

![P2J Daybook monthly Stats view](docs/daybook-stats.png)

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
git clone https://github.com/skang10/p2j
cd p2j/src-tauri
cargo tauri build
```

That leaves you in `src-tauri`. The app bundle and the installer are written below it:

```text
target/release/bundle/macos/Daybook.app
target/release/bundle/dmg/Daybook_<version>_aarch64.dmg
```

The `.dmg` is named for the architecture it was built on.

### Test

Frontend logic is covered by a lightweight Node harness that loads `src/app.js`
in a minimal DOM environment. Run it from the repository root:

```bash
cd ..
node tests/test.js
```

### Local data

Daybook stores data in one local JSON file and makes no network requests.

```text
~/Library/Application Support/com.skang10.daybook/checkin.json
```

The folder name is the Tauri bundle identifier, from `src-tauri/tauri.conf.json`. Change
it and the app looks in a new, empty directory — move the file across at the same time,
or the old one is orphaned.

The file is plain indented JSON. There is currently no export button, so back it up with
normal file tools such as `cp`.
