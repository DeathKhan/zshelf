#!/bin/sh
# Run this script ON the reMarkable device (e.g. via ssh) to attempt a native build.
# Requires: qmake, Qt5 Quick dev, gcc/g++, make. Toltec/Entware do not provide
# qmake or Qt build tools, so a native build usually fails with "qmake: not found".
# If that happens, build for the device from your host using:
#   ./scripts/build-for-device-and-deploy.sh

set -e
cd "$(dirname "$0")/.."
PATH="/opt/bin:$PATH"

if ! command -v qmake >/dev/null 2>&1; then
    echo "qmake not found. The reMarkable opkg repos do not include Qt build tools (qmake, moc, rcc)."
    echo "To get a zshelf binary for this device, build from a host that has Docker:"
    echo "  ./scripts/build-for-device-and-deploy.sh"
    exit 1
fi

# Optional: use rm2 lib name if present (device has libqsgepaper-rm2.so)
if [ -f /usr/lib/libqsgepaper-rm2.so ] && [ ! -f /usr/lib/libqsgepaper.so ]; then
    export LIBS_EXTRA="-lqsgepaper-rm2"
fi

qmake zshelf.pro
make -j2
echo "Build OK: $(pwd)/zshelf"
