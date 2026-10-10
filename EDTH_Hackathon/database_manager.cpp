#include "database_manager.h"
#include "security_helper.h"
#include "sql_hex.h"
#include "threat_analysis.h"

#include <QDebug>
#include <QSqlError>
#include <QSqlQuery>
#include <QSqlRecord>
#include <QUuid>
#include <QStringList>
#include <QRegularExpression>

namespace {

QString odbc_value(QString value)
{
    value.replace("}", "}}");
    return "{" + value + "}";
}

} // namespace

database_manager::database_manager()
{
    connection_name =
        "edth_" + QUuid::createUuid().toString(QUuid::WithoutBraces);

    db = QSqlDatabase::addDatabase("QODBC", connection_name);
}

database_manager::~database_manager()
{
    disconnect_database();

    db = QSqlDatabase();
    QSqlDatabase::removeDatabase(connection_name);
}

database_manager &database_manager::instance()
{
    // Fiecare thread foloseste propria conexiune SQL.
    thread_local database_manager manager;
    return manager;
}

bool database_manager::connect_database(
    const QString &server,
    const QString &database,
    const QString &username,
    const QString &password,
    const QString &driver,
    bool trust_server_certificate)
{
    error_message.clear();

    if (!db.isValid()) {
        error_message = "Driverul Qt QODBC nu este disponibil.";

        qWarning().noquote() << error_message;
        qWarning() << "Drivere Qt disponibile:"
                   << QSqlDatabase::drivers();

        return false;
    }

    if (server.trimmed().isEmpty() ||
        database.trimmed().isEmpty() ||
        username.trimmed().isEmpty() ||
        password.isEmpty()) {
        error_message = "Configuratia SQL este incompleta.";
        qWarning().noquote() << error_message;
        return false;
    }

    db.close();

    const QString connection_string =
        "DRIVER=" + odbc_value(driver) + ";" +
        "SERVER=" + odbc_value(server) + ";" +
        "DATABASE=" + odbc_value(database) + ";" +
        "UID=" + odbc_value(username) + ";" +
        "PWD=" + odbc_value(password) + ";" +
        "Encrypt=no;" +
        "TrustServerCertificate=" +
        QString(trust_server_certificate ? "yes;" : "no;");

    db.setConnectOptions(
        "SQL_ATTR_LOGIN_TIMEOUT=5;"
        "SQL_ATTR_CONNECTION_TIMEOUT=5"
        );

    db.setDatabaseName(connection_string);
    db.setUserName(QString());
    db.setPassword(QString());

    if (!db.open()) {
        error_message = db.lastError().text();

        qWarning().noquote()
            << "Eroare conectare SQL:"
            << error_message;

        return false;
    }

    const QStringList settings = {
        "SET ANSI_NULLS ON",
        "SET QUOTED_IDENTIFIER ON",
        "SET ANSI_PADDING ON",
        "SET ANSI_WARNINGS ON",
        "SET CONCAT_NULL_YIELDS_NULL ON",
        "SET ARITHABORT ON",
        "SET NUMERIC_ROUNDABORT OFF"
    };

    for (const QString &setting : settings) {
        QSqlQuery query(db);

        if (!query.exec(setting)) {
            error_message = query.lastError().text();

            qWarning().noquote()
                << "Eroare configurare sesiune SQL:"
                << error_message;

            db.close();
            return false;
        }
    }

    qInfo() << "Conectare SQL reusita:"
            << server << database;

    return true;
}


bool database_manager::connect_from_environment()
{
    if (is_connected())
        return true;

    const QString server = qEnvironmentVariable(
        "EDTH_DB_SERVER",
        "127.0.0.1,1433"
        );

    const QString database = qEnvironmentVariable(
        "EDTH_DB_NAME",
        "Winner_Drone_Detectio_System"
        );

    const QString username = qEnvironmentVariable(
        "EDTH_DB_USER",
        "sa"
        );

    const QString driver = qEnvironmentVariable(
        "EDTH_DB_DRIVER",
        "ODBC Driver 18 for SQL Server"
        );

    const QString password = qEnvironmentVariable(
        "EDTH_DB_PASSWORD",
        qEnvironmentVariable(
            "SERVICEAUTO_DB_PASSWORD",
            QString()
            )
        );

    const QString trust_setting = qEnvironmentVariable(
                                      "EDTH_DB_TRUST_CERTIFICATE",
                                      "yes"
                                      ).trimmed().toLower();

    const bool trust_certificate =
        trust_setting == "yes" ||
        trust_setting == "true" ||
        trust_setting == "1";

    return connect_database(
        server,
        database,
        username,
        password,
        driver,
        trust_certificate
        );
}

void database_manager::disconnect_database()
{
    if (db.isOpen())
        db.close();
}

bool database_manager::is_connected() const
{
    return db.isValid() && db.isOpen();
}

QString database_manager::last_error() const
{
    return error_message;
}

bool database_manager::run_query(
    const QString &sql,
    const QVariantMap &parameters,
    QSqlQuery &query)
{
    error_message.clear();

    if (!is_connected()) {
        error_message =
            "Baza de date nu este conectata.";

        return false;
    }

    query = QSqlQuery(db);

    if (!query.prepare(sql)) {
        error_message = query.lastError().text();

        qWarning() << "Pregatire SQL esuata; cod:" << query.lastError().nativeErrorCode();

        return false;
    }

    for (auto it = parameters.constBegin();
         it != parameters.constEnd();
         ++it) {
        query.bindValue(it.key(), it.value());
    }

    if (!query.exec()) {
        error_message = query.lastError().text();

        qWarning() << "Interogare SQL esuata; cod:" << query.lastError().nativeErrorCode();

        if (query.lastError().type() ==
            QSqlError::ConnectionError) {
            db.close();
        }

        return false;
    }

    return true;
}

bool database_manager::execute_query(
    const QString &sql,
    const QVariantMap &parameters)
{
    QSqlQuery query(db);
    return run_query(sql, parameters, query);
}

bool database_manager::select_query(
    const QString &sql,
    QSqlQuery &result,
    const QVariantMap &parameters)
{
    return run_query(sql, parameters, result);
}

bool database_manager::create_user(const QString &username, const QString &password)
{
    error_message.clear();
    if (!is_connected()) { error_message = "Baza de date nu este conectata."; return false; }
    const QString name = username.trimmed();
    static const QRegularExpression allowed("^[A-Za-z0-9_.@-]{1,50}$");
    if (!allowed.match(name).hasMatch() || password.size() < 8 || password.toUtf8().size() > 1024) {
        error_message = "Date de inregistrare invalide."; return false;
    }
    security_helper security;
    const auto rawSalt = security.generate_salt();
    const auto rawHash = security.generate_hash(password.toUtf8().toStdString(), rawSalt);
    const QString salt = QString::fromStdString(rawSalt), hash = QString::fromStdString(rawHash);
    QString saltSql, hashSql;
    try { saltSql = sql_hex64(salt); hashSql = sql_hex64(hash); }
    catch (const std::exception &) { error_message = "Generarea credentialelor a esuat."; return false; }

    if (!db.transaction()) { error_message = db.lastError().text(); return false; }
    int id = -1;
    bool ok = false;
    {
        QSqlQuery query(db);
        // Username remains a parameter. The other fragments accept only 64 hex
        // characters and are decoded by SQL Server, avoiding QODBC inference.
        const QString sql = "INSERT INTO dbo.Users(username,password_hash,salt) "
                            "OUTPUT INSERTED.id VALUES (?," + hashSql + "," + saltSql + ")";
        if (!query.prepare(sql)) error_message = query.lastError().text();
        else {
            query.addBindValue(name);
            if (!query.exec()) error_message = query.lastError().text();
            else if (!query.next()) error_message = "INSERT nu a returnat ID-ul.";
            else { id = query.value(0).toInt(); ok = true; }
        }
        query.finish();
    }
    // Read back the stored credentials BEFORE commit. Never accept truncated or
    // transformed credentials, and never print their contents.
    if (ok) {
        QSqlQuery check(db);
        ok = run_query("SELECT password_hash,salt FROM dbo.Users WHERE id=:id", {{":id", id}}, check);
        if (ok) {
            ok = check.next() && check.value(0).toString() == hash && check.value(1).toString() == salt;
            if (!ok) error_message = "Credentialele citite difera de cele generate; tranzactia a fost anulata.";
        }
        check.finish();
    }
    if (ok) ok = execute_query("INSERT INTO dbo.User_Viewer(user_id) VALUES(:id)", {{":id", id}});
    if (ok && db.commit()) { qInfo() << "Cont Viewer creat. ID:" << id; return true; }
    if (ok) error_message = db.lastError().text();
    const QString saved = error_message;
    db.rollback(); error_message = saved;
    return false;
}

bool database_manager::get_user(
    const QString &username,
    QVariantMap &user)
{
    user.clear();

    QSqlQuery query(db);

    if (!select_query(
            "SELECT id, username, password_hash, salt, "
            "is_online, created_at "
            "FROM dbo.Users "
            "WHERE username = :username",
            query,
            {{":username", username.trimmed()}})) {
        return false;
    }

    if (!query.next()) {
        error_message =
            query.lastError().isValid()
                ? query.lastError().text()
                : QString("user_not_found");

        return false;
    }

    user.insert("id", query.value(0));
    user.insert("username", query.value(1));
    user.insert("password_hash", query.value(2));
    user.insert("salt", query.value(3));
    user.insert("is_online", query.value(4));
    user.insert("created_at", query.value(5));

    return true;
}

bool database_manager::get_user_roles(
    int id,
    QVariantMap &roles)
{
    roles.clear();

    QSqlQuery query(db);

    const QString sql =
        "SELECT "
        "CASE WHEN EXISTS ("
        " SELECT 1 FROM dbo.User_Viewer "
        " WHERE user_id = u.id"
        ") THEN 1 ELSE 0 END, "
        "CASE WHEN EXISTS ("
        " SELECT 1 FROM dbo.User_Engager "
        " WHERE user_id = u.id"
        ") THEN 1 ELSE 0 END, "
        "CASE WHEN EXISTS ("
        " SELECT 1 FROM dbo.User_Admin "
        " WHERE user_id = u.id"
        ") THEN 1 ELSE 0 END "
        "FROM dbo.Users u "
        "WHERE u.id = :id";

    if (!select_query(sql, query, {{":id", id}}))
        return false;

    if (!query.next()) {
        error_message =
            query.lastError().isValid()
                ? query.lastError().text()
                : QString("user_not_found");

        return false;
    }

    roles = {
        {"viewer", query.value(0).toBool()},
        {"engager", query.value(1).toBool()},
        {"admin", query.value(2).toBool()}
    };

    return true;
}

bool database_manager::set_user_online(
    int id,
    bool online)
{
    return execute_query(
        "UPDATE dbo.Users "
        "SET is_online = :online "
        "WHERE id = :id",
        {
            {":online", online},
            {":id", id}
        }
        );
}

bool database_manager::read_rows(
    const QString &sql,
    const QVariantMap &parameters,
    QList<QVariantMap> &rows)
{
    rows.clear();

    QSqlQuery query(db);

    if (!select_query(sql, query, parameters))
        return false;

    const QSqlRecord record = query.record();

    while (query.next()) {
        QVariantMap row;

        for (int i = 0; i < record.count(); ++i) {
            row.insert(
                record.fieldName(i),
                query.value(i)
                );
        }

        rows.append(row);
    }

    if (query.lastError().isValid()) {
        error_message = query.lastError().text();

        qWarning().noquote()
            << "Eroare citire rezultate SQL:"
            << error_message;

        return false;
    }

    return true;
}

bool database_manager::update_existing(
    const QString &sql,
    const QVariantMap &parameters)
{
    QSqlQuery query(db);

    if (!run_query(sql, parameters, query))
        return false;

    if (query.numRowsAffected() == 0) {
        error_message =
            "Inregistrarea nu exista.";

        return false;
    }

    return true;
}

bool database_manager::get_snapshot(
    QVariantMap &snapshot)
{
    snapshot.clear();

    const QList<QPair<QString, QString>> queries = {
        {
            "sensors",
            "SELECT id, nume, sensor_type, description, "
            "latitude, longitude "
            "FROM dbo.Sensor"
        },
        {
            "threats",
            "SELECT t.id, t.threat_type, t.uav_model_id, "
            "u.model_name AS drone_model, "
            "t.latitude, t.longitude, t.height, t.speed, "
            "CONVERT(varchar(33), t.last_seen_at, 126) "
            "+ 'Z' AS last_seen_at, "
            "COALESCE(e.status, 'new') AS status, "
            "COALESCE(e.reason, '') AS reason "
            "FROM dbo.Threat t "
            "LEFT JOIN dbo.Threat_Evaluation e "
            "ON e.threat_id = t.id "
            "LEFT JOIN dbo.UAV_Model u "
            "ON u.id = t.uav_model_id"
        },
        {
            "radar",
            "SELECT id, sensor_id, drone_id, "
            "latitude, longitude, height, speed, "
            "CONVERT(varchar(33), detected_at, 126) "
            "+ 'Z' AS detected_at "
            "FROM dbo.Input_radar"
        },
        {
            "infrastructures",
            "SELECT * FROM dbo.Critical_infrastructure"
        },
        {
            "defences",
            "SELECT * FROM dbo.Ground_defence"
        },
        {
            "positions",
            "SELECT * FROM dbo.Position"
        },
        {
            "events",
            "SELECT TOP (200) "
            "a.id, a.threat_id, a.status, a.reason, "
            "u.username, "
            "CONVERT(varchar(33), a.created_at, 126) "
            "+ 'Z' AS time "
            "FROM dbo.Evaluation_Audit a "
            "JOIN dbo.Users u ON u.id = a.user_id "
            "ORDER BY a.id DESC"
        }
    };

    for (const auto &item : queries) {
        QList<QVariantMap> rows;

        if (!read_rows(item.second, {}, rows))
            return false;

        QVariantList list;

        for (const auto &row : rows)
            list.append(row);

        snapshot.insert(item.first, list);
    }

    const QString history_sql =
        "WITH h AS ("
        " SELECT threat_id, latitude, longitude, observed_at, "
        " ROW_NUMBER() OVER ("
        "  PARTITION BY threat_id "
        "  ORDER BY observed_at DESC"
        " ) AS rn "
        " FROM dbo.Threat_Position_History "
        " WHERE observed_at >= "
        " DATEADD(second, -240, SYSUTCDATETIME())"
        ") "
        "SELECT threat_id, latitude, longitude, "
        "CONVERT(varchar(33), observed_at, 126) "
        "+ 'Z' AS observed_at "
        "FROM h "
        "WHERE rn <= 20";

    QList<QVariantMap> history;

    if (!read_rows(history_sql, {}, history))
        return false;

    QVariantList history_list;

    for (const auto &row : history)
        history_list.append(row);

    snapshot.insert("history", history_list);

    add_threat_analysis(snapshot);

    return true;
}

bool database_manager::evaluate_threat(
    qint64 id,
    const QString &status,
    const QString &reason,
    int user_id)
{
    if (!is_connected()) {
        error_message =
            "Baza de date nu este conectata.";

        return false;
    }

    if (!db.transaction()) {
        error_message = db.lastError().text();
        return false;
    }

    const QVariantMap values = {
        {":id", id},
        {":status", status},
        {":reason", reason},
        {":user", user_id}
    };

    bool success = false;

    {
        QSqlQuery query(db);

        success = run_query(
            "UPDATE dbo.Threat_Evaluation "
            "WITH (UPDLOCK, HOLDLOCK) "
            "SET status = :status, "
            "reason = :reason, "
            "user_id = :user, "
            "updated_at = SYSUTCDATETIME() "
            "WHERE threat_id = :id",
            values,
            query
            );

        const qint64 count = query.numRowsAffected();
        query.finish();

        if (success && count == 0) {
            success = execute_query(
                "INSERT INTO dbo.Threat_Evaluation "
                "(threat_id, status, reason, user_id) "
                "VALUES (:id, :status, :reason, :user)",
                values
                );
        }
    }

    if (success) {
        success = execute_query(
            "INSERT INTO dbo.Evaluation_Audit "
            "(threat_id, status, reason, user_id) "
            "VALUES (:id, :status, :reason, :user)",
            values
            );
    }

    if (success) {
        if (db.commit())
            return true;

        error_message = db.lastError().text();
    }

    const QString saved_error = error_message;
    db.rollback();
    error_message = saved_error;

    return false;
}

bool database_manager::get_drones(
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Threat",
        {},
        rows
        );
}

bool database_manager::get_drone(
    qint64 id,
    QVariantMap &row)
{
    row.clear();

    QList<QVariantMap> rows;

    if (!read_rows(
            "SELECT * FROM dbo.Threat WHERE id = :id",
            {{":id", id}},
            rows)) {
        return false;
    }

    if (rows.isEmpty()) {
        error_message = "Drona nu exista.";
        return false;
    }

    row = rows.first();
    return true;
}

bool database_manager::set_drone_position(
    qint64 id,
    double lat,
    double lon,
    double height,
    double speed)
{
    return update_existing(
        "UPDATE dbo.Threat "
        "SET latitude = :lat, "
        "longitude = :lon, "
        "height = :height, "
        "speed = :speed, "
        "last_seen_at = SYSUTCDATETIME() "
        "WHERE id = :id",
        {
            {":id", id},
            {":lat", lat},
            {":lon", lon},
            {":height", height},
            {":speed", speed}
        }
        );
}

bool database_manager::get_sensors(
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Sensor",
        {},
        rows
        );
}

bool database_manager::set_sensor_position(
    qint64 id,
    double lat,
    double lon)
{
    return update_existing(
        "UPDATE dbo.Sensor "
        "SET latitude = :lat, longitude = :lon "
        "WHERE id = :id",
        {
            {":id", id},
            {":lat", lat},
            {":lon", lon}
        }
        );
}

bool database_manager::get_sensor_images(
    qint64 id,
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Input_images "
        "WHERE sensor_id = :id",
        {{":id", id}},
        rows
        );
}

bool database_manager::get_sensor_radar(
    qint64 id,
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Input_radar "
        "WHERE sensor_id = :id",
        {{":id", id}},
        rows
        );
}

bool database_manager::get_positions(
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Position",
        {},
        rows
        );
}

bool database_manager::get_infrastructures(
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Critical_infrastructure",
        {},
        rows
        );
}

bool database_manager::get_ground_defences(
    QList<QVariantMap> &rows)
{
    return read_rows(
        "SELECT * FROM dbo.Ground_defence",
        {},
        rows
        );
}

bool database_manager::set_defence_operational(
    qint64 id,
    bool operational)
{
    return update_existing(
        "UPDATE dbo.Ground_defence "
        "SET operational = :operational "
        "WHERE id = :id",
        {
            {":id", id},
            {":operational", operational}
        }
        );
}