# zshelf

<p align="center"><a href="https://ko-fi.com/jamesfo"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi"></a></p>

Z-Library client for the reMarkable 2. The screen is Qt 6. Search and downloads are the Node program in `backend/`.

## Sign in

There is no account in this repo. `config.example.json` has an empty `cookie` and `https://z-lib.sk`. If `config.json` is missing, the backend copies that file on startup. Sign in on the device. The password is not written. The session goes into `config.json`, and that file is gitignored.

## Build

`.sdk/` is not in git. The environment script in this SDK uses `/src/.sdk`, so the repo has to be checked out at `/src`.

```
cd /src
unset LD_LIBRARY_PATH
. .sdk/rm2/environment-setup-cortexa7hf-neon-remarkable-linux-gnueabi
mkdir -p build-qt6 && cd build-qt6
qmake -o Makefile ../zshelf.pro
make
```

`qmake` here is Qt 6.10.3. The compiler is `arm-remarkable-linux-gnueabi-g++`. The binary is `build-qt6/zshelf`. Fonts are compiled into it.

`scripts/docker-build.sh` and `scripts/build-for-device-and-deploy.sh` build the old Qt 5 client. Do not use them.

## Install

The app runs `/opt/bin/node` on `<directory of zshelf>/backend/server.js`.

```
cd /src/backend && npm install
```

That installs `cheerio`, `node-fetch`, and `uuid`. Copy these onto the tablet:

- `build-qt6/zshelf`
- `scripts/zshelf-qtfb.sh` in the same directory as `zshelf`
- `backend/`, including `node_modules`

Put a Node binary at `/opt/bin/node`. Start it with `zshelf-qtfb.sh`. That script sets `QT_QPA_PLATFORM=qtfb` and does not preload `qtfb-shim.so`.

Downloaded books go to `additionalBookLocation` in the config. The example uses `/home/root/Books/`.
