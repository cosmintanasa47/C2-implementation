#pragma once
#include <cmath>
#include <vector>
#include <limits>
namespace risk_geometry {
struct Point {double x,y;};
inline double norm(Point a) {return std::hypot(a.x,a.y);}
inline Point project(double lat,double lon,double lat0,double lon0) {
 return {(lon-lon0)*0.017453292519943295*6371000*std::cos(lat0*0.017453292519943295),
         (lat-lat0)*0.017453292519943295*6371000};
}
inline Point closest(Point p,Point a,Point b) {
 double dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
 double u=d>0?((p.x-a.x)*dx+(p.y-a.y)*dy)/d:0;
 u=std::fmax(0,std::fmin(1,u));return {a.x+u*dx,a.y+u*dy};
}
inline double distance(Point p,const std::vector<Point>& polygon) {
 if(polygon.empty()) return std::numeric_limits<double>::infinity();
 bool inside=false; double best=std::numeric_limits<double>::infinity();
 for(size_t i=0,j=polygon.size()-1;i<polygon.size();j=i++) {
  auto a=polygon[j],b=polygon[i];auto q=closest(p,a,b);best=std::fmin(best,std::hypot(q.x-p.x,q.y-p.y));
  if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
 }
 return inside?0:best;
}
}
