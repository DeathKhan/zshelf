# zshelf

Qt 6 qtfb client for a reMarkable 2. The binary talks to the panel itself (`QT_QPA_PLATFORM=qtfb`, see `qtfbclient.cpp` and `scripts/zshelf-qtfb.sh`). It does not use the old Qt 5 `libqsgepaper` shim, and it does not preload `qtfb-shim.so`.


If this is useful, [Ko-fi](https://ko-fi.com/jamesfo).

`scripts/docker-build.sh` and `scripts/build-for-device-and-deploy.sh` still build the old way: Toltec `ghcr.io/toltec-dev/qt:v3.3` (Qt 5.15.1). Do not use those for this tree. `build-for-device-and-deploy.sh` also copies files onto a tablet.

## This build directory

`build-qt6/` is local and gitignored. Its generated Makefile records how that tree was configured:

- qmake 3.1, Qt 6.10.3
- `qmake -o Makefile ../zshelf.pro` from `/src/.sdk/rm2/sysroots/aarch64-codexsdk-linux/usr/bin/qmake`
- `arm-remarkable-linux-gnueabi-g++` with sysroot `.sdk/rm2/sysroots/cortexa7hf-neon-remarkable-linux-gnueabi`

No script in this repo creates `.sdk` or runs that qmake. `.sdk/` is gitignored. Where that SDK came from is not written down here.

## Run on device

`scripts/zshelf-qtfb.sh` unsets `QMLSCENE_DEVICE`, strips a `qtfb-shim.so` preload if one is set, and starts `./zshelf` with `QT_QPA_PLATFORM=qtfb`. The binary is not in git.

## Sign-in

Copy `config.example.json` to `config.json`. The password is not stored. After sign-in, the session cookie is written only to the local `config.json`, which is gitignored.

Z-Library calls use the host in that file. The Node backend under `backend/` is plain JavaScript (cheerio, node-fetch, uuid). It is not cross-compiled.

## Fonts

UI text uses Noto Sans, with Noto Sans CJK SC as a fallback for Han, kana, and Hangul (`QFont::insertSubstitution`). Weights shipped: Regular, Medium, Bold, Light. Both families are SIL OFL. See `fonts/OFL-NotoSans.txt` and `fonts/LICENSE-NotoSansCJKsc.txt`.
