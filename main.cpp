#include <QtQuick>
#include <QFont>
#include <QFontDatabase>
#include <QDebug>
#include <QtPlugin>
#include "store.h"
#include "grayImage.h"
#include "qtfbclient.h"

Q_IMPORT_PLUGIN(QtfbIntegrationPlugin)

int main(int argc, char *argv[])
{
    // Native qtfb client. Do not select the epaper QPA or libqsgepaper:
    // those lock SWTCON /dev/fb0 while xochitl already owns the panel.
    // The qtfb platform plugin only provides a 1404x1872 raster window.
    qunsetenv("QMLSCENE_DEVICE");
    qunsetenv("QT_QUICK_BACKEND");
    qputenv("QT_QPA_PLATFORM", "qtfb");
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);

    QGuiApplication app(argc, argv);
    app.styleHints()->setCursorFlashTime(0);
    qWarning("zshelf qpa: %s", qPrintable(app.platformName()));

    QtfbClient qtfb;
    const bool qtfbOpen = qtfb.openClient();

    Store view;
    qmlRegisterAnonymousType<Store>("zshelf", 1);
    qtfb.setWindow(&view);

    auto context = view.rootContext();
    const QRect panel(0, 0, qtfbwire::RM2_WIDTH, qtfbwire::RM2_HEIGHT);
    context->setContextProperty("screenGeometry", panel);
    view.resize(panel.size());
    context->setContextProperty("store", &view);
    context->setContextProperty("storeProg", QVariant(0));
    context->setContextProperty("storeError", QVariant(""));
    context->setContextProperty("titleVisible", QVariant(true));
    context->setContextProperty("panel", &qtfb);

    const char *fontResources[] = {
        ":/fonts/NotoSans-Regular",
        ":/fonts/NotoSans-Medium",
        ":/fonts/NotoSans-Bold",
        ":/fonts/NotoSans-Light",
        ":/fonts/NotoSansCJKsc-Regular",
        ":/fonts/NotoSansCJKsc-Medium",
        ":/fonts/NotoSansCJKsc-Bold",
        ":/fonts/NotoSansCJKsc-Light",
    };
    for (const char *resource : fontResources) {
        const int id = QFontDatabase::addApplicationFont(QString::fromLatin1(resource));
        if (id < 0)
            qWarning("zshelf: failed to load %s", resource);
    }
    QFont::insertSubstitution(QStringLiteral("Noto Sans"), QStringLiteral("Noto Sans CJK SC"));
    QFont::insertSubstitution(QStringLiteral("Maison Neue"), QStringLiteral("Noto Sans"));
    QFont::insertSubstitution(QStringLiteral("Unifont"), QStringLiteral("Noto Sans"));
    QFont uiFont(QStringLiteral("Noto Sans"));
    QGuiApplication::setFont(uiFont);

    view.engine()->addImportPath(QStringLiteral(DEPLOYMENT_PATH));
    view.engine()->addImageProvider(QLatin1String("gray"), new GrayImageProvider);
    view.setSource(QUrl(QStringLiteral("qrc:/Main.qml")));

    QObject::connect(view.engine(), &QQmlEngine::quit, &QGuiApplication::quit);
    if (qtfbOpen) {
        QObject::connect(&view, &QQuickWindow::frameSwapped, &qtfb, [&qtfb]() {
            qtfb.schedulePresent();
        });
    } else {
        qWarning("zshelf qtfb: not connected; window will not be pushed");
    }

    view.show();
    view.open();

    return app.exec();
}
