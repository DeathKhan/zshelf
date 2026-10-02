#include "store.h"
#include <QTimer>
#include <QFileInfo>
#include <QDir>

static QString configFile()
{
    const QString local = QCoreApplication::applicationDirPath() + QStringLiteral("/config.json");
    if (QFileInfo::exists(local))
        return local;
    // The tablet backend is a symlink. Its config (domain, books dir) lives
    // beside that real directory, not beside the zshelf binary.
    const QString backend = QFileInfo(QCoreApplication::applicationDirPath() + QStringLiteral("/backend")).canonicalFilePath();
    if (!backend.isEmpty()) {
        const QString shared = QFileInfo(backend + QStringLiteral("/../config.json")).canonicalFilePath();
        if (!shared.isEmpty() && QFileInfo::exists(shared))
            return shared;
    }
    return local;
}
#include <QSettings>
#include <QCryptographicHash>
#include <QFileInfo>
#include <QUrl>

bool initialInfo = true;
Worker *infoThread = nullptr;

Store::Store() : rootView(rootObject()), context(rootContext())
{
    worker = new Worker({}, true);
    // Start server
    worker->checkServer();
    context->setContextProperty("storeProg", QVariant(0.2));

    connect(worker, &Worker::updateStatus, this, [this](QString stat) {
        qDebug() << "LOG: " << stat;
        if (stat.startsWith("TOTAL:"))
        {
            // 10/20/30 is the page-size control, not a list of result offsets.
            return;
        }
    });
    connect(worker, &Worker::updateProgress, this, [this](int prog) {
        context->setContextProperty("storeProg", QVariant(0.2 + prog / 100.0 * 0.7));
    });
    connect(worker, &Worker::socketClosed, this, [this]() {
        context->setContextProperty("titleVisible", QVariant(false));
        if (initialInfo && _cookieAvailable && infoThread != nullptr) {
            refreshAccount();
            initialInfo = false;
        }
    });
    connect(worker, &Worker::listPage, this, &Store::applyList);
    connect(worker, &Worker::listDrop, this, &Store::dropListed);
    connect(worker, &Worker::listFinished, this, [this](int epoch, bool more) {
        if (epoch != _listEpoch) return;
        _finishMore = more;
        if (_revealScheduled || !_incomingBooks.isEmpty()) {
            _finishAfterReveal = true;
            return;
        }
        finishList(more);
    });
    connect(worker, &QThread::finished, this, [this]() {
        if (!_listLoading) ensureBooks(_wantedCount);
    });
}

Store::~Store()
{
    if (worker != nullptr)
        delete worker;

    if (infoThread != nullptr)
        delete infoThread;
    
    if (serverProc != nullptr)
        { serverProc->terminate(); serverProc->waitForFinished(1000); delete serverProc; serverProc = nullptr; }
}

void Store::open()
{
    if (!loadConfig())
        qDebug() << "config.json malformed";

    newQuery(0);

    {
        infoThread = new Worker({"INFO"}, true);
        connect(infoThread, &Worker::readAll, this, [this](QByteArray bytes) {
            setProperty("accountStatus", QStringLiteral("Download limit unavailable · Retry"));
            QJsonParseError jsonError;
            QJsonDocument document = QJsonDocument::fromJson(bytes, &jsonError);
            if (jsonError.error != QJsonParseError::NoError)
            {
                qDebug() << "fromJson failed: " << jsonError.errorString();
                qDebug() << "ERR: " << bytes;
                return;
            }
            if (!document.isObject())
                return;

            QJsonObject jsonObj = document.object();
            const auto counts = jsonObj.value("today_download").toString().split('/');
            bool usedOk = false, limitOk = false;
            const int used = counts.value(0).toInt(&usedOk);
            const int limit = counts.value(1).toInt(&limitOk);
            if (counts.size() == 2 && usedOk && limitOk && used >= 0 && limit >= 0) {
                _downloadLimitReached = used >= limit;
                setProperty("accountStatus", QStringLiteral("%1 / %2 downloads used today%3")
                    .arg(used).arg(limit).arg(used >= limit ? QStringLiteral(" · Limit reached") : QString()));
            }

            QJsonValue historyList = jsonObj.value("today_list");
            if (!historyList.isArray())
                return;
            QJsonArray downloadedBooks = historyList.toArray();
            for (auto book : downloadedBooks)
            {
                auto bookObj = book.toObject();
                QString url = bookObj.value("url").toString();

                bool found = false;
                for (auto seen : _downloadList)
                {
                    if (url == seen->property("url"))
                    {
                        found = true;
                        break;
                    }
                }
                if (found)
                    continue;
                Book *item = new Book(nullptr);
                item->_url = url;
                item->_name = bookObj.value("name").toString();
                _downloadList.push_back(item);
            }
            emit downloadListChanged();
        });
    }
    setProperty("accountStatus", _cookieAvailable ? "Checking download limit…" : "Sign in to check download limit");
}

void Store::refreshAccount()
{
    if (!_cookieAvailable || infoThread == nullptr || infoThread->isRunning())
        return;
    setProperty("accountStatus", QStringLiteral("Checking download limit…"));
    infoThread->work();
}

void Store::beginList(const QStringList &args)
{
    stopQuery();
    ++_listEpoch;
    worker->listEpoch = _listEpoch;
    _bookModel.clear();
    _incomingBooks.clear();
    _revealScheduled = false;
    _finishAfterReveal = false;
    if (booksParent) booksParent->deleteLater();
    booksParent = new QObject(this);
    emit booksChanged();
    context->setContextProperty("storeError", QString());
    setProperty("isBusy", true);
    worker->args = args;
    _listArgs = args;
    _failedList = false;
    _wantedCount = qMax(1, _pageSize);
    _listLoading = true;
    _canLoadMore = false;
    _bookModel.reserve(_wantedCount);
    emit listStateChanged();
    context->setContextProperty("storeProg", QVariant(0.2));
    worker->work();
}

void Store::ensureBooks(int count)
{
    _wantedCount = qMax(1, count);
    if (_listLoading) {
        _bookModel.reserve(_wantedCount);
        return;
    }
    if (_books.size() >= _wantedCount || !_canLoadMore || worker->isRunning() || _listArgs.isEmpty()) return;
    ++_currentPage;
    emit currentPageChanged();
    _listArgs[_savedList ? 1 : 8] = QString::number(_currentPage + 1);
    worker->args = _listArgs;
    _listLoading = true;
    _canLoadMore = false;
    _bookModel.reserve(_wantedCount);
    emit listStateChanged();
    worker->work();
}

void Store::newQuery(int page = 0)
{
    emit queryChanged();
    _currentPage = page;
    _savedList = false;
    // The saved default (recent English epubs) is for the home shelf only.
    // Typing a query must not keep those year and extension limits.
    const bool textSearch = !_query.trimmed().isEmpty();
    beginList({
        "LIST",
        _exactMatch,
        textSearch ? QStringLiteral("Any") : _fromYear,
        textSearch ? QStringLiteral("Any") : _toYear,
        _language,
        textSearch ? QStringLiteral("Any") : _extension,
        _order,
        _query,
        QString::number(page + 1),
        _adultCategories ? QStringLiteral("1") : QStringLiteral("0")
    });
}

void Store::openSavedList(int page = 0)
{
    _currentPage = page;
    _savedList = true;
    beginList({
        "SAVE",
        QString::number(page + 1),
        _adultCategories ? QStringLiteral("1") : QStringLiteral("0")
    });
}

void Store::stopQuery()
{
    if (worker->isRunning()) {
        worker->requestInterruption();
        worker->wait();
    }
    ++_listEpoch; // Ignore queued data and completion from the cancelled request.
    _incomingBooks.clear();
    _revealScheduled = false;
    _finishAfterReveal = false;
    _listLoading = false;
    _canLoadMore = false;
    _bookModel.reserve(0);
    emit listStateChanged();
    setProperty("isBusy", false);
}

void Store::retryQuery()
{
    if (_failedList && !_listLoading && !worker->isRunning() && !_listArgs.isEmpty()) {
        _failedList = false;
        _listLoading = true;
        _bookModel.reserve(_wantedCount);
        worker->args = _listArgs;
        worker->listEpoch = _listEpoch;
        context->setContextProperty("storeError", QString());
        emit listStateChanged();
        worker->work();
    } else if (_savedList) openSavedList(0);
    else newQuery(0);
}

bool Store::loadConfig()
{
    QFile file(configFile());

    if (!file.open(QIODevice::ReadOnly))
        return false;

    QByteArray bytes = file.readAll();
    file.close();

    QJsonParseError jsonError;
    QJsonDocument document = QJsonDocument::fromJson(bytes, &jsonError);
    if (jsonError.error != QJsonParseError::NoError)
    {
        qDebug() << "fromJson failed: " << jsonError.errorString();
        return false;
    }
    if (!document.isObject())
        return false;

    QJsonObject jsonObj = document.object();

    _cookieAvailable = jsonObj.value("cookie").toString("").length() > 0;
    emit signedInChanged();
    _adultCategories = jsonObj.value("adultCategories").toBool(false);
    emit adultCategoriesChanged();
    _sourceUrl = jsonObj.value("domain").toString(_sourceUrl).trimmed();
    while (_sourceUrl.endsWith(QLatin1Char('/')))
        _sourceUrl.chop(1);
    if (_sourceUrl.isEmpty())
        _sourceUrl = QStringLiteral("https://z-lib.sk");
    _downloadDir = jsonObj.value("additionalBookLocation").toString(_downloadDir).trimmed();
    if (_downloadDir.isEmpty())
        _downloadDir = QStringLiteral("/home/root/Books");
    emit librarySettingsChanged();

    QJsonValue defaultQueryValue = jsonObj.value("defaultQuery");
    if (!defaultQueryValue.isObject())
        return false;

    QJsonObject defaultQueryObj = defaultQueryValue.toObject();

    _exactMatch = defaultQueryObj.value("exactMatch").toString("");
    _fromYear = defaultQueryObj.value("fromYear").toString("");
    _toYear = defaultQueryObj.value("toYear").toString("");
    _language = defaultQueryObj.value("language").toString("");
    _extension = defaultQueryObj.value("extension").toString("");
    _order = defaultQueryObj.value("order").toString("");
    _query = defaultQueryObj.value("query").toString("");

    return true;
}

bool Store::setConfig()
{
    QFile file(configFile());

    if (!file.open(QIODevice::ReadOnly))
    {
        qDebug() << "Can't open config.json in read-only";
        return false;
    }

    QByteArray bytes = file.readAll();
    file.close();

    QJsonParseError jsonError;
    QJsonDocument document = QJsonDocument::fromJson(bytes, &jsonError);
    if (jsonError.error != QJsonParseError::NoError)
    {
        qDebug() << "fromJson failed: " << jsonError.errorString();
        return false;
    }
    if (!document.isObject())
    {
        qDebug() << "config.json malformed";
        return false;
    }

    QJsonObject jsonObj = document.object();

    QJsonObject defaultQuery;

    defaultQuery.insert("exactMatch", _exactMatch);
    defaultQuery.insert("fromYear", _fromYear);
    defaultQuery.insert("toYear", _toYear);
    defaultQuery.insert("language", _language);
    defaultQuery.insert("extension", _extension);
    defaultQuery.insert("order", _order);
    defaultQuery.insert("query", _query);

    jsonObj.remove("defaultQuery");
    jsonObj.insert("defaultQuery", defaultQuery);

    file.remove();
    if (!file.open(QIODevice::WriteOnly))
    {
        qDebug() << "Can't open config.json in write-only";
        return false;
    }

    QByteArray writeBytes = QJsonDocument(jsonObj).toJson(QJsonDocument::Indented);
    // Qt 6 QTextStream has no setCodec; the JSON is already UTF-8.
    if (file.write(writeBytes) != writeBytes.size()) {
        qDebug() << "Can't write config.json";
        file.close();
        return false;
    }
    file.close();

    return true;
}


void Store::signIn(const QString &email, const QString &password)
{
    const QString trimmedEmail = email.trimmed();
    if (trimmedEmail.isEmpty() || password.isEmpty()) {
        emit loginFinished(false, QStringLiteral("Email and password are required"));
        return;
    }

    // Password is sent to the local backend only. It is not logged or written to disk.
    auto *loginWorker = new Worker({"LOGIN", trimmedEmail, password}, true);
    connect(loginWorker, &Worker::readAll, this, [this, loginWorker](QByteArray bytes) {
        const QString text = QString::fromUtf8(bytes).trimmed();
        if (text.startsWith(QLatin1String("OK"))) {
            _cookieAvailable = true;
            emit signedInChanged();
            setProperty("accountStatus", QStringLiteral("Signed in"));
            emit loginFinished(true, QStringLiteral("Signed in"));
            refreshAccount();
        } else {
            QString msg = text;
            if (msg.startsWith(QLatin1String("ERR:")))
                msg = msg.mid(4).trimmed();
            if (msg.isEmpty())
                msg = QStringLiteral("Sign-in failed");
            emit loginFinished(false, msg.left(180));
        }
        loginWorker->deleteLater();
    });
    loginWorker->work();
}

static QString downloadKey(const QString &url) {
    return "downloads/" + QString::fromLatin1(QCryptographicHash::hash(url.toUtf8(), QCryptographicHash::Sha256).toHex());
}
void Book::refreshDownloadState() {
    if (worker) return;
    QSettings files(QGuiApplication::applicationDirPath() + "/downloads.ini", QSettings::IniFormat);
    _localPath = files.value(downloadKey(_url)).toString();
    const QFileInfo file(_localPath);
    if (!_localPath.isEmpty() && file.isFile() && file.size() > 0)
        setProperty("status", "Downloaded");
    else if (_status.isEmpty() || _status == "Downloaded")
        setProperty("status", "Download");
}
void Store::download(Book* book)
{
    if (!book || book->_dlUrl.isEmpty() || book->worker) return;
    if (_downloadLimitReached) {
        book->setProperty("downloadError", "Daily download limit reached. Refresh your account status to check again.");
        return;
    }
    for (auto *entry : _downloadList) {
        auto *active = qobject_cast<Book *>(entry);
        if (active && active != book && active->_url == book->_url && active->worker) return;
    }
    book->refreshDownloadState();
    if (book->_status == "Downloaded") return;
    book->setProperty("downloadError", QString());
    book->setProperty("status", "Starting…");
    auto *job = new Worker({"DOWN", book->_dlUrl, book->_name});
    book->worker = job;
    book->setParent(this);
    if (!_downloadList.contains(book)) {
        _downloadList.prepend(book);
        emit downloadListChanged();
    }
    connect(job, &Worker::updateProgress, book, &Book::updateProgress);
    connect(job, &Worker::updateStatus, book, [book](QString stat) {
        if (stat.startsWith("ERR:")) {
            book->setProperty("downloadError", stat.mid(4).trimmed());
            book->setProperty("status", "Retry");
        } else if (stat.startsWith("STATE:")) {
            book->setProperty("status", stat.mid(6).trimmed());
        } else if (stat.startsWith("DONE:")) {
            const auto data = QJsonDocument::fromJson(("[" + stat.mid(5).trimmed() + "]").toUtf8());
            const auto path = data.isArray() && !data.array().isEmpty() ? data.array().first().toString() : QString();
            if (!path.isEmpty() && QFileInfo(path).isFile() && QFileInfo(path).size() > 0) {
                book->_localPath = path;
                QSettings files(QGuiApplication::applicationDirPath() + "/downloads.ini", QSettings::IniFormat);
                files.setValue(downloadKey(book->_url), path);
                files.sync();
                book->setProperty("status", "Downloaded");
            }
        }
    });
    connect(job, &QThread::finished, this, [this, book, job]() {
        book->worker = nullptr;
        if (book->_status != "Downloaded" && book->_status != "Retry") {
            book->setProperty("downloadError", "Download interrupted. Please retry.");
            book->setProperty("status", "Retry");
        }
        job->deleteLater();
        refreshAccount();
    });
    job->work();
}

Book::~Book() {
    if (worker != nullptr) {
        delete worker;
    }
}

void Book::getDetail()
{
    refreshDownloadState();
    if (_metadownloaded || _detailBusy)
        return;

    setProperty("detailError", QString());
    setProperty("detailBusy", true);
    auto *metaWorker = new Worker({"META", _url}, true);
    // The request belongs to the book, never to a reusable popup. Switching
    // cards cannot let an older reply clear the new card's loading state.
    connect(metaWorker, &QThread::finished, metaWorker, &QObject::deleteLater);
    connect(metaWorker, &Worker::readAll, this, [this](QByteArray bytes) {
        setProperty("detailBusy", false);
        QJsonParseError error;
        const auto document = QJsonDocument::fromJson(bytes, &error);
        if (error.error != QJsonParseError::NoError || !document.isObject()
            || document.object().value("name").toString().trimmed().isEmpty()) {
            setProperty("detailError", QStringLiteral("Couldn’t load book details. Please try again."));
            return;
        }

        const auto detail = document.object();
        setProperty("name", detail.value("name").toString());
        setProperty("author", detail.value("author").toString());
        setProperty("dlUrl", detail.value("dlUrl").toString());
        setProperty("desc", detail.value("description").toString());
        const auto image = detail.value("img").toString();
        if (!image.isEmpty())
            setProperty("imgFile", QStringLiteral("image://gray/") + image);

        QList<QObject *> recommendations;
        for (const auto value : detail.value("similars").toArray()) {
            const auto data = value.toObject();
            if (data.value("url").toString().isEmpty()) continue;
            auto *item = new Book(this);
            item->_url = data.value("url").toString();
            item->_name = data.value("name").toString(QStringLiteral("Related book"));
            item->_author = data.value("author").toString();
            const auto cover = data.value("img").toString();
            if (!cover.isEmpty()) item->_imgFile = QStringLiteral("image://gray/") + cover;
            recommendations.append(item);
        }
        setProperty("similars", QVariant::fromValue(recommendations));
        if (_status.isEmpty()) setProperty("status", "Download");
        _metadownloaded = true;
    });
    metaWorker->work();
}

void Book::updateProgress(int prog)
{
    // Completion requires DONE plus a verified local file, never a percentage.
    if (prog >= 100 || _status == "Downloaded" || _status == "Retry") return;
    setProperty("status", QStringLiteral("Downloading %1%").arg(qBound(0, prog, 99)));
}
void Store::applyList(int epoch, const QByteArray &bytes)
{
    if (epoch != _listEpoch)
        return;

    context->setContextProperty("storeProg", QVariant(0.95));
    QJsonParseError jsonError;
    const QJsonDocument document = QJsonDocument::fromJson(bytes, &jsonError);
    if (jsonError.error != QJsonParseError::NoError || !document.isArray())
    {
        _failedList = true;
        setProperty("isBusy", false);
        context->setContextProperty("storeError", jsonError.error != QJsonParseError::NoError
            ? QVariant(QString::fromUtf8(bytes))
            : QVariant("ERR: Server response malformed"));
        emit booksChanged();
        return;
    }

    const QJsonArray list = document.array();
    if (list.isEmpty())
    {
        setProperty("isBusy", false);
        return; // Completion decides whether to backfill or show an empty state.
    }

    rememberBooks(epoch, list);
}

void Store::finishList(bool more)
{
    _listLoading = false;
    _canLoadMore = more;
    setProperty("isBusy", false);
    if (!more || _books.size() >= _wantedCount) _bookModel.reserve(0);
    if (_books.isEmpty() && !more && context->contextProperty("storeError").toString().isEmpty())
        context->setContextProperty("storeError", "No books passed the filter.");
    emit listStateChanged();
    ensureBooks(_wantedCount);
}

void Store::rememberBooks(int epoch, const QJsonArray &list)
{
    if (epoch != _listEpoch)
        return;
    for (const auto book : list) {
        if (book.isObject())
            _incomingBooks.append(book.toObject());
    }
    if (_incomingBooks.isEmpty() || _revealScheduled)
        return;
    _revealScheduled = true;
    QTimer::singleShot(0, this, [this, epoch]() { revealNextBook(epoch); });
}

void Store::revealNextBook(int epoch)
{
    if (epoch != _listEpoch)
        return;
    if (_incomingBooks.isEmpty()) {
        _revealScheduled = false;
        if (_finishAfterReveal) {
            const bool more = _finishMore;
            _finishAfterReveal = false;
            finishList(more);
        }
        return;
    }

    const QJsonObject bookObj = _incomingBooks.takeFirst();
    if (!booksParent) booksParent = new QObject(this);
    bool known = false;
    for (auto *book : _books) {
        if (book->property("url").toString() == bookObj.value("url").toString()) {
            known = true;
            break;
        }
    }
    if (!known) {
        Book *item = nullptr;
        for (auto *entry : _downloadList) {
            auto *candidate = qobject_cast<Book *>(entry);
            if (candidate && candidate->_url == bookObj.value("url").toString()) { item = candidate; break; }
        }
        if (!item) item = new Book(booksParent);
        item->_name = bookObj.value("name").toString();
        item->_author = bookObj.value("author").toString();
        item->_url = bookObj.value("url").toString();
        item->_fileExt = bookObj.value("ext").toString();
        item->_fileSize = bookObj.value("size").toString();
        // Cover URL is attached, but the image provider fetches it off the GUI
        // thread. Titles are on screen before those bytes return.
        const QString image = bookObj.value("img").toString();
        if (!image.isEmpty())
            item->_imgFile = QStringLiteral("image://gray/") + image;
        item->refreshDownloadState();
        _bookModel.append(item);
        setProperty("isBusy", false);
        context->setContextProperty("storeProg", QVariant(1));
        context->setContextProperty("storeError", QVariant(""));
        emit booksChanged();
    }
    QTimer::singleShot(0, this, [this, epoch]() { revealNextBook(epoch); });
}

void Store::dropListed(int epoch, const QByteArray &bytes)
{
    if (epoch != _listEpoch)
        return;
    QJsonParseError jsonError;
    const QJsonDocument document = QJsonDocument::fromJson(bytes, &jsonError);
    if (jsonError.error != QJsonParseError::NoError || !document.isArray())
        return;

    QSet<QString> urls;
    for (const auto value : document.array())
        urls.insert(value.toString());
    if (urls.isEmpty())
        return;

    bool changed = false;
    for (int i = _books.size() - 1; i >= 0; --i) {
        auto *book = qobject_cast<Book *>(_books.at(i));
        if (book != nullptr && urls.contains(book->_url)) {
            _bookModel.removeAt(i);
            changed = true;
        }
    }
    if (!changed)
        return;
    if (_books.isEmpty())
        context->setContextProperty("storeError", QVariant("No result found"));
    emit booksChanged();
}


bool Store::saveLibrarySettings(const QString &url, const QString &dir)
{
    QString source = url.trimmed();
    QString folder = dir.trimmed();
    if (source.isEmpty())
        source = _sourceUrl.isEmpty() ? QStringLiteral("https://z-lib.sk") : _sourceUrl;
    if (folder.isEmpty())
        folder = _downloadDir.isEmpty() ? QStringLiteral("/home/root/Books") : _downloadDir;
    while (source.endsWith(QLatin1Char('/')))
        source.chop(1);
    const QUrl parsed(source, QUrl::StrictMode);
    if (!parsed.isValid() || parsed.host().isEmpty()
        || (parsed.scheme() != QLatin1String("http") && parsed.scheme() != QLatin1String("https"))
        || !parsed.userName().isEmpty() || !parsed.password().isEmpty())
        return false;
    if (folder.contains(QLatin1Char('\n')) || folder.contains(QLatin1Char('\r')))
        return false;

    QFile file(configFile());
    if (!file.open(QIODevice::ReadOnly))
        return false;
    const QByteArray raw = file.readAll();
    file.close();
    QJsonParseError jsonError;
    QJsonDocument document = QJsonDocument::fromJson(raw, &jsonError);
    if (jsonError.error != QJsonParseError::NoError || !document.isObject())
        return false;

    QJsonObject jsonObj = document.object();
    jsonObj.insert(QStringLiteral("domain"), source);
    jsonObj.insert(QStringLiteral("additionalBookLocation"), folder);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;
    const QByteArray writeBytes = QJsonDocument(jsonObj).toJson(QJsonDocument::Indented);
    const bool wrote = file.write(writeBytes) == writeBytes.size();
    file.close();
    if (!wrote)
        return false;

    _sourceUrl = source;
    _downloadDir = folder;
    emit librarySettingsChanged();
    return true;
}

void Store::setAdultCategories(bool on)
{
    if (_adultCategories == on)
        return;
    _adultCategories = on;
    emit adultCategoriesChanged();

    QFile file(configFile());
    if (file.open(QIODevice::ReadOnly)) {
        const QByteArray raw = file.readAll();
        file.close();
        QJsonParseError jsonError;
        QJsonDocument document = QJsonDocument::fromJson(raw, &jsonError);
        if (jsonError.error == QJsonParseError::NoError && document.isObject()) {
            QJsonObject jsonObj = document.object();
            jsonObj.insert(QStringLiteral("adultCategories"), on);
            if (file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
                file.write(QJsonDocument(jsonObj).toJson(QJsonDocument::Indented));
                file.close();
            }
        }
    }

    if (_savedList)
        openSavedList(_currentPage);
    else
        newQuery(_currentPage);
}
