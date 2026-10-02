#include "qtfbclient.h"

#include <QColor>
#include <QDebug>
#include <QQuickWindow>
#include <QSocketNotifier>
#include <QGuiApplication>

#include <QtGui/qpa/qwindowsysteminterface.h>

#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <algorithm>

#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/un.h>

namespace {

QtfbClient *g_instance = nullptr;

void checkAbi()
{
    using namespace qtfbwire;
    static_assert(sizeof(size_t) == 4, "qtfb ServerMessage shmSize is armhf size_t");
    static_assert(sizeof(ClientMessage) == 24, "qtfb ClientMessage must match KOReader ffi layout");
    static_assert(sizeof(ServerMessage) == 24, "qtfb ServerMessage must match KOReader ffi layout");
    static_assert(offsetof(ClientMessage, type) == 0, "qtfb type byte");
    static_assert(alignof(ClientMessage) == 4, "qtfb ClientMessage alignment");
    static_assert(offsetof(ClientMessage, init.framebufferKey) == 4, "init key offset");
    static_assert(offsetof(ClientMessage, update.x) == 8, "update x offset");
    static_assert(offsetof(ClientMessage, update.w) == 16, "update w offset");
    static_assert(offsetof(ServerMessage, userInput.x) == 12, "input x offset");
    static_assert(offsetof(ServerMessage, init.shmSize) == 8, "shmSize offset");
}

} // namespace

QtfbClient::QtfbClient(QObject *parent)
    : QObject(parent)
{
    checkAbi();
    g_instance = this;
}

QtfbClient::~QtfbClient()
{
    if (g_instance == this)
        g_instance = nullptr;
    if (m_sock >= 0) {
        qtfbwire::ClientMessage term{};
        term.type = qtfbwire::MESSAGE_TERMINATE;
        sendMessage(term);
        ::close(m_sock);
        m_sock = -1;
    }
    if (m_mem && m_mem != MAP_FAILED && m_shmSize)
        ::munmap(m_mem, m_shmSize);
    m_mem = nullptr;
}

QtfbClient *QtfbClient::instance()
{
    return g_instance;
}

bool QtfbClient::sendMessage(const qtfbwire::ClientMessage &message)
{
    if (m_sock < 0)
        return false;
    const ssize_t n = ::send(m_sock, &message, sizeof(message), MSG_NOSIGNAL);
    return n == static_cast<ssize_t>(sizeof(message));
}

bool QtfbClient::openClient()
{
    const char *keyEnv = std::getenv("QTFB_KEY");
    const int key = (keyEnv && *keyEnv) ? std::atoi(keyEnv) : qtfbwire::QTFB_DEFAULT_FRAMEBUFFER;

    m_sock = ::socket(AF_UNIX, SOCK_SEQPACKET, 0);
    if (m_sock < 0) {
        qWarning("zshelf qtfb: socket failed errno=%d", errno);
        return false;
    }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, "/tmp/qtfb.sock", sizeof(addr.sun_path) - 1);
    if (::connect(m_sock, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) != 0) {
        qWarning("zshelf qtfb: connect /tmp/qtfb.sock failed errno=%d", errno);
        ::close(m_sock);
        m_sock = -1;
        return false;
    }

    qtfbwire::ClientMessage init{};
    init.type = qtfbwire::MESSAGE_INITIALIZE;
    init.init.framebufferKey = key;
    init.init.framebufferType = qtfbwire::FBFMT_RM2FB;
    if (!sendMessage(init)) {
        qWarning("zshelf qtfb: init send failed errno=%d", errno);
        ::close(m_sock);
        m_sock = -1;
        return false;
    }

    qtfbwire::ServerMessage resp{};
    const ssize_t got = ::recv(m_sock, &resp, sizeof(resp), 0);
    if (got != static_cast<ssize_t>(sizeof(resp))) {
        qWarning("zshelf qtfb: init recv failed bytes=%zd errno=%d", got, errno);
        ::close(m_sock);
        m_sock = -1;
        return false;
    }

    m_shmKey = resp.init.shmKeyDefined;
    m_shmSize = resp.init.shmSize;
    char shmName[32];
    std::snprintf(shmName, sizeof(shmName), "/qtfb_%d", m_shmKey);
    const int shmFd = ::shm_open(shmName, O_RDWR, 0);
    if (shmFd < 0) {
        qWarning("zshelf qtfb: shm_open %s failed errno=%d", shmName, errno);
        ::close(m_sock);
        m_sock = -1;
        return false;
    }
    m_mem = ::mmap(nullptr, m_shmSize, PROT_READ | PROT_WRITE, MAP_SHARED, shmFd, 0);
    ::close(shmFd);
    if (m_mem == MAP_FAILED) {
        qWarning("zshelf qtfb: mmap failed errno=%d", errno);
        m_mem = nullptr;
        ::close(m_sock);
        m_sock = -1;
        return false;
    }

    qWarning("zshelf qtfb: connected key=%d shm=%s size=%u %dx%d",
             key, shmName, static_cast<unsigned>(m_shmSize),
             qtfbwire::RM2_WIDTH, qtfbwire::RM2_HEIGHT);

    m_notifier = new QSocketNotifier(m_sock, QSocketNotifier::Read, this);
    QObject::connect(m_notifier, &QSocketNotifier::activated, this,
                     [this](QSocketDescriptor, QSocketNotifier::Type) { onSocketActivated(); });
    return true;
}

void QtfbClient::setWindow(QQuickWindow *window)
{
    m_window = window;
}

void QtfbClient::noteRaster(const QImage &image, const QRegion &region)
{
    if (image.isNull())
        return;
    // Snapshot before flush returns. The backing store reuses this image.
    // Damage is the pixels that differ, not the flush hint. Qt Quick's first
    // expose flushes the whole 1404x1872 window, and a bounding box of that
    // hint would refresh the panel every frame.
    m_dirty += damageFrom(image, region);
}

void QtfbClient::schedulePresent()
{
    if (m_inPresent || m_presentQueued || m_sock < 0)
        return;
    m_presentQueued = true;
    QMetaObject::invokeMethod(this, [this]() { presentNow(); }, Qt::QueuedConnection);
}

void QtfbClient::bump()
{
    schedulePresent();
}

void QtfbClient::markGray()
{
    // Covers used to request GC16. That waveform flashes. UI mode (4) is the
    // fast partial KOReader uses for ordinary updates, including images.
}

void QtfbClient::flash()
{
    // Do not send MESSAGE_REQUEST_FULL_REFRESH. That message has no rectangle
    // and the server clears the whole panel with a full (GC16) waveform.
    // The next frameSwapped already carries the changed region as UPDATE_PARTIAL.
    schedulePresent();
}

void QtfbClient::onSocketActivated()
{
    while (m_sock >= 0) {
        qtfbwire::ServerMessage msg{};
        const ssize_t n = ::recv(m_sock, &msg, sizeof(msg), MSG_DONTWAIT);
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK)
                break;
            qWarning("zshelf qtfb: recv failed errno=%d", errno);
            break;
        }
        if (n == 0)
            break;
        if (n != static_cast<ssize_t>(sizeof(msg))) {
            qWarning("zshelf qtfb: short server message %zd want %zu", n, sizeof(msg));
            continue;
        }
        if (msg.type == qtfbwire::MESSAGE_USERINPUT)
            deliverInput(msg.userInput);
    }
}

void QtfbClient::deliverInput(const qtfbwire::UserInputContents &input)
{
    if (!m_window)
        return;
    const int kind = input.inputType & 0xF0;
    if (kind != 0x10 && kind != 0x20)
        return;

    QEvent::Type type = QEvent::MouseMove;
    Qt::MouseButtons buttons = Qt::LeftButton;
    Qt::MouseButton button = Qt::NoButton;
    if (input.inputType == qtfbwire::INPUT_TOUCH_PRESS || input.inputType == qtfbwire::INPUT_PEN_PRESS) {
        type = QEvent::MouseButtonPress;
        button = Qt::LeftButton;
        buttons = Qt::LeftButton;
    } else if (input.inputType == qtfbwire::INPUT_TOUCH_RELEASE || input.inputType == qtfbwire::INPUT_PEN_RELEASE) {
        type = QEvent::MouseButtonRelease;
        button = Qt::LeftButton;
        buttons = Qt::NoButton;
    }

    if (m_inputLogs < 8) {
        ++m_inputLogs;
        qWarning("zshelf qtfb input: type=0x%x x=%d y=%d dev=%d",
                 input.inputType, input.x, input.y, input.devId);
    }

    const QPointF pos(input.x, input.y);
    QWindowSystemInterface::handleMouseEvent(m_window, pos, pos, buttons, button, type);
}

QRegion QtfbClient::damageFrom(const QImage &image, const QRegion &hint)
{
    const int width = std::min(image.width(), qtfbwire::RM2_WIDTH);
    const int height = std::min(image.height(), qtfbwire::RM2_HEIGHT);
    if (width <= 0 || height <= 0)
        return {};

    if (m_rgb.size() != QSize(qtfbwire::RM2_WIDTH, qtfbwire::RM2_HEIGHT)
        || m_rgb.format() != QImage::Format_RGB16) {
        m_rgb = QImage(qtfbwire::RM2_WIDTH, qtfbwire::RM2_HEIGHT, QImage::Format_RGB16);
        m_rgb.fill(0xffff);
        m_rgbReady = false;
    }

    const QImage src = (image.format() == QImage::Format_RGB32 || image.format() == QImage::Format_ARGB32)
        ? image
        : image.convertToFormat(QImage::Format_RGB32);

    auto to565 = [](QRgb c) -> uint16_t {
        return static_cast<uint16_t>(((qRed(c) & 0xF8) << 8)
            | ((qGreen(c) & 0xFC) << 3)
            | (qBlue(c) >> 3));
    };

    // First painted frame has to fill shm, including white. After that, only
    // changed runs. An empty hint must not expand into a full-screen refresh
    // once the baseline exists.
    const bool first = !m_rgbReady;
    QRegion scan = hint.intersected(QRect(0, 0, width, height));
    if (first || scan.isEmpty()) {
        if (first)
            scan = QRect(0, 0, width, height);
        else
            return {};
    }

    QRegion changed;
    for (const QRect &rect : scan) {
        const QRect r = rect.intersected(QRect(0, 0, width, height));
        if (r.isEmpty())
            continue;
        for (int y = r.top(); y <= r.bottom(); ++y) {
            const auto *in = reinterpret_cast<const QRgb *>(src.constScanLine(y));
            auto *out = reinterpret_cast<uint16_t *>(m_rgb.scanLine(y));
            int run = -1;
            for (int x = r.left(); x <= r.right(); ++x) {
                const uint16_t px = to565(in[x]);
                const bool diff = !m_rgbReady || out[x] != px;
                if (diff)
                    out[x] = px;
                if (diff && run < 0)
                    run = x;
                if ((!diff || x == r.right()) && run >= 0) {
                    const int last = diff ? x : x - 1;
                    changed += QRect(run, y, last - run + 1, 1);
                    run = -1;
                }
            }
        }
    }
    m_rgbReady = true;
    if (first)
        return QRegion(QRect(0, 0, width, height));
    if (changed.rectCount() > 16)
        changed = QRegion(changed.boundingRect());
    return changed;
}

void QtfbClient::presentNow()
{
    m_presentQueued = false;
    if (m_inPresent || !m_mem || m_sock < 0 || m_rgb.isNull())
        return;
    m_inPresent = true;

    const QRegion region = m_dirty;
    m_dirty = QRegion();
    if (region.isEmpty()) {
        m_inPresent = false;
        return;
    }

    const int copyW = std::min(m_rgb.width(), qtfbwire::RM2_WIDTH);
    const int copyH = std::min(m_rgb.height(), qtfbwire::RM2_HEIGHT);
    const int dstStride = qtfbwire::RM2_WIDTH * 2;
    const size_t need = static_cast<size_t>(dstStride) * static_cast<size_t>(copyH);
    if (m_shmSize < need) {
        qWarning("zshelf qtfb: shm %u smaller than %dx%d rgb565",
                 static_cast<unsigned>(m_shmSize), copyW, copyH);
        m_inPresent = false;
        return;
    }

    // KOReader ffi/framebuffer_qtfb.lua refreshUIImp: REFRESH_MODE_UI, then
    // MESSAGE_UPDATE with UPDATE_PARTIAL and the damaged x,y,w,h. No
    // MESSAGE_REQUEST_FULL_REFRESH on this path (that is refreshFullImp).
    if (!m_refreshModeSent) {
        qtfbwire::ClientMessage mode{};
        mode.type = qtfbwire::MESSAGE_SET_REFRESH_MODE;
        mode.refreshMode = qtfbwire::REFRESH_MODE_UI;
        if (!sendMessage(mode))
            qWarning("zshelf qtfb: refresh mode send failed errno=%d", errno);
        else
            m_refreshModeSent = true;
    }

    auto *dst = static_cast<uint8_t *>(m_mem);
    bool logged = false;
    for (const QRect &raw : region) {
        const QRect bounds = raw.intersected(QRect(0, 0, copyW, copyH));
        if (bounds.isEmpty())
            continue;
        for (int y = bounds.top(); y <= bounds.bottom(); ++y) {
            std::memcpy(dst + static_cast<size_t>(y) * static_cast<size_t>(dstStride)
                            + static_cast<size_t>(bounds.left()) * 2,
                        reinterpret_cast<const uint8_t *>(m_rgb.constScanLine(y))
                            + static_cast<size_t>(bounds.left()) * 2,
                        static_cast<size_t>(bounds.width()) * 2);
        }

        qtfbwire::ClientMessage update{};
        update.type = qtfbwire::MESSAGE_UPDATE;
        update.update.type = qtfbwire::UPDATE_PARTIAL;
        update.update.x = bounds.x();
        update.update.y = bounds.y();
        update.update.w = bounds.width();
        update.update.h = bounds.height();
        if (!sendMessage(update)) {
            qWarning("zshelf qtfb update sent %dx%d at %d,%d shm=/qtfb_%d send failed errno=%d",
                     bounds.width(), bounds.height(), bounds.x(), bounds.y(), m_shmKey, errno);
        } else if (!logged) {
            logged = true;
            qWarning("zshelf qtfb: partial UI %dx%d at %d,%d rects=%d shm=/qtfb_%d",
                     bounds.width(), bounds.height(), bounds.x(), bounds.y(),
                     region.rectCount(), m_shmKey);
        }
    }

    m_inPresent = false;
    if (!m_dirty.isEmpty())
        schedulePresent();
}
