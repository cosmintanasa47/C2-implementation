#include "drone_monitor.h"

#include <QApplication>

int main(int argc, char *argv[])
{
    QApplication a(argc, argv);
    drone_monitor w;
    w.show();
    return QCoreApplication::exec();
}
