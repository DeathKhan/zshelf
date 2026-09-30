# armv7hf cross SDK for reMarkable 2 on Codex / OS 3.3.x (kernel 5.4.70, Qt 5.15.1).
# Pin Toltec v3.3. :latest and :v4.0 are Qt 6 and match OS >= 3.18 only.
# The published image is linux/amd64 (x86_64 host tools, armhf sysroot).
FROM ghcr.io/toltec-dev/qt:v3.3

# qmake's device spec uses CROSS_COMPILE=arm-linux-gnueabihf-, which is not on PATH.
ENV PATH="/opt/x-tools/arm-remarkable-linux-gnueabihf/bin:${PATH}"

WORKDIR /src

# Not a login shell: bash -l resets PATH from /etc/profile and drops the cross compiler.

# Source is bind-mounted at /src. Backend JS is not compiled; the tablet runs it.
CMD bash -c 'qmake zshelf.pro && make -j$(nproc)'
