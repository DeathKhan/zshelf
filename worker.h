#pragma once

#include <QThread>
#include <QProcess>
#include <QDebug>
#include <QLocalSocket>
#include <QtGui>

static QProcess *serverProc = nullptr;

class Worker : public QThread
{
    Q_OBJECT
public:
    Worker(QStringList args, bool isReadAll = false) : args(args), isReadAll(isReadAll) {}

    ~Worker() override { requestInterruption(); wait(); }

    QStringList args;
    bool isReadAll;
    int listEpoch = 0;
    QString socketPath = "/tmp/zshelf_socket";

    static void createServer() {
        serverProc = new QProcess;
        serverProc->start("/opt/bin/node", {QGuiApplication::applicationDirPath() + "/backend/server.js"}, QIODevice::ReadOnly);
        serverProc->waitForStarted();
        serverProc->waitForReadyRead();
    }

    static void checkServer() {
        if (serverProc == nullptr) createServer();

        if (serverProc->state() == QProcess::NotRunning)
        {
            qDebug() << "[SERVER] Not running " << serverProc->state() << serverProc->error();
            delete serverProc;
            createServer();
        }
        qDebug() << "[SERVER] " << serverProc->state();
    }

    void work() {
        checkServer();
        start();
    }

    void run() override
    {
        QLocalSocket sock;
        sock.connectToServer(socketPath, QIODevice::ReadWrite);
        sock.waitForConnected(1000);
        qDebug() << "[SOCKET]" << args[0] << "Connected";
        for (auto arg : args) {
            sock.write(arg.toStdString().c_str());
            sock.write("\n", 1);
        }
        sock.waitForBytesWritten(1000);
        QByteArray bytes;
        const int epoch = listEpoch;
        const bool listCmd = !args.isEmpty() && (args[0] == QLatin1String("LIST") || args[0] == QLatin1String("SAVE"));
        bool listFailed = false;
        bool hasMore = false;
        bool completedList = false;
        QElapsedTimer idle;
        idle.start();
        while (!isInterruptionRequested())
        {
            if (!sock.canReadLine()) {
                if (sock.state() != QLocalSocket::ConnectedState || idle.elapsed() > 30000) break;
                sock.waitForReadyRead(100);
                continue;
            }
            idle.restart();
            QByteArray line = sock.readLine();

            if (line.startsWith("PROG:"))
            {
                emit updateProgress(line.mid(5).trimmed().toInt());
                continue;
            }
            else if (line.startsWith("TOTAL:"))
            {
                emit updateStatus(line);
                continue;
            }
            else if (listCmd && line.startsWith("ERR:")) {
                emit listPage(epoch, line);
                listFailed = true;
                break;
            }
            else if (listCmd && line.startsWith("END:")) {
                const auto end = QJsonDocument::fromJson(line.mid(4)).object();
                hasMore = end.value("hasMore").toBool();
                completedList = true;
                continue;
            }
            else if (listCmd && line.startsWith("DROP:"))
            {
                emit listDrop(epoch, line.mid(5));
                continue;
            }
            else if (listCmd && line.startsWith("["))
            {
                emit listPage(epoch, line);
                continue;
            }

            if (isReadAll)
                bytes.push_back(line);
            else
                emit updateStatus(line);

            if (line.startsWith("ERR:")) break;
        }

        if (listCmd) {
            if (!completedList && !listFailed && !isInterruptionRequested())
                emit listPage(epoch, QByteArray("ERR: Checking was interrupted. Please retry."));
        } else if (isReadAll) {
            emit readAll(bytes);
        }

        sock.close();
        if (listCmd) emit listFinished(epoch, completedList && !listFailed && hasMore);
        emit socketClosed();
        qDebug() << "[SOCKET]" << args[0] << "Closed";
    };
signals:
    void updateProgress(int result);
    void updateStatus(QString str);
    void readAll(QByteArray bytes);
    void listPage(int epoch, QByteArray bytes);
    void listDrop(int epoch, QByteArray bytes);
    void listFinished(int epoch, bool hasMore);
    void socketClosed();
};