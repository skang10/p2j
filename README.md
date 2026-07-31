# p2j

**P to J.** I'm a P — I work by feel, and plans mostly happen to me. This is the app I
built to fix that at work: a few goals, and an honest record of whether I actually
showed up to them.

The app is called **Daybook**. `p2j` is what the repo is called, and what it's for.

## Install

macOS only so far. Nothing in the code is macOS-specific and Tauri builds for Linux and
Windows too, but it has only ever been built and run here.

Needs Rust 1.77+ and the Xcode command line tools.

```bash
xcode-select --install
cargo install tauri-cli --version "^2"

git clone https://github.com/skang10/p2j
cd p2j/src-tauri
cargo tauri build
```

Drag `src-tauri/target/release/bundle/macos/Daybook.app` to `/Applications`. There's a
`.dmg` next to it if you'd rather.

No npm, no bundler, no build step for the frontend — it's one hand-written
`src/index.html`.

## Where the data lives

One JSON file, on your machine. The app makes no network requests of any kind.

```
~/Library/Application Support/com.checkin.app/checkin.json
```

The folder says `com.checkin.app` rather than anything with "daybook" in it. That's the
bundle identifier, set before the app was renamed and deliberately left alone — it's
what the app builds its data path from, so changing it would point Daybook at an empty
directory and orphan the file.

The file is plain indented JSON, readable with `cat` and loadable with pandas. There's no
export button, so back it up with `cp`.
