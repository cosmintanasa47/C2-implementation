#include "backend_worker.h"
#include "json_communication.h"

#include <QDebug>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QStringList>

#include <memory>
#include <stdexcept>

using communication::json;

namespace {

QString field(const json &object, const char *name)
{
    const auto it = object.find(name);

    if (it == object.end() || !it->is_string())
        return {};

    return QString::fromStdString(it->get<std::string>());
}

json public_user(const authentification_service &auth)
{
    return {
        {"id", auth.user_id()},
        {"username", auth.username().toStdString()},
        {
            "roles",
            {
                {"viewer", auth.is_viewer()},
                {"engager", auth.is_engager()},
                {"admin", auth.is_admin()}
            }
        }
    };
}

void log_error(const char *operation, QString error)
{
    if (error.trimmed().isEmpty())
        error = "Operatia a esuat fara un mesaj detaliat.";

    // Ascunde credentialele daca apar intr-un mesaj de driver.
    static const QRegularExpression credentials(
        R"((PWD|PASSWORD|UID)\s*=\s*(\{(?:[^}]|}})*\}|[^;]*))",
        QRegularExpression::CaseInsensitiveOption
        );

    error.replace(credentials, "\\1=[ascuns]");

    // SQL Server poate include inceputul valorii trunchiate.
    static const QRegularExpression truncated_value(
        R"(Truncated value:\s*'[^']*')",
        QRegularExpression::CaseInsensitiveOption
        );

    error.replace(truncated_value, "Truncated value: [ascuns]");

    qWarning().noquote()
        << "SQL |" << operation << "|" << error;
}

} // namespace

void backend_worker::release(authentification_service &auth)
{
    if (!auth.is_authenticated())
        return;

    const int user_id = auth.user_id();

    auth.logout(false);

    const int remaining = online_sessions.value(user_id) - 1;

    if (remaining <= 0) {
        online_sessions.remove(user_id);

        auto &database = database_manager::instance();

        if (!database.set_user_online(user_id, false)) {
            log_error(
                "Marcare utilizator offline",
                database.last_error()
                );
        }
    } else {
        online_sessions[user_id] = remaining;
    }
}

void backend_worker::remove(const QString &connection)
{
    const auto it = sessions.find(connection);

    if (it == sessions.end())
        return;

    release(*it->second);
    sessions.erase(it);
}

void backend_worker::shutdown()
{
    for (auto &item : sessions)
        release(*item.second);

    sessions.clear();
    online_sessions.clear();

    database_manager::instance().disconnect_database();

    database_initialized = false;
}

void backend_worker::process(
    const QString &connection,
    const QByteArray &line)
{
    json response = {
        {"ok", false},
        {"accepted", false}
    };

    QString operation = "request";

    const auto send_response = [&]() {
        emit reply(
            connection,
            QByteArray::fromStdString(response.dump()) + '\n'
            );
    };

    try {
        const json message = json::parse(
            line.constData(),
            line.constData() + line.size()
            );

        if (!message.is_object())
            throw std::runtime_error("object expected");

        const QString type = field(message, "type");
        const QString request_id = field(message, "request_id");

        if (request_id.isEmpty() || request_id.size() > 80)
            throw std::runtime_error("request id required");

        operation = type;

        response["request_id"] = request_id.toStdString();
        response["type"] = (type + "_response").toStdString();

        auto &database = database_manager::instance();

        // 1. Conectarea la SQL Server.
        if (!database.connect_from_environment()) {
            log_error(
                "Conectare SQL",
                database.last_error()
                );

            response["error"] = "database_unavailable";
            send_response();
            return;
        }

        // 2. Initializarea starii utilizatorilor.
        if (!database_initialized) {
            if (!database.execute_query(
                    "UPDATE dbo.Users SET is_online = 0")) {
                log_error(
                    "Initializare Users.is_online",
                    database.last_error()
                    );

                response["error"] = "query_failed";
                send_response();
                return;
            }

            database_initialized = true;
        }

        auto &entry = sessions[connection];

        if (!entry) {
            entry = std::make_unique<authentification_service>(
                database
                );
        }

        auto &auth = *entry;

        // 3. Login si creare cont.
        if (type == "login" || type == "register") {
            const QString username =
                field(message, "username").trimmed();

            const QString password =
                field(message, "password");

            static const QRegularExpression allowed_username(
                "^[A-Za-z0-9_.@-]{1,50}$"
                );

            const bool invalid =
                !allowed_username.match(username).hasMatch() ||
                password.isEmpty() ||
                password.toUtf8().size() > 1024 ||
                (type == "register" && password.size() < 8);

            if (invalid) {
                response["error"] = "invalid";
            } else if (auth.is_authenticated()) {
                response["error"] = "already_authenticated";
            } else if (type == "register") {
                // Conturile publice primesc exclusiv rolul Viewer.
                if (database.create_user(username, password)) {
                    response["ok"] = true;
                    qInfo() << "Cont Viewer creat.";
                } else {
                    const QString error = database.last_error();

                    log_error("Creare cont", error);

                    const bool duplicate =
                        error.contains("2601") ||
                        error.contains("2627") ||
                        error.contains(
                            "duplicate",
                            Qt::CaseInsensitive
                            );

                    response["error"] = duplicate
                                            ? "username_exists"
                                            : "registration_failed";
                }
            } else if (auth.login(username, password)) {
                if (database.set_user_online(
                        auth.user_id(), true)) {
                    online_sessions[auth.user_id()]++;

                    response["ok"] = true;
                    response["accepted"] = true;
                    response["user"] = public_user(auth);
                } else {
                    log_error(
                        "Marcare utilizator online",
                        database.last_error()
                        );

                    auth.logout(false);
                    response["error"] = "query_failed";
                }
            } else {
                const QString error = auth.last_error();

                const bool invalid_credentials =
                    error == "Autentificarea nu a reusit.";

                if (!invalid_credentials)
                    log_error("Autentificare", error);

                response["error"] = invalid_credentials
                                        ? "auth_failed"
                                        : "query_failed";
            }
        } else if (type == "logout") {
            // 4. Deconectare.
            release(auth);
            response["ok"] = true;
        } else if (!auth.is_authenticated()) {
            response["error"] = "unauthenticated";
        } else {
            // 5. Verificam rolurile la fiecare operatie protejata.
            QVariantMap roles;

            if (!database.get_user_roles(
                    auth.user_id(), roles)) {
                log_error(
                    "Citire roluri",
                    database.last_error()
                    );

                response["error"] = "query_failed";
            } else {
                const bool viewer =
                    roles.value("viewer").toBool();

                const bool engager =
                    roles.value("engager").toBool();

                const bool admin =
                    roles.value("admin").toBool();

                if (!viewer && !engager && !admin) {
                    response["error"] = "forbidden";
                } else if (type == "snapshot") {
                    QVariantMap data;

                    if (database.get_snapshot(data)) {
                        const QByteArray serialized =
                            QJsonDocument::fromVariant(data)
                                .toJson(QJsonDocument::Compact);

                        response["snapshot"] = json::parse(
                            serialized.constData(),
                            serialized.constData() +
                                serialized.size()
                            );

                        response["ok"] = true;
                    } else {
                        log_error(
                            "Citire snapshot",
                            database.last_error()
                            );

                        response["error"] =
                            "query_failed";
                    }
                } else if (type == "evaluate") {
                    const QString status =
                        field(message, "status");

                    const QString reason =
                        field(message, "reason").trimmed();

                    const QString id_text =
                        field(message, "threat_id");

                    bool valid_id = false;

                    const qint64 threat_id =
                        id_text.toLongLong(&valid_id);

                    const QStringList allowed_statuses = {
                        "review",
                        "confirmed",
                        "closed"
                    };

                    if (!engager && !admin) {
                        response["error"] = "forbidden";
                    } else if (
                        !valid_id ||
                        threat_id <= 0 ||
                        !allowed_statuses.contains(status) ||
                        reason.size() > 1000 ||
                        (status == "closed" && reason.isEmpty())) {
                        response["error"] = "invalid";
                    } else if (database.evaluate_threat(
                                   threat_id,
                                   status,
                                   reason,
                                   auth.user_id())) {
                        response["ok"] = true;
                    } else {
                        log_error(
                            "Evaluare amenintare",
                            database.last_error()
                            );

                        response["error"] =
                            "query_failed";
                    }
                } else {
                    response["error"] = "unsupported";
                }
            }
        }
    } catch (const json::exception &) {
        qWarning() << "Cerere JSON invalida.";
        response["error"] = "invalid";
    } catch (const std::exception &) {
        // Nu afisam continutul cererii, deoarece poate contine parola.
        qWarning() << "Eroare interna la operatia:" << operation;
        response["error"] = "invalid";
    }

    send_response();
}