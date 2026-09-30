#!/usr/bin/env bash
# Cross-compile zshelf for reMarkable 2 (armv7hf). Does not deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
docker build --platform linux/amd64 -t zshelf-rm2-qt .
docker run --rm --platform linux/amd64 -v "$ROOT:/src" -w /src zshelf-rm2-qt
