#ifndef SERVERMANAGER_H
#define SERVERMANAGER_H

#include <QObject>
#include <QTcpServer>
#include <QTcpSocket>
#include <QHostAddress>

class servermanager : public QObject
{
    Q_OBJECT

public:
    explicit servermanager(QObject *parent = nullptr);

    bool start_server(
        const QHostAddress &address = QHostAddress::LocalHost
        );

    void stop_server();
    quint16 port() const;

private:
    QTcpServer server;

    void accept_connections();
};

#endif // SERVERMANAGER_H