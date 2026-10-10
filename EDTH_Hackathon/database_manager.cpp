#include "database_manager.h"
#include "security_helper.h"

#include <QSqlError>
#include <QUuid>

namespace {

QString odbc_value(QString value)
{
    value.replace("}", "}}");
    return "{" + value + "}";
}

}

database_manager::database_manager()
{
    connection_name =
        QUuid::createUuid().toString(QUuid::WithoutBraces);

    db = QSqlDatabase::addDatabase("QODBC", connection_name);
}

database_manager::~database_manager()
{
    disconnect_database();

    db = QSqlDatabase();
    QSqlDatabase::removeDatabase(connection_name);
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
        return false;
    }

    db.close();

    const QString connection_string =
        "DRIVER=" + odbc_value(driver) + ";" +
        "SERVER=" + odbc_value(server) + ";" +
        "DATABASE=" + odbc_value(database) + ";" +
        "Encrypt=yes;" +
        "TrustServerCertificate=" +
        QString(trust_server_certificate ? "yes;" : "no;");

    db.setDatabaseName(connection_string);
    db.setUserName(username);
    db.setPassword(password);

    if (!db.open()) {
        error_message = db.lastError().text();
        return false;
    }

    return true;
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
        error_message = "Baza de date nu este conectata.";
        return false;
    }

    query = QSqlQuery(db);

    if (!query.prepare(sql)) {
        error_message = query.lastError().text();
        return false;
    }

    for (auto it = parameters.constBegin();
         it != parameters.constEnd(); ++it) {
        query.bindValue(it.key(), it.value());
    }

    if (!query.exec()) {
        error_message = query.lastError().text();
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

bool database_manager::create_user(
    const QString &username,
    const QString &password)
{
    error_message.clear();

    if (!is_connected()) {
        error_message = "Baza de date nu este conectata.";
        return false;
    }

    if (username.trimmed().isEmpty() || username.size() > 50) {
        error_message = "Username-ul trebuie sa aiba intre 1 si 50 de caractere.";
        return false;
    }

    if (password.isEmpty()) {
        error_message = "Parola nu poate fi goala.";
        return false;
    }

    security_helper security;

    const std::string salt = security.generate_salt();
    const std::string hash = security.generate_hash(
        password.toUtf8().toStdString(),
        salt
        );

    if (hash.empty()) {
        error_message = "Generarea hash-ului a esuat.";
        return false;
    }

    return execute_query(
        "INSERT INTO Users (username, password_hash, salt) "
        "VALUES (:username, :hash, :salt)",
        {
            {":username", username},
            {":hash", QString::fromStdString(hash)},
            {":salt", QString::fromStdString(salt)}
        }
        );
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
            "FROM Users WHERE username = :username",
            query,
            {{":username", username}})) {
        return false;
    }

    if (!query.next()) {
        error_message = query.lastError().isValid()
        ? query.lastError().text()
        : "Utilizatorul nu exista.";

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