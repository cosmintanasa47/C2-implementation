#ifndef AUTHENTIFICATION_SERVICE_H
#define AUTHENTIFICATION_SERVICE_H

#include <QString>
#include "database_manager.h"

class authentification_service
{
public:
    explicit authentification_service(database_manager &database);

    bool login(const QString &username, const QString &password);
    bool logout(bool mark_offline = true);

    bool is_authenticated() const;

    int user_id() const;
    QString username() const;

    bool is_viewer() const;
    bool is_engager() const;
    bool is_admin() const;

    QString last_error() const;

private:
    database_manager &database;

    int current_user_id = -1;
    QString current_username;

    bool viewer = false;
    bool engager = false;
    bool admin = false;

    QString error_message;

    void clear_session();
};

#endif // AUTHENTIFICATION_SERVICE_H