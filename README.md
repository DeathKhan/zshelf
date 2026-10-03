# zshelf

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/jamesfo)

A Z-Library client for the reMarkable 2. Search from the tablet, open a book, and download it into your books folder. Read it in KOReader.

Sign in with the Sign in button. The password is not saved. The session is written to `config.json` on the device, and that file stays out of git. Copy `config.example.json` to `config.json` once before the first run. That copy is the site address and the download folder, not a login.

`scripts/zshelf-qtfb.sh` starts it on the panel. The binary is not in this repository.

Noto Sans and Noto Sans CJK SC are included under the SIL Open Font License.
