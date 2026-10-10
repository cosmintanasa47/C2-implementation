#include "authentification_service.h"
#include "security_helper.h"

#include <QSqlQuery>
#include <QVariantMap>

authentification_service::authentification_service(
    database_manager &database)
    : database(database)
{
}

void authentification_service::clear_session()
{
    current_user_id = -1;
    current_username.clear();

    viewer = false;
    engager = false;
    admin = false;
}

bool authentification_service::login(
    const QString &username,
    const QString &password)
{
    error_message.clear();

    // O instanta gestioneaza o singura sesiune.
    if (is_authenticated()) {
        error_message = "Exista deja un utilizator autentificat.";
        return false;
    }

    if (username.isEmpty() || password.isEmpty()) {
        error_message = "Completeaza username-ul si parola.";
        return false;
    }

    QVariantMap user;

    if (!database.get_user(username, user)) {
        error_message = database.last_error() == "user_not_found"
            ? "Autentificarea nu a reusit." : "Citirea utilizatorului a esuat: " + database.last_error();
        return false;
    }

    security_helper security;

    const bool valid_password = security.verify_hashed_password(
        user.value("password_hash").toString().toStdString(),
        user.value("salt").toString().toStdString(),
        password.toUtf8().toStdString()
        );

    if (!valid_password) {
        error_message = "Autentificarea nu a reusit.";
        return false;
    }

    const int id = user.value("id").toInt();

    bool has_viewer = false;
    bool has_engager = false;
    bool has_admin = false;

    QVariantMap roles;
    if (!database.get_user_roles(id, roles)) {
        error_message = "Citirea rolurilor a esuat.";
        return false;
    }
    has_viewer = roles.value("viewer").toBool();
    has_engager = roles.value("engager").toBool();
    has_admin = roles.value("admin").toBool();

    if (!has_viewer && !has_engager && !has_admin) {
        error_message = "Utilizatorul nu are un rol atribuit.";
        return false;
    }

    current_user_id = id;
    current_username = user.value("username").toString();

    viewer = has_viewer;
    engager = has_engager;
    admin = has_admin;

    return true;
}

bool authentification_service::logout(bool mark_offline)
{
    error_message.clear();

    bool success = true;

    if (is_authenticated() && mark_offline) {
        success = database.execute_query(
            "UPDATE Users SET is_online = 0 WHERE id = :id",
            {{":id", current_user_id}}
            );

        if (!success)
            error_message = "Actualizarea starii offline a esuat.";
    }

    // Sesiunea locala se inchide chiar daca baza de date nu raspunde.
    clear_session();

    return success;
}

bool authentification_service::is_authenticated() const
{
    return current_user_id != -1;
}

int authentification_service::user_id() const
{
    return current_user_id;
}

QString authentification_service::username() const
{
    return current_username;
}

bool authentification_service::is_viewer() const
{
    return is_authenticated() && viewer;
}

bool authentification_service::is_engager() const
{
    return is_authenticated() && engager;
}

bool authentification_service::is_admin() const
{
    return is_authenticated() && admin;
}

QString authentification_service::last_error() const
{
    return error_message;
}