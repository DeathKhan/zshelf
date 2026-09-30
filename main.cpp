#include <QtQuick>
#include <QtGui>
#include <QFont>
#include <QFontDatabase>
#include <QDebug>
#include <QtPlugin>
#include "store.h"
#include "quickvirtualkeyboard/register.h"
#include "grayImage.h"

Q_IMPORT_PLUGIN(QsgEpaperPlugin)

int main(int argc, char *argv[])
{
    qputenv("QMLSCENE_DEVICE", "epaper");
    qputenv("QT_QPA_PLATFORM", "epaper:enable_fonts");
    qputenv("QT_QPA_EVDEV_TOUCHSCREEN_PARAMETERS", "rotate=180");

    QGuiApplication app(argc, argv);

    Store view;
    qmlRegisterType<Store>();

    auto context = view.rootContext();
    context->setContextProperty("screenGeometry", app.primaryScreen()->geometry());
    context->setContextProperty("store", &view);
    context->setContextProperty("storeProg", QVariant(0));
    context->setContextProperty("storeError", QVariant(""));
    context->setContextProperty("titleVisible", QVariant(true));

    // Noto Sans: Latin (including Latin Extended) and Cyrillic.
    // Noto Sans CJK SC: Han, kana, and Hangul. Same style names (Regular,
    // Medium, Bold, Light) so a bold/medium request can fall through.
    // Qt does not merge cmaps across families; insertSubstitution does.
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
    registerQmlTypes();
    view.setSource(QUrl(QStringLiteral("qrc:/Main.qml")));

    QObject::connect(view.engine(), &QQmlEngine::quit, &QGuiApplication::quit);
    QObject::connect(&app, &QCoreApplication::aboutToQuit, [&view]() { delete &view; });

    view.show();
    view.open();

    return app.exec();
}
