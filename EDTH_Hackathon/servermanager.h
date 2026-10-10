#ifndef SERVERMANAGER_H
#define SERVERMANAGER_H

#include <QObject>
#include <QTcpServer>
#include <QTcpSocket>
#include <QHostAddress>
#include <QSet>
#include <QHash>
#include <QThread>
#include "backend_worker.h"

#include "json_communication.h"

class servermanager : public QObject
{
    Q_OBJECT

public:
    static servermanager &instance();

    bool start_server(const QHostAddress &address, quint16 listen_port);

    servermanager(const servermanager &) = delete;
    servermanager &operator=(const servermanager &) = delete;

    servermanager(servermanager &&) = delete;
    servermanager &operator=(servermanager &&) = delete;

    void stop_server();
    quint16 port() const;

    // Trimite catre un singur client.
    bool send_json(
        QTcpSocket *client,
        const communication::json &message
        );

    bool send_login_response(QTcpSocket *client, bool accepted);

    bool send_map_point(
        QTcpSocket *client,
        const communication::MapPoint &point
        );

    bool send_threat(
        QTcpSocket *client,
        const communication::Threat &threat
        );

    // Trimite catre toti clientii conectati.
    void broadcast_map_point(const communication::MapPoint &point);
    void broadcast_threat(const communication::Threat &threat);

signals:
    void client_connected(QTcpSocket *client);
    void request_received(const QString &connection, const QByteArray &line);
    void connection_closed(const QString &connection);

private:
    explicit servermanager(QObject *parent = nullptr);
    ~servermanager() override;
    QThread worker_thread;
    backend_worker *worker = nullptr;
    QHash<QTcpSocket *,QByteArray> buffers;
    QHash<QTcpSocket *,QString> connection_ids;
    QHash<QString,QTcpSocket *> connection_sockets;
    QHash<QTcpSocket *,int> queued;
    QTcpServer server;
    QSet<QTcpSocket *> clients;
    QSet<QTcpSocket *> authenticated_clients;

    void accept_connections();
};

#endif // SERVERMANAGER_H