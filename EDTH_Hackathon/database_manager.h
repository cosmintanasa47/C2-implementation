#ifndef DATABASE_MANAGER_H
#define DATABASE_MANAGER_H
#include <QSqlError>
#include <QString>
#include <QVariant>
#include <QVariantMap>
#include <QList>
#include <QSqlDatabase>
#include <QSqlQuery>
#include <QtGlobal>

class database_manager
{
public:
    static database_manager &instance();

    database_manager(const database_manager &) = delete;
    database_manager &operator=(const database_manager &) = delete;

    database_manager(database_manager &&) = delete;
    database_manager &operator=(database_manager &&) = delete;

    // Conexiune
    bool connect_database(
        const QString &server,
        const QString &database,
        const QString &username,
        const QString &password,
        const QString &driver = "ODBC Driver 18 for SQL Server",
        bool trust_server_certificate = false
        );

    void disconnect_database();

    bool is_connected() const;
    QString last_error() const;

    // Query-uri parametrizate
    bool execute_query(
        const QString &sql,
        const QVariantMap &parameters = {}
        );

    bool select_query(
        const QString &sql,
        QSqlQuery &result,
        const QVariantMap &parameters = {}
        );

    // Utilizatori
    bool create_user(
        const QString &username,
        const QString &password
        );

    bool get_user(
        const QString &username,
        QVariantMap &user
        );

    bool get_user_roles(
        int user_id,
        QVariantMap &roles
        );

    bool set_user_online(int user_id, bool online);

    // Drone
    bool get_drone(
        qint64 drone_id,
        QVariantMap &drone
        );

    bool get_drones(QList<QVariantMap> &drones);

    bool set_drone_position(
        qint64 drone_id,
        double latitude,
        double longitude,
        double height,
        double speed
        );

    // Senzori
    bool get_sensors(QList<QVariantMap> &sensors);

    bool set_sensor_position(
        qint64 sensor_id,
        double latitude,
        double longitude
        );

    // Imagini si observatii radar
    bool get_sensor_images(
        qint64 sensor_id,
        QList<QVariantMap> &images
        );

    bool get_sensor_radar(
        qint64 sensor_id,
        QList<QVariantMap> &radar_data
        );

    // Zone si infrastructura
    bool get_positions(QList<QVariantMap> &positions);

    bool get_infrastructures(
        QList<QVariantMap> &infrastructures
        );

    // Echipamente
    bool get_ground_defences(QList<QVariantMap> &defences);

    bool set_defence_operational(
        qint64 defence_id,
        bool operational
        );

private:
    database_manager();
    ~database_manager();

    QString connection_name;
    QSqlDatabase db;
    QString error_message;

    bool run_query(
        const QString &sql,
        const QVariantMap &parameters,
        QSqlQuery &query
        );

    bool read_rows(
        const QString &sql,
        const QVariantMap &parameters,
        QList<QVariantMap> &rows
        );

    bool update_existing(
        const QString &sql,
        const QVariantMap &parameters
        );
};

#endif // DATABASE_MANAGER_H