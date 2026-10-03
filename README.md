# zshelf

zshelf lets you search Z-Library on a reMarkable 2 and save the book on the tablet. Open a title, pick the file, and it lands in your books folder so KOReader can open it.

Sign in from the Sign in button with your Z-Library account. The password is not saved. After you sign in, the session is stored in `config.json` on the device. That file is not part of this repository, and copying it is not how you sign in.

Copy `config.example.json` to `config.json` once, before the first run. It holds the site address and the folder where downloads are saved.

If this is useful, [Ko-fi](https://ko-fi.com/jamesfo).

## On the tablet

`scripts/zshelf-qtfb.sh` starts zshelf on the panel. The built program is not in this repository.

The screen uses Noto Sans, and Noto Sans CJK SC for Chinese, Japanese, and Korean. Both are under the SIL Open Font License.
