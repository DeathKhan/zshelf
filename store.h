#ifndef STORE_H
#define STORE_H

#include <QObject>
#include <QtQuick>
#include <QQuickView>
#include <QDebug>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include "worker.h"

class Book : public QObject
{
    Q_OBJECT

public:
    Book(QObject* parent) : QObject(parent) {};
    ~Book();

    Q_PROPERTY(QString imgFile MEMBER _imgFile NOTIFY imgFileChanged)
    Q_PROPERTY(QString name MEMBER _name NOTIFY nameChanged)
    Q_PROPERTY(QString author MEMBER _author NOTIFY authorChanged)
    Q_PROPERTY(QString url MEMBER _url NOTIFY urlChanged)
    Q_PROPERTY(QString desc MEMBER _desc NOTIFY descChanged)
    Q_PROPERTY(QString dlUrl MEMBER _dlUrl NOTIFY dlUrlChanged)
    Q_PROPERTY(QString status MEMBER _status NOTIFY statusChanged)
    Q_PROPERTY(QString downloadError MEMBER _downloadError NOTIFY downloadErrorChanged)
    Q_PROPERTY(QString fileExt MEMBER _fileExt NOTIFY fileExtChanged)
    Q_PROPERTY(QString fileSize MEMBER _fileSize NOTIFY fileSizeChanged)
    Q_PROPERTY(QList<QObject *> similars MEMBER _similars NOTIFY similarsChanged)

    Q_PROPERTY(bool detailBusy MEMBER _detailBusy NOTIFY detailBusyChanged)
    Q_PROPERTY(QString detailError MEMBER _detailError NOTIFY detailErrorChanged)
    Q_INVOKABLE void getDetail();

    void updateProgress(int prog);

signals:
    void detailBusyChanged();
    void detailErrorChanged();
    void imgFileChanged(QString);
    void nameChanged(QString);
    void authorChanged(QString);
    void urlChanged(QString);
    void descChanged(QString);
    void dlUrlChanged(QString);
    void statusChanged(QString);
    void downloadErrorChanged();
    void fileExtChanged(QString);
    void fileSizeChanged(QString);
    void similarsChanged(QList<QObject *>);

public:
    Worker *worker = nullptr;
    QString _imgFile;
    QString _name;
    QString _author;
    QString _url;
    QString _desc;
    QString _dlUrl;
    QString _status;
    QString _downloadError;
    QString _localPath;
    void refreshDownloadState();
    QString _fileExt;
    QString _fileSize;
    QList<QObject *> _similars;
    bool _metadownloaded = false;
    bool _detailBusy = false;
    QString _detailError;
};

// Stable rows: filling a placeholder changes its data, not the delegates
// around it. This preserves grabs, card identity and scroll position.
class BookListModel : public QAbstractListModel {
    Q_OBJECT
public:
    explicit BookListModel(QList<QObject *> *books, QObject *parent = nullptr)
        : QAbstractListModel(parent), books(books) {}
    int rowCount(const QModelIndex &parent = QModelIndex()) const override {
        return parent.isValid() ? 0 : qMax(books->size(), minimumRows);
    }
    QVariant data(const QModelIndex &index, int role) const override {
        if (!index.isValid() || role != Qt::UserRole + 1 || index.row() < 0 || index.row() >= rowCount()) return {};
        return QVariant::fromValue(index.row() < books->size() ? books->at(index.row()) : static_cast<QObject *>(nullptr));
    }
    QHash<int, QByteArray> roleNames() const override { return {{Qt::UserRole + 1, "bookObject"}}; }
    void reserve(int rows) {
        const int before = rowCount(), after = qMax(books->size(), rows);
        if (after > before) beginInsertRows({}, before, after - 1);
        else if (after < before) beginRemoveRows({}, after, before - 1);
        minimumRows = rows;
        if (after > before) endInsertRows(); else if (after < before) endRemoveRows();
    }
    void append(QObject *book) {
        const int row = books->size();
        const bool insert = row == rowCount();
        if (insert) beginInsertRows({}, row, row);
        books->append(book);
        if (insert) endInsertRows(); else emit dataChanged(index(row), index(row), {Qt::UserRole + 1});
    }
    void clear() { beginResetModel(); books->clear(); minimumRows = 0; endResetModel(); }
    void removeAt(int row) { beginResetModel(); books->removeAt(row); endResetModel(); }
private:
    QList<QObject *> *books;
    int minimumRows = 0;
};

class Store : public QQuickView
{
    Q_OBJECT
public:
    Q_PROPERTY(QList<QObject *> books MEMBER _books NOTIFY booksChanged)
    Q_PROPERTY(QAbstractItemModel *bookModel READ bookModel CONSTANT)
    Q_PROPERTY(bool listLoading MEMBER _listLoading NOTIFY listStateChanged)
    Q_PROPERTY(bool canLoadMore MEMBER _canLoadMore NOTIFY listStateChanged)
    Q_PROPERTY(int pageSize MEMBER _pageSize)
    Q_PROPERTY(QList<QObject *> downloadList MEMBER _downloadList NOTIFY downloadListChanged)
    Q_PROPERTY(bool isBusy MEMBER _isBusy NOTIFY isBusyChanged)
    Q_PROPERTY(QString exactMatch MEMBER _exactMatch)
    Q_PROPERTY(QString fromYear MEMBER _fromYear)
    Q_PROPERTY(QString toYear MEMBER _toYear)
    Q_PROPERTY(QString language MEMBER _language)
    Q_PROPERTY(QString extension MEMBER _extension)
    Q_PROPERTY(QString order MEMBER _order)
    Q_PROPERTY(QString query MEMBER _query NOTIFY queryChanged)
    Q_PROPERTY(QString accountStatus MEMBER _accountStatus NOTIFY accountStatusChanged)
    Q_PROPERTY(bool downloadLimitReached MEMBER _downloadLimitReached NOTIFY accountStatusChanged)
    Q_PROPERTY(bool signedIn MEMBER _cookieAvailable NOTIFY signedInChanged)
    Q_PROPERTY(int currentPage MEMBER _currentPage NOTIFY currentPageChanged)
    Q_PROPERTY(bool adultCategories MEMBER _adultCategories NOTIFY adultCategoriesChanged)
    Q_PROPERTY(QString sourceUrl MEMBER _sourceUrl NOTIFY librarySettingsChanged)
    Q_PROPERTY(QString downloadDir MEMBER _downloadDir NOTIFY librarySettingsChanged)

    QAbstractItemModel *bookModel() { return &_bookModel; }
    Store();
    ~Store();
    bool loadConfig();
    void open();

public slots:
    Q_INVOKABLE void newQuery(int page);
    Q_INVOKABLE void ensureBooks(int count);
    Q_INVOKABLE void refreshAccount();
    Q_INVOKABLE void openSavedList(int page);
    Q_INVOKABLE void retryQuery();
    Q_INVOKABLE void stopQuery();
    Q_INVOKABLE bool setConfig();
    Q_INVOKABLE void download(Book*);
    Q_INVOKABLE void signIn(const QString &email, const QString &password);
    Q_INVOKABLE void setAdultCategories(bool on);
    Q_INVOKABLE bool saveLibrarySettings(const QString &url, const QString &dir);

signals:
    void queryChanged();
    void listStateChanged();
    void booksChanged();
    void downloadListChanged();
    void isBusyChanged();
    void accountStatusChanged();
    void signedInChanged();
    void loginFinished(bool ok, QString message);
    void currentPageChanged();
    void adultCategoriesChanged();
    void librarySettingsChanged();

private:
    QQuickItem *rootView;
    QQmlContext *context;
    QQuickItem *storeView;
    QList<QObject *> _books;
    BookListModel _bookModel{&_books, this};
    bool _listLoading = false;
    bool _canLoadMore = false;
    bool _failedList = false;
    int _pageSize = 12;
    int _wantedCount = 12;
    QStringList _listArgs;
    QList<QObject *> _downloadList;
    QObject *booksParent = nullptr;
    bool _isBusy = false;
    Worker *worker = nullptr;
    QString _exactMatch = "0";
    QString _fromYear = "2021";
    QString _toYear = "2021";
    QString _language = "English";
    QString _extension = "epub";
    QString _order = "Most Popular";
    QString _query = "";
    QString _accountStatus;

    bool _cookieAvailable = false;
    bool _downloadLimitReached = false;
    int _currentPage = 0;
    bool _adultCategories = false;
    // Defaults match backend/common.js DEFAULT_DOMAIN and download.js KOREADER_DIR.
    QString _sourceUrl = QStringLiteral("https://z-lib.sk");
    QString _downloadDir = QStringLiteral("/home/root/Books");
    bool _savedList = false;
    int _listEpoch = 0;

    void beginList(const QStringList &args);
    void applyList(int epoch, const QByteArray &bytes);
    void dropListed(int epoch, const QByteArray &bytes);
    void rememberBooks(int epoch, const QJsonArray &list);
    void revealNextBook(int epoch);
    void finishList(bool more);
    QList<QJsonObject> _incomingBooks;
    bool _revealScheduled = false;
    bool _finishAfterReveal = false;
    bool _finishMore = false;
};

#endif /* STORE_H */