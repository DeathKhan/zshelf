#ifndef QTFBPLATFORM_H
#define QTFBPLATFORM_H

#define QT_STATICPLUGIN 1

#include <qpa/qplatformintegration.h>
#include <qpa/qplatformscreen.h>
#include <qpa/qplatformwindow.h>
#include <qpa/qplatformbackingstore.h>
#include <qpa/qplatformintegrationplugin.h>
#include <QtGui/private/qfreetypefontdatabase_p.h>

class QtfbPlatformScreen : public QPlatformScreen
{
public:
    QtfbPlatformScreen();

    QRect geometry() const override { return m_geometry; }
    int depth() const override { return 32; }
    QImage::Format format() const override { return QImage::Format_RGB32; }
    QSizeF physicalSize() const override { return m_physical; }

private:
    QRect m_geometry;
    QSizeF m_physical;
};

class QtfbPlatformWindow : public QPlatformWindow
{
public:
    explicit QtfbPlatformWindow(QWindow *window);
    void setVisible(bool visible) override;
    bool isExposed() const override { return m_exposed; }

private:
    bool m_exposed = false;
};

class QtfbPlatformBackingStore : public QPlatformBackingStore
{
public:
    explicit QtfbPlatformBackingStore(QWindow *window);
    QPaintDevice *paintDevice() override;
    void flush(QWindow *window, const QRegion &region, const QPoint &offset) override;
    void resize(const QSize &size, const QRegion &staticContents) override;

private:
    QImage m_image;
};

class QtfbIntegration : public QPlatformIntegration
{
public:
    QtfbIntegration();
    ~QtfbIntegration() override;

    bool hasCapability(Capability cap) const override;
    QPlatformFontDatabase *fontDatabase() const override;
    QPlatformWindow *createPlatformWindow(QWindow *window) const override;
    QPlatformBackingStore *createPlatformBackingStore(QWindow *window) const override;
    QAbstractEventDispatcher *createEventDispatcher() const override;

private:
    QtfbPlatformScreen *m_screen = nullptr;
    mutable QPlatformFontDatabase *m_fontDatabase = nullptr;
};

class QtfbIntegrationPlugin : public QPlatformIntegrationPlugin
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID QPlatformIntegrationFactoryInterface_iid FILE "qtfb.json")
public:
    QPlatformIntegration *create(const QString &key, const QStringList &paramList) override;
};

#endif
