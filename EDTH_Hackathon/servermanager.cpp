#include "servermanager.h"
#include "json_communication.h"

#include <QByteArray>
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
bool servermanager::start_server(
    const QHostAddress &address,
    quint16 listen_port)
{
    if (server.isListening())
        return true;

    if (!server.listen(address, listen_port)) {
        qWarning() << "Serverul nu a pornit:"
                   << server.errorString();
        return false;
    }

    qInfo() << "Server pornit:"
            << server.serverAddress().toString()
            << "port:" << server.serverPort();

    return true;
}
void servermanager::stop_server()
{
    server.close();

    // Copie deoarece disconnect poate modifica setul.
    const QSet<QTcpSocket *> connected_clients = clients;

    for (QTcpSocket *client : connected_clients)
        client->disconnectFromHost();
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

        // Socket-ul va fi distrus impreuna cu managerul.
        client->setParent(this);
        clients.insert(client);

        connect(
            client,
            &QTcpSocket::disconnected,
            this,
            [this, client]() {
                clients.remove(client);
                client->deleteLater();
            }
            );

        qInfo() << "Client conectat:"
                << client->peerAddress().toString();

        emit client_connected(client);
    }
}

bool servermanager::send_json(
    QTcpSocket *client,
    const communication::json &message)
{
    if (!client || !clients.contains(client))
        return false;

    if (client->state() != QAbstractSocket::ConnectedState)
        return false;

    QByteArray payload;

    try {
        const std::string serialized = message.dump();

        payload = QByteArray::fromStdString(serialized);
        payload.append('\n');
    } catch (const communication::json::exception &error) {
        qWarning() << "Serializarea JSON a esuat:" << error.what();
        return false;
    }

    const qint64 queued = client->write(payload);

    if (queued != payload.size()) {
        qWarning() << "Trimiterea JSON a esuat:"
                   << client->errorString();
        return false;
    }

    // Datele au fost puse in bufferul de trimitere.
    // Nu inseamna ca au fost deja primite de client.
    return true;
}

bool servermanager::send_login_response(
    QTcpSocket *client,
    bool accepted)
{
    communication::LoginResponse response{};
    response.accepted = accepted;

    communication::json message = response;
    return send_json(client, message);
}

bool servermanager::send_map_point(
    QTcpSocket *client,
    const communication::MapPoint &point)
{
    communication::json message = point;
    return send_json(client, message);
}

bool servermanager::send_threat(
    QTcpSocket *client,
    const communication::Threat &threat)
{
    communication::json message = threat;
    return send_json(client, message);
}

void servermanager::broadcast_map_point(
    const communication::MapPoint &point)
{
    communication::json message = point;

    const QSet<QTcpSocket *> connected_clients = clients;

    for (QTcpSocket *client : connected_clients)
        send_json(client, message);
}

void servermanager::broadcast_threat(
    const communication::Threat &threat)
{
    communication::json message = threat;

    const QSet<QTcpSocket *> connected_clients = clients;

    for (QTcpSocket *client : connected_clients)
        send_json(client, message);
}

servermanager &servermanager::instance()
{
    static servermanager manager;
    return manager;
}