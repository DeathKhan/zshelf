#!/bin/bash
# Build zshelf for the reMarkable device using Toltec Qt Docker image, then deploy.
# Run this on a host that has Docker or Podman (not on the device).
# Requires: docker or podman, network access to pull ghcr.io/toltec-dev/qt:v3.3
# WARNING: after building, this script SCPs onto the tablet. Compile only with ./scripts/docker-build.sh
# v3.3 is Qt 5.15 for OS 3.3.x. :latest / :v4.0 are Qt 6.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEVICE_IP="${DEVICE_IP:-192.168.0.3}"

if command -v docker &>/dev/null; then
    RUNNER=docker
elif command -v podman &>/dev/null; then
    RUNNER=podman
else
    echo "Neither docker nor podman found. Install Docker (or Podman) to build for the device."
    echo "See: https://github.com/toltec-dev/toolchain"
    exit 1
fi

echo "Using $RUNNER to build for reMarkable (ARM)..."
"$RUNNER" run --rm --platform linux/amd64 -v "$ROOT:/src" -w /src ghcr.io/toltec-dev/qt:v3.3 bash -lc 'export PATH="/opt/x-tools/arm-remarkable-linux-gnueabihf/bin:$PATH"; qmake zshelf.pro && make -j$(nproc)'
echo "Build OK: $ROOT/zshelf"

echo "Deploying to $DEVICE_IP..."
scp "$ROOT/zshelf" root@"$DEVICE_IP":/opt/lib/zshelf/
scp "$ROOT/qml/"*.qml root@"$DEVICE_IP":/opt/lib/zshelf/qml/
# Backend .js
for f in "$ROOT/backend/"*.js; do
    [ -f "$f" ] && scp "$f" root@"$DEVICE_IP":/opt/lib/zshelf/backend/
done
ssh root@"$DEVICE_IP" "killall zshelf 2>/dev/null; true"
echo "Deployed. Start zshelf on the device from the launcher or: ssh root@$DEVICE_IP 'cd /opt/lib/zshelf && ./zshelf'"
