#ifndef GRAYIMAGE_H
#define GRAYIMAGE_H

#include <QQuickImageProvider>
#include <QLocalSocket>
#include <QUrl>
#include <QFile>
#include <QImage>
#include <QtConcurrent>
#include <QCryptographicHash>
#include <QDir>

static QString getCoverCachePath(const QString &url)
{
    const QString cacheDir = QStringLiteral("/tmp/zshelf_covers");
    QDir().mkpath(cacheDir);
    const QByteArray hash = QCryptographicHash::hash(url.toUtf8(), QCryptographicHash::Md5).toHex();
    return cacheDir + QStringLiteral("/") + QString::fromLatin1(hash) + QStringLiteral(".png");
}

// Covers are fetched by the Node backend (one shared clearance session).
// The fetch runs off the GUI thread so the book grid can show titles first.
static QImage loadGrayImage(const QString &id, const QSize &requestedSize)
{
    QString url = QUrl::fromPercentEncoding(id.toUtf8());
    if (url.startsWith(QLatin1String("//")))
        url = QLatin1String("https:") + url;

    QString cacheFile;
    if (url.startsWith(QLatin1String("http://")) || url.startsWith(QLatin1String("https://"))) {
        cacheFile = getCoverCachePath(url);
        if (QFile::exists(cacheFile)) {
            QImage cached(cacheFile);
            if (!cached.isNull()) {
                if (requestedSize.width() > 0 && requestedSize.height() > 0 &&
                    (cached.width() > requestedSize.width() || cached.height() > requestedSize.height())) {
                    cached = cached.scaled(requestedSize, Qt::KeepAspectRatio, Qt::SmoothTransformation);
                }
                return cached;
            }
        }
    }

    QImage img;
    if (url.startsWith(QLatin1String("file:"))) {
        img = QImage(QUrl(url).toLocalFile());
    } else if (url.startsWith(QLatin1String("http://")) || url.startsWith(QLatin1String("https://"))) {
        QLocalSocket sock;
        sock.connectToServer(QStringLiteral("/tmp/zshelf_socket"), QIODevice::ReadWrite);
        if (sock.waitForConnected(3000)) {
            const QByteArray payload = QByteArray("IMG\n") + url.toUtf8() + QByteArray("\n");
            sock.write(payload);
            if (sock.waitForBytesWritten(3000)) {
                QByteArray line;
                while (!line.contains('\n')) {
                    if (!sock.waitForReadyRead(20000))
                        break;
                    line += sock.readAll();
                    if (line.size() > 8 * 1024 * 1024)
                        break;
                }
                if (line.startsWith("IMG:"))
                    img = QImage::fromData(QByteArray::fromBase64(line.mid(4).trimmed()));
            }
            sock.close();
        }
    }
    if (img.isNull())
        return img;
    img = img.convertToFormat(QImage::Format_Grayscale8);
    if (!cacheFile.isEmpty()) {
        img.save(cacheFile, "PNG");
    }
    if (requestedSize.width() > 0 && requestedSize.height() > 0)
        img = img.scaled(requestedSize, Qt::KeepAspectRatio, Qt::SmoothTransformation);
    return img;
}

class AsyncImageResponse : public QQuickImageResponse
{
public:
    AsyncImageResponse(const QString &id, const QSize &requestedSize)
    {
        connect(&m_watcher, &QFutureWatcher<QImage>::finished, this, [this]() {
            _img = m_watcher.result();
            emit finished();
        });
        m_watcher.setFuture(QtConcurrent::run(loadGrayImage, id, requestedSize));
    }

    QQuickTextureFactory *textureFactory() const override
    {
        return QQuickTextureFactory::textureFactoryForImage(_img);
    }

private:
    QImage _img;
    QFutureWatcher<QImage> m_watcher;
};

class GrayImageProvider : public QQuickAsyncImageProvider
{
public:
    GrayImageProvider() {}

    QQuickImageResponse *requestImageResponse(const QString &id, const QSize &requestedSize) override
    {
        return new AsyncImageResponse(id, requestedSize);
    }
};

#endif /* GRAYIMAGE_H */
