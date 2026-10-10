#include "drone_monitor.h"
#include "servermanager.h"

#include <QApplication>

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    const QHostAddress ip("127.0.0.1");
    const quint16 port = 55067;

    auto &server = servermanager::instance();

    if (!server.start_server(ip, port))
        return 1;

    QObject::connect(
        &app,
        &QCoreApplication::aboutToQuit,
        &server,
        &servermanager::stop_server
        );

    drone_monitor window;
    window.show();

    return app.exec();
}