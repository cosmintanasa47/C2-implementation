#include "drone_monitor.h"
#include "./ui_drone_monitor.h"

drone_monitor::drone_monitor(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::drone_monitor)
{
    ui->setupUi(this);
}

drone_monitor::~drone_monitor()
{
    delete ui;
}

void drone_monitor::on_pushButton_clicked()
{

}

