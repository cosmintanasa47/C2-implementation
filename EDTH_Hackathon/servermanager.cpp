#include "servermanager.h"

#include <QDebug>

servermanager::servermanager(QObject *parent)
    : QObject(parent)
{
    connect(
        &server,
        &QTcpServer::newConnection,
        this,
        &servermanager::accept_connections
        );
}

bool servermanager::start_server(const QHostAddress &address)
{
    if (server.isListening())
        return true;

    // Portul 0 cere sistemului de operare un port liber.
    if (!server.listen(address, 0)) {
        qWarning() << "Pornirea serverului a esuat:"
                   << server.errorString();

        return false;
    }

    qInfo() << "Server pornit pe"
            << server.serverAddress().toString()
            << "port" << server.serverPort();

    return true;
}

void servermanager::stop_server()
{
    // Opreste acceptarea conexiunilor noi.
    // Conexiunile deja acceptate raman deschise.
    server.close();
}

quint16 servermanager::port() const
{
    return server.serverPort();
}

void servermanager::accept_connections()
{
    while (server.hasPendingConnections()) {
        QTcpSocket *client = server.nextPendingConnection();

        if (!client)
            continue;

        qInfo() << "Client conectat:"
                << client->peerAddress().toString()
                << client->peerPort();

        connect(
            client,
            &QTcpSocket::readyRead,
            this,
            [client]() {
                const QByteArray received = client->readAll();

                // Aici vei procesa ulterior mesajele.
                qInfo() << "Octeti primiti:" << received.size();
            }
            );

        connect(
            client,
            &QTcpSocket::disconnected,
            client,
            &QObject::deleteLater
            );
    }
}