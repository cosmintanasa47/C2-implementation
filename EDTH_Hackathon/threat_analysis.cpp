#include "threat_analysis.h"
#include "risk_geometry.h"
#include <QDateTime>
#include <algorithm>
#include <vector>
#ifdef EDTH_WITH_OCTAVE_ENABLED
#include "math_functionalities.h"
#endif
namespace {
bool coord(const QVariantMap &m,const QString &key,double &v,double limit) {
 bool ok=false;v=m.value(key).toDouble(&ok);return !m.value(key).isNull()&&ok&&std::isfinite(v)&&std::abs(v)<=limit;
}
qint64 timestamp(const QVariant &v) {return QDateTime::fromString(v.toString(),Qt::ISODateWithMs).toMSecsSinceEpoch();}
}
void add_threat_analysis(QVariantMap &snapshot) {
 QVariantList analyses;
 const auto history=snapshot.value("history").toList(),infra=snapshot.value("infrastructures").toList();
 for(const auto &raw:snapshot.value("threats").toList()) {
  const auto row=raw.toMap();double lat,lon;
  const auto kind=row.value("threat_type").toString().toLower();
  if(row.value("uav_model_id").isNull() && !kind.contains("dron") && !kind.contains("uav") && !kind.contains("uas") && !kind.contains("uas") && !kind.contains("shahed") && !kind.contains("geran") && !kind.contains("fpv"))continue;
  if(row.value("status").toString()=="closed"||!coord(row,"latitude",lat,90)||!coord(row,"longitude",lon,180))continue;
  const qint64 last=timestamp(row.value("last_seen_at"));
  const double age=(QDateTime::currentMSecsSinceEpoch()-last)/1000.0;
  QVariantMap a{{"last_seen_at",row.value("last_seen_at")},{"threat_id",row.value("id")},{"latitude",lat},{"longitude",lon},{"horizon_seconds",30},
                {"stale",!last||age>120||age< -5},{"prediction_available",false},{"risk_level","unknown"}};
  struct Sample {qint64 time;double lat,lon;};std::vector<Sample> samples;
  for(const auto &h:history) {auto m=h.toMap();double x,y;auto t=timestamp(m.value("observed_at"));
   if(m.value("threat_id").toLongLong()==row.value("id").toLongLong() && t<=last && t>=last-120000
      &&coord(m,"latitude",x,90)&&coord(m,"longitude",y,180))samples.push_back({t,x,y});}
  std::sort(samples.begin(),samples.end(),[](const Sample &x,const Sample &y){return x.time<y.time;});
  samples.erase(std::unique(samples.begin(),samples.end(),[](const Sample &x,const Sample &y){return x.time==y.time;}),samples.end());
  a["sample_count"]=int(samples.size());double predlat=lat,predlon=lon;
  if(!a["stale"].toBool() && samples.size()>=3 && samples.back().time-samples.front().time>=1000) {
   try {
#ifdef EDTH_WITH_OCTAVE_ENABLED
    static bool initialized=false;if(!initialized){init_octave();initialized=true;}
    std::vector<double> ts,lats,lons;
    for(auto s:samples){ts.push_back((s.time-last)/1000.0);lats.push_back(s.lat);lons.push_back(s.lon);}
    const auto trend=predict_trend(ts,lats,lons,30);
    // Anchor displacement at the measured position, not the fitted intercept.
    predlat=lat+trend.vlat*30;predlon=lon+trend.vlon*30;
    const auto movement=risk_geometry::project(predlat,predlon,lat,lon);
    if(!std::isfinite(predlat)||!std::isfinite(predlon)||std::abs(predlat)>90||std::abs(predlon)>180||risk_geometry::norm(movement)>9000)
      throw std::runtime_error("invalid trend");
    a["prediction_available"]=true;a["predicted_latitude"]=predlat;a["predicted_longitude"]=predlon;
    a["prediction_method"]="Octave polyfit, 30 s";
#else
    a["prediction_error"]="Modulul Octave este dezactivat";
#endif
   }catch(const std::exception &){a["prediction_error"]="Trend indisponibil sau viteza estimata neverosimila";predlat=lat;predlon=lon;}
  } else a["prediction_error"]=a["stale"].toBool()?"Observatie mai veche de 120 s sau timp invalid":"Necesare minimum 3 observatii recente, cu timpi diferiti";
  double nearest=std::numeric_limits<double>::infinity();QVariantMap selected;std::vector<risk_geometry::Point> selectedPolygon;
  for(const auto &r:infra) {auto m=r.toMap();std::vector<risk_geometry::Point> polygon;bool valid=true;
   for(int i=1;i<=4;++i){double x,y;if(!coord(m,QString("latitude_%1").arg(i),x,90)||!coord(m,QString("longitude_%1").arg(i),y,180)){valid=false;break;}polygon.push_back(risk_geometry::project(x,y,lat,lon));}
   if(!valid)continue;const double dist=risk_geometry::distance({0,0},polygon);
   if(dist<nearest){nearest=dist;selected=m;selectedPolygon=polygon;}}
  if(!selected.isEmpty()) {
   double approach=nearest;auto end=risk_geometry::project(predlat,predlon,lat,lon);
   // One-metre conservative margin for a sampled 30-second path (at most 9000m).
   if(a["prediction_available"].toBool())for(int i=1;i<=9000;++i) approach=std::min(approach,risk_geometry::distance({end.x*i/9000,end.y*i/9000},selectedPolygon));
   a["infrastructure_id"]=selected.value("id");a["infrastructure_name"]=selected.value("infrastructure_name");
   a["distance_m"]=nearest;a["predicted_min_distance_m"]=approach;
   a["risk_level"]=a["stale"].toBool()?"unknown":nearest<=50?"imminent":nearest<=100?"warning":
     a["prediction_available"].toBool()&&approach<=51?"predicted_high":a["prediction_available"].toBool()&&approach<=101?"predicted_warning":"low";
  }
  analyses.append(a);
 }
 snapshot["threat_analysis"]=analyses;
}
