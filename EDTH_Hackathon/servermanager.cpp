#include "servermanager.h"
#include "json_communication.h"

#include <QByteArray>
#include <QDebug>
#include <QUuid>

servermanager::servermanager(QObject *parent)
    : QObject(parent)
{
    worker = new backend_worker;
    worker->moveToThread(&worker_thread);
    connect(&worker_thread,&QThread::finished,worker,&QObject::deleteLater);
    connect(this,&servermanager::request_received,worker,&backend_worker::process,Qt::QueuedConnection);
    connect(this,&servermanager::connection_closed,worker,&backend_worker::remove,Qt::QueuedConnection);
    connect(worker,&backend_worker::reply,this,[this](const QString &id,const QByteArray &reply) {
        auto *client=connection_sockets.value(id,nullptr);
        if(!client) return;
        queued[client]=qMax(0,queued.value(client)-1);
        if(client->bytesToWrite()>4*1024*1024) {client->abort();return;}
        try {
            const auto data=communication::json::parse(reply.toStdString());
            if(data.value("type",std::string())=="login_response" && data.value("accepted",false)) authenticated_clients.insert(client);
            if(data.value("type",std::string())=="logout_response") authenticated_clients.remove(client);
        } catch(const std::exception &) {}
        client->write(reply);
    });
    worker_thread.start();
    connect(
        &server,
        &QTcpServer::newConnection,
        this,
        &servermanager::accept_connections
        );
}
servermanager::~servermanager() {
    stop_server();

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

    for (QTcpSocket *client : connected_clients) client->abort();
    if(worker_thread.isRunning()) {
        QMetaObject::invokeMethod(worker,"shutdown",Qt::BlockingQueuedConnection);
        worker_thread.quit();worker_thread.wait();
    }
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
        if (clients.size() >= 32) {client->abort();client->deleteLater();continue;}
        client->setParent(this);
        const QString id=QUuid::createUuid().toString(QUuid::WithoutBraces);
        connection_ids.insert(client,id);connection_sockets.insert(id,client);
        connect(client,&QTcpSocket::readyRead,this,[this,client,id]() {
            QByteArray &buffer=buffers[client];buffer+=client->readAll();
            if(buffer.size()>64*1024) {client->abort();return;}
            int newline;
            while((newline=buffer.indexOf('\n'))>=0) {
                const QByteArray line=buffer.left(newline).trimmed();buffer.remove(0,newline+1);
                if(line.isEmpty()) continue;
                if(queued.value(client)>=8) {client->abort();return;}
                queued[client]++;emit request_received(id,line);
            }
        });
        clients.insert(client);

        connect(
            client,
            &QTcpSocket::disconnected,
            this,
            [this, client]() {
                const QString id=connection_ids.take(client);
                connection_sockets.remove(id);buffers.remove(client);queued.remove(client);
                emit connection_closed(id);
                authenticated_clients.remove(client);
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
    if (!client || !clients.contains(client) || !authenticated_clients.contains(client))
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