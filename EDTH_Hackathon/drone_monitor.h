#ifndef DRONE_MONITOR_H
#define DRONE_MONITOR_H

#include <QMainWindow>

QT_BEGIN_NAMESPACE
namespace Ui {
class drone_monitor;
}
QT_END_NAMESPACE

class drone_monitor : public QMainWindow
{
    Q_OBJECT

public:
    explicit drone_monitor(QWidget *parent = nullptr);
    ~drone_monitor() override;

private slots:
    void on_pushButton_clicked();

private:
    Ui::drone_monitor *ui;
};
#endif // DRONE_MONITOR_H
