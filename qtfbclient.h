#ifndef QTFBCLIENT_H
#define QTFBCLIENT_H

#include <QObject>
#include <QImage>
#include <QRegion>
#include <QPointer>
#include <QRect>
#include <cstdint>
#include <cstddef>

class QQuickWindow;
class QSocketNotifier;
class QWindow;

// Wire format from KOReader-base ffi-cdecl/include/qtfb.h, which is adapted
// from asivery/rm-appload src/qtfb/common.h. Message numbers match
// koreader-base ffi/qtfb.lua. The reMarkable 2 userspace is armhf, so
// size_t is 4 bytes. Do not pack these structs: the uint8_t type is followed
// by 3 bytes of ABI padding, and both messages are 24 bytes.
// Init / update / shm map follow ffi/framebuffer_qtfb.lua.
// Input numbers follow ffi/input_qtfb.lua (INPUT_TOUCH_* / INPUT_PEN_*).
// Those x,y values are already screen pixels. KOReader converts them back
// to raw device units; this client must not.

namespace qtfbwire {

using FBKey = int;

constexpr int MESSAGE_INITIALIZE = 0;
constexpr int MESSAGE_UPDATE = 1;
constexpr int MESSAGE_CUSTOM_INITIALIZE = 2;
constexpr int MESSAGE_TERMINATE = 3;
constexpr int MESSAGE_USERINPUT = 4;
constexpr int MESSAGE_SET_REFRESH_MODE = 5;
constexpr int MESSAGE_REQUEST_FULL_REFRESH = 6;
constexpr int MESSAGE_DEVICE_STATE_CHANGED = 7;
constexpr int MESSAGE_DEVICE_STATE_INIT = 8;

constexpr int FBFMT_RM2FB = 0;
constexpr int UPDATE_PARTIAL = 1;
constexpr int REFRESH_MODE_UI = 4;

constexpr int INPUT_TOUCH_PRESS = 0x10;
constexpr int INPUT_TOUCH_RELEASE = 0x11;
constexpr int INPUT_TOUCH_UPDATE = 0x12;
constexpr int INPUT_PEN_PRESS = 0x20;
constexpr int INPUT_PEN_RELEASE = 0x21;
constexpr int INPUT_PEN_UPDATE = 0x22;

constexpr int QTFB_DEFAULT_FRAMEBUFFER = 245209899;
constexpr int RM2_WIDTH = 1404;
constexpr int RM2_HEIGHT = 1872;

struct InitMessageContents {
    FBKey framebufferKey;
    uint8_t framebufferType;
};

struct CustomInitMessageContents {
    FBKey framebufferKey;
    uint8_t framebufferType;
    uint16_t width;
    uint16_t height;
};

struct UpdateRegionMessageContents {
    int type;
    int x, y, w, h;
};

struct ClientMessage {
    uint8_t type;
    union {
        InitMessageContents init;
        UpdateRegionMessageContents update;
        CustomInitMessageContents customInit;
        int refreshMode;
    };
};

struct InitMessageResponseContents {
    int shmKeyDefined;
    size_t shmSize;
};

struct UserInputContents {
    int inputType;
    int devId;
    int x, y, d;
};

struct DeviceStateChangedContents {
    int reason;
    union {
        struct {
            int rotation;
        } rotation;
    };
};

struct ServerMessage {
    uint8_t type;
    union {
        InitMessageResponseContents init;
        UserInputContents userInput;
        DeviceStateChangedContents deviceStateChanged;
    };
};

} // namespace qtfbwire

class QtfbClient : public QObject
{
    Q_OBJECT
public:
    explicit QtfbClient(QObject *parent = nullptr);
    ~QtfbClient() override;

    static QtfbClient *instance();

    bool openClient();
    void setWindow(QQuickWindow *window);
    void noteRaster(const QImage &image, const QRegion &region);
    void schedulePresent();

    Q_INVOKABLE void bump();
    Q_INVOKABLE void flash();
    Q_INVOKABLE void markGray();

private:
    void onSocketActivated();
    void deliverInput(const qtfbwire::UserInputContents &input);
    void presentNow();
    bool sendMessage(const qtfbwire::ClientMessage &message);
    // Pixel-diff hint against the last RGB565 frame. Returns only the
    // rectangles that actually changed. Empty when nothing changed.
    QRegion damageFrom(const QImage &image, const QRegion &hint);

    int m_sock = -1;
    void *m_mem = nullptr;
    size_t m_shmSize = 0;
    int m_shmKey = -1;
    bool m_refreshModeSent = false;
    bool m_rgbReady = false;
    bool m_presentQueued = false;
    bool m_inPresent = false;
    int m_inputLogs = 0;
    QSocketNotifier *m_notifier = nullptr;
    QPointer<QQuickWindow> m_window;
    QImage m_rgb; // Format_RGB16, full panel, last pixels copied toward shm
    QRegion m_dirty;
};

#endif
