#include "servermanager.h"
#include "database_manager.h"
#include "sql_hex.h"
#include <QApplication>
#include <QCoreApplication>
#include <QInputDialog>
#include <QLineEdit>
#include <QSqlError>
#include <QDebug>
#include <memory>
#include <cstring>

// Uses a temporary table: no accounts or production rows are created.
static bool check_database()
{
    auto &database = database_manager::instance();
    if (!database.connect_from_environment()) {
        qCritical().noquote() << database.last_error();
        return false;
    }
    QSqlQuery schema;
    if (!database.select_query(
            "SELECT COL_LENGTH('dbo.Users','salt'), COL_LENGTH('dbo.Users','password_hash'), "
            "OBJECT_ID('dbo.User_Viewer'), OBJECT_ID('dbo.User_Admin'), "
            "OBJECT_ID('dbo.Threat_Evaluation'), OBJECT_ID('dbo.Threat_Position_History')", schema)) {
        qCritical() << "Nu pot verifica schema SQL.";
        return false;
    }
    if (!schema.next() || (schema.value(0).toInt() != -1 && schema.value(0).toInt() < 64) ||
        (schema.value(1).toInt() != -1 && schema.value(1).toInt() < 64) ||
        schema.value(2).isNull() || schema.value(3).isNull() ||
        schema.value(4).isNull() || schema.value(5).isNull()) {
        qCritical() << "Schema incompleta. Ruleaza scripts/import-database.sh.";
        return false;
    }
    schema.finish();
    const QString hex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    bool ok = database.execute_query("CREATE TABLE #edth_auth_probe (username varchar(50), salt varchar(64), password_hash varchar(256))");
    if (ok) ok = database.execute_query(
        "INSERT INTO #edth_auth_probe VALUES (:name," + sql_hex64(hex) + "," + sql_hex64(hex) + ")",
        {{":name", QString("edth_probe")}});
    QSqlQuery result;
    if (ok) ok = database.select_query("SELECT username,salt,password_hash FROM #edth_auth_probe", result);
    if (ok) ok = result.next() && result.value(0).toString() == "edth_probe" &&
        result.value(1).toString() == hex && result.value(2).toString() == hex;
    result.finish();
    database.execute_query("DROP TABLE IF EXISTS #edth_auth_probe");
    qInfo() << (ok ? "SQL CHECK OK: conexiune, schema si transfer hex de 64 caractere." : "SQL CHECK FAILED: transferul ODBC nu pastreaza valorile.");
    database.disconnect_database();
    return ok;
}

int main(int argc, char *argv[])
{
    bool check = false, headless = false;
    for (int i = 1; i < argc; ++i) {
        check |= std::strcmp(argv[i], "--check-db") == 0;
        headless |= std::strcmp(argv[i], "--headless") == 0;
    }
    headless |= check;
#ifdef Q_OS_LINUX
    headless |= qEnvironmentVariableIsEmpty("DISPLAY") && qEnvironmentVariableIsEmpty("WAYLAND_DISPLAY");
#endif
    std::unique_ptr<QCoreApplication> app;
    if (headless) app = std::make_unique<QCoreApplication>(argc, argv);
    else {
        app = std::make_unique<QApplication>(argc, argv);
        QApplication::setQuitOnLastWindowClosed(false);
    }
    qInfo().noquote() << "EDTH fixed | Executabil:" << QCoreApplication::applicationFilePath();
    if (qEnvironmentVariableIsEmpty("EDTH_DB_PASSWORD") && qEnvironmentVariableIsEmpty("SERVICEAUTO_DB_PASSWORD")) {
        if (headless) {
            qCritical() << "Lipseste EDTH_DB_PASSWORD. Porneste prin scripts/run-backend.sh.";
            return 1;
        }
        bool accepted = false;
        const QString password = QInputDialog::getText(nullptr, "SQL Server", "Parola SQL Server (nu parola contului web):", QLineEdit::Password, {}, &accepted);
        if (!accepted || password.isEmpty()) return 1;
        qputenv("EDTH_DB_PASSWORD", password.toUtf8());
    }
    if (check) return check_database() ? 0 : 2;
    bool valid = false;
    const uint configured = qEnvironmentVariable("EDTH_TCP_PORT", "55067").toUInt(&valid);
    if (!valid || configured == 0 || configured > 65535) { qCritical() << "EDTH_TCP_PORT invalid"; return 1; }
    auto &server = servermanager::instance();
    if (!server.start_server(QHostAddress("127.0.0.1"), static_cast<quint16>(configured))) return 1;
    QObject::connect(app.get(), &QCoreApplication::aboutToQuit, &server, &servermanager::stop_server);
    return app->exec();
}
