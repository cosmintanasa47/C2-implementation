#ifndef SERVERMANAGER_H
#define SERVERMANAGER_H

#include <QObject>
#include <QTcpServer>
#include <QTcpSocket>
#include <QHostAddress>
#include <QSet>

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

private:
    explicit servermanager(QObject *parent = nullptr);
    ~servermanager() override = default;
    QTcpServer server;
    QSet<QTcpSocket *> clients;

    void accept_connections();
};

#endif // SERVERMANAGER_H