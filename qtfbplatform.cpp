#include "qtfbplatform.h"

#include "qtfbclient.h"

#include <QtGui/private/qgenericunixeventdispatcher_p.h>
#include <qpa/qwindowsysteminterface.h>

#include <QPainter>

QtfbPlatformScreen::QtfbPlatformScreen()
    : m_geometry(0, 0, qtfbwire::RM2_WIDTH, qtfbwire::RM2_HEIGHT)
    , m_physical(157, 209)
{
}

QtfbPlatformWindow::QtfbPlatformWindow(QWindow *window)
    : QPlatformWindow(window)
{
    if (window->geometry().isEmpty())
        QPlatformWindow::setGeometry(QRect(0, 0, qtfbwire::RM2_WIDTH, qtfbwire::RM2_HEIGHT));
}

void QtfbPlatformWindow::setVisible(bool visible)
{
    m_exposed = visible;
    QPlatformWindow::setVisible(visible);
    if (!visible)
        return;
    QWindowSystemInterface::handleExposeEvent(window(), geometry());
    QWindowSystemInterface::handleFocusWindowChanged(window());
}

QtfbPlatformBackingStore::QtfbPlatformBackingStore(QWindow *window)
    : QPlatformBackingStore(window)
{
}

QPaintDevice *QtfbPlatformBackingStore::paintDevice()
{
    return &m_image;
}

void QtfbPlatformBackingStore::flush(QWindow *window, const QRegion &region, const QPoint &offset)
{
    Q_UNUSED(offset);
    if (m_image.isNull())
        return;
    // Qt Quick's software renderer paints through this backing store.
    // Pixels are copied to the qtfb shm only from QQuickWindow::frameSwapped,
    // not from a timer and not from this flush.
    if (QtfbClient *client = QtfbClient::instance())
        client->noteRaster(m_image, region);
    Q_UNUSED(window);
}

void QtfbPlatformBackingStore::resize(const QSize &size, const QRegion &staticContents)
{
    Q_UNUSED(staticContents);
    if (m_image.size() == size && m_image.format() == QImage::Format_RGB32)
        return;
    m_image = QImage(size, QImage::Format_RGB32);
    m_image.fill(Qt::white);
}

QtfbIntegration::QtfbIntegration()
{
    m_screen = new QtfbPlatformScreen();
    QWindowSystemInterface::handleScreenAdded(m_screen, true);
}

QtfbIntegration::~QtfbIntegration()
{
    QWindowSystemInterface::handleScreenRemoved(m_screen);
    delete m_fontDatabase;
}

bool QtfbIntegration::hasCapability(Capability cap) const
{
    switch (cap) {
    case ThreadedPixmaps:
    case MultipleWindows:
        return true;
    case OpenGL:
    case ThreadedOpenGL:
    case RasterGLSurface:
    case OpenGLOnRasterSurface:
    case RhiBasedRendering:
        return false;
    default:
        return QPlatformIntegration::hasCapability(cap);
    }
}

QPlatformFontDatabase *QtfbIntegration::fontDatabase() const
{
    if (!m_fontDatabase)
        m_fontDatabase = new QFreeTypeFontDatabase;
    return m_fontDatabase;
}

QPlatformWindow *QtfbIntegration::createPlatformWindow(QWindow *window) const
{
    return new QtfbPlatformWindow(window);
}

QPlatformBackingStore *QtfbIntegration::createPlatformBackingStore(QWindow *window) const
{
    return new QtfbPlatformBackingStore(window);
}

QAbstractEventDispatcher *QtfbIntegration::createEventDispatcher() const
{
    return createUnixEventDispatcher();
}

QPlatformIntegration *QtfbIntegrationPlugin::create(const QString &key, const QStringList &paramList)
{
    Q_UNUSED(paramList);
    if (key.compare(QLatin1String("qtfb"), Qt::CaseInsensitive) != 0)
        return nullptr;
    return new QtfbIntegration;
}
