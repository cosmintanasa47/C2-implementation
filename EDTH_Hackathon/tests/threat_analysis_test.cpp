#include "threat_analysis.h"
#include <QCoreApplication>
#include <QThread>
#include <QDateTime>
#include <cmath>
#include <iostream>

static int verify()
{
    const auto now = QDateTime::currentDateTimeUtc();
    QVariantMap row{{"id",1},{"threat_type","uas"},{"latitude",44.0},{"longitude",26.0},
                    {"last_seen_at",now.toString(Qt::ISODateWithMs)},{"status","new"}};
    QVariantMap infra{{"id",2},{"infrastructure_name","Test"}};
    const double xs[4]={43.9999,43.9999,44.0001,44.0001},ys[4]={25.9999,26.0001,26.0001,25.9999};
    for(int i=0;i<4;++i) {infra[QString("latitude_%1").arg(i+1)]=xs[i];infra[QString("longitude_%1").arg(i+1)]=ys[i];}
    QVariantList history;
    for(int i=-2;i<=0;++i) history.append(QVariantMap{{"threat_id",1},{"latitude",44.0+i*0.0001},{"longitude",26.0},
        {"observed_at",now.addSecs(i*10).toString(Qt::ISODateWithMs)}});
    QVariantMap snapshot{{"threats",QVariantList{row}},{"infrastructures",QVariantList{infra}},{"history",history}};
    add_threat_analysis(snapshot);
    const auto analyses=snapshot.value("threat_analysis").toList();
    if(analyses.size()!=1) return 1;
    const auto a=analyses.first().toMap();
    if(a.value("risk_level").toString()!="imminent" || a.value("distance_m").toDouble()!=0) return 2;
#ifdef EDTH_WITH_OCTAVE_ENABLED
    if(!a.value("prediction_available").toBool() || std::abs(a.value("predicted_latitude").toDouble()-44.0003)>1e-8) return 3;
#else
    if(a.value("prediction_available").toBool()) return 3;
#endif
    row["last_seen_at"]=now.addSecs(-121).toString(Qt::ISODateWithMs);
    snapshot["threats"]=QVariantList{row};add_threat_analysis(snapshot);
    const auto stale=snapshot.value("threat_analysis").toList().first().toMap();
    if(stale.value("risk_level").toString()!="unknown" || stale.value("prediction_available").toBool())return 4;
    row["status"]="closed";snapshot["threats"]=QVariantList{row};add_threat_analysis(snapshot);
    if(!snapshot.value("threat_analysis").toList().isEmpty())return 5;
    return 0;
}
int main(int argc,char **argv)
{
    QCoreApplication app(argc,argv);
    int result=99;
    // Match the backend: Octave is called on its database worker thread.
    QThread *worker=QThread::create([&]{ result=verify(); });
    worker->start();worker->wait();delete worker;
    std::cout<<"Threat analysis test result: "<<result<<'\n';
    return result;
}
