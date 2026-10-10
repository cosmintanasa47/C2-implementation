#ifndef BACKEND_WORKER_H
#define BACKEND_WORKER_H
#include <QObject>
#include <QHash>
#include <QString>
#include <memory>
#include <map>
#include "authentification_service.h"

// Toate operatiile SQL si PBKDF2 ruleaza in acest worker, nu in thread-ul GUI.
class backend_worker : public QObject {
    Q_OBJECT
public slots:
    void process(const QString &connection, const QByteArray &line);
    void remove(const QString &connection);
    void shutdown();
signals:
    void reply(const QString &connection, const QByteArray &line);
private:
    std::map<QString,std::unique_ptr<authentification_service>> sessions;
    QHash<int,int> online_sessions;
    bool database_initialized = false;
    void release(authentification_service &auth);
};
#endif
