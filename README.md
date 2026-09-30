# zshelf (recovered Qt tree)

Modified Qt zshelf for a reMarkable 2 on firmware 3.3.x (armv7l, kernel 5.4.70, Toltec/rm2fb). Z-Library calls target z-lib.fm. This is not the Rust rewrite.

## Build (one command)

From this directory, on a machine with Docker (OrbStack or Docker Desktop). The SDK image is linux/amd64; Apple Silicon runs it under emulation.

```bash
./scripts/docker-build.sh
```

That builds a local image `zshelf-rm2-qt` from `ghcr.io/toltec-dev/qt:v3.3` (Qt 5.15.1 + libqsgepaper) and compiles `./zshelf`. Do not use `ghcr.io/toltec-dev/qt:latest` or `:v4.0` for this firmware; those are Qt 6.

The image does not deploy anything. `scripts/build-for-device-and-deploy.sh` still copies files to a tablet; do not run it unless you mean to.

The Node backend under `backend/` is plain JavaScript (cheerio, node-fetch, uuid). It is not cross-compiled. The tablet's own node runs it.

## Fonts

UI and book text use **Noto Sans** (Latin including Latin Extended, Cyrillic, Greek). Missing glyphs fall through to **Noto Sans CJK SC** (Han, hiragana/katakana, Hangul) via `QFont::insertSubstitution`. Weights shipped: Regular, Medium, Bold, Light. Both families are SIL OFL; see `fonts/OFL-NotoSans.txt` and `fonts/LICENSE-NotoSansCJKsc.txt`. Maison Neue is not included.

Default site host is https://z-lib.sk (r/zlibrary access wiki, September 2026). Sign in from the on-device screen; the password is not stored, only the session cookie in config.json.
