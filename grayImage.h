#ifndef GRAYIMAGE_H
#define GRAYIMAGE_H

#include <QQuickImageProvider>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QNetworkReply>
#include <QPainter>
#include <QPainterPath>

class AsyncImageResponse : public QQuickImageResponse
{
public:
    AsyncImageResponse(const QString &id, const QSize &requestedSize)
        : m_id(id), m_requestedSize(requestedSize)
    {
        connect(&netManager, &QNetworkAccessManager::finished, this, [this](QNetworkReply *rep) {
            rep->deleteLater();
            if (rep->error() != QNetworkReply::NoError)
            {
                qDebug() << "[NET] ERR: " << rep->errorString();
                emit finished();
                return;
            }

            QByteArray bytes = rep->readAll();
            QImage img = QImage::fromData(bytes).convertToFormat(QImage::Format_Grayscale8);
            if (img.isNull()) {
                emit finished();
                return;
            }
            QSize targetSize = img.size();
            if (m_requestedSize.width() > 0 && m_requestedSize.height() > 0)
                targetSize = m_requestedSize;

            if (img.size() != targetSize) {
                qreal scale = qMax(qreal(targetSize.width()) / img.width(), qreal(targetSize.height()) / img.height());
                QSize scaledSize(qRound(img.width() * scale), qRound(img.height() * scale));
                img = img.scaled(scaledSize, Qt::IgnoreAspectRatio, Qt::SmoothTransformation);
            }

            _img = QImage(targetSize, QImage::Format_ARGB32);
            _img.fill(Qt::transparent);
            QPainter p(&_img);
            p.setRenderHint(QPainter::SmoothPixmapTransform);
            qreal radius = 8.0;
            if (targetSize.width() > 200) {
                p.setRenderHint(QPainter::Antialiasing, true);
                radius = 16.0;
            }
            QRectF targetRect(1, 1, targetSize.width() - 2, targetSize.height() - 2);
            QPainterPath clipPath;
            clipPath.addRoundedRect(targetRect, radius, radius);
            p.setClipPath(clipPath);
            int x = (targetSize.width() - img.width()) / 2;
            int y = (targetSize.height() - img.height()) / 2;
            p.drawImage(x, y, img);
            p.end();

            emit finished();
        });

        netManager.get(QNetworkRequest(m_id));
    }

    QQuickTextureFactory *textureFactory() const
    {
        return QQuickTextureFactory::textureFactoryForImage(_img);
    }

private:
    QImage _img;
    QString m_id;
    QSize m_requestedSize;
    QNetworkAccessManager netManager;
};

class GrayImageProvider : public QQuickAsyncImageProvider
{
public:
    GrayImageProvider() {}

    QQuickImageResponse *requestImageResponse(const QString &id, const QSize &requestedSize) override
    {
        AsyncImageResponse *response = new AsyncImageResponse(id, requestedSize);
        return response;
    }
};

#endif /* GRAYIMAGE_H */