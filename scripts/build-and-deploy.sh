#!/bin/bash
# Rebuild zshelf and deploy to reMarkable (optional: set DEVICE_IP and run with --deploy).
# Requires Qt5 with QtQuick (qmake + make). On reMarkable/toltec you may build on-device
# or use a cross-toolchain; adjust the build commands as needed.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# Build: use qmake from Qt5 (e.g. /usr/lib/qt5/bin/qmake or whatever finds QT: quick)
if command -v qmake-qt5 &>/dev/null; then
    QMAKE=qmake-qt5
elif [ -n "$QT5_DIR" ] && [ -x "$QT5_DIR/bin/qmake" ]; then
    QMAKE="$QT5_DIR/bin/qmake"
else
    QMAKE=qmake
fi

echo "Using: $QMAKE"
"$QMAKE" zshelf.pro
make -j"$(nproc 2>/dev/null || echo 2)"

echo "Build OK: $ROOT/zshelf"

# Optional deploy
DEVICE_IP="${DEVICE_IP:-192.168.0.3}"
if [ "${1:-}" = "--deploy" ]; then
    echo "Deploying to $DEVICE_IP..."
    scp "$ROOT/zshelf" root@"$DEVICE_IP":/opt/lib/zshelf/
    scp "$ROOT/qml/"*.qml root@"$DEVICE_IP":/opt/lib/zshelf/qml/
    scp "$ROOT/backend/"*.js root@"$DEVICE_IP":/opt/lib/zshelf/backend/
    ssh root@"$DEVICE_IP" "killall zshelf 2>/dev/null; sleep 1; cd /opt/lib/zshelf && ./zshelf &"
    echo "Deployed and restarted."
fi
