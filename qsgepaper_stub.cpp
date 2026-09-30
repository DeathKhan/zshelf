/* Stub for qt_static_plugin_QsgEpaperPlugin when building on host without reMarkable SDK.
 * Provides the symbol so the host build links. The resulting binary is for host only.
 * For a reMarkable device binary, build with toltec Docker: see /tmp/remarkable-dev/README.md
 */
#include <QtCore>
void qt_static_plugin_QsgEpaperPlugin() {
    /* No-op when building without real libqsgepaper (e.g. on x86_64 host). */
}
