#!/bin/sh
# Native Qt 6 qtfb client. xochitl keeps the panel.
# Do not LD_PRELOAD qtfb-shim.so: the shim only redirects /dev/fb0, and this
# OS takes the screen lock through SWTCON. Do not set QMLSCENE_DEVICE=epaper.
LD_PRELOAD=$(printf '%s' "${LD_PRELOAD:-}" | sed 's#/home/root/shims/qtfb-shim.so##g; s/::*/:/g; s/^://; s/:$//')
export LD_PRELOAD
unset QMLSCENE_DEVICE
unset QT_QUICK_BACKEND
export QT_QPA_PLATFORM=qtfb
cd "$(dirname "$0")"
exec ./zshelf "$@"
