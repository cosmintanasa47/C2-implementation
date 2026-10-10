const position = row => Number.isFinite(row.latitude) && Math.abs(row.latitude)<=90 && Number.isFinite(row.longitude) && Math.abs(row.longitude)<=180;
export function riskLabel(row) {
 if(row.stale)return 'Date vechi · risc necunoscut';
 return ({imminent:'RISC IMINENT · prag 50 m',warning:'Avertizare · prag 100 m',predicted_high:'Risc estimat în următoarele 30 s',predicted_warning:'Avertizare estimată în următoarele 30 s',low:'Risc de proximitate scăzut',unknown:'Infrastructură indisponibilă'})[row.risk_level]||'Risc necunoscut';
}
export function createThreatRiskLayer(C, viewer) {
 let enabled=false,rows=[],entities=[];
 const clear=()=>{for(const e of entities)viewer.entities.remove(e);entities=[];viewer.scene.requestRender();};
 const add=o=>entities.push(viewer.entities.add(o));
 function render(){
  clear();if(!enabled)return;
  for(const original of rows){const age=(Date.now()-Date.parse(original.last_seen_at))/1000;const row={...original,stale:original.stale||!Number.isFinite(age)||age>120||age< -5};if(row.stale)row.prediction_available=false;if(!position(row))continue;
   const center=C.Cartesian3.fromDegrees(row.longitude,row.latitude), red=C.Color.fromCssColorString('#ff304f'),yellow=C.Color.YELLOW;
   const text=`Dronă #${row.threat_id} · ${riskLabel(row)}\n${row.infrastructure_name||'Fără infrastructură cartată'}${Number.isFinite(row.distance_m)?` · ${Math.round(row.distance_m)} m`:''}\n${row.prediction_available?'Trend liniar +30 s':row.prediction_error||'Trend indisponibil'}\nZone orientative: roșu 50 m / galben 100 m`;
   add({position:center,point:{pixelSize:13,color:row.stale?C.Color.GRAY:red,outlineColor:C.Color.WHITE,outlineWidth:2,heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity},label:{text,font:'12px sans-serif',showBackground:true,backgroundColor:C.Color.BLACK.withAlpha(.8),pixelOffset:new C.Cartesian2(0,-30),heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity,distanceDisplayCondition:new C.DistanceDisplayCondition(0,30000)}});
   if(!row.stale){
    add({position:center,ellipse:{semiMajorAxis:100,semiMinorAxis:100,material:yellow.withAlpha(.2)}});
    add({position:center,ellipse:{semiMajorAxis:50,semiMinorAxis:50,material:red.withAlpha(.38)}});
   }
   if(row.prediction_available&&position({latitude:row.predicted_latitude,longitude:row.predicted_longitude})){
    const future=C.Cartesian3.fromDegrees(row.predicted_longitude,row.predicted_latitude);
    add({polyline:{positions:[center,future],width:3,material:new C.PolylineDashMaterialProperty({color:C.Color.CYAN}),clampToGround:true}});
    add({position:future,point:{pixelSize:7,color:C.Color.CYAN,heightReference:C.HeightReference.CLAMP_TO_GROUND},label:{text:'Estimare +30 s',font:'11px sans-serif',pixelOffset:new C.Cartesian2(0,-16),heightReference:C.HeightReference.CLAMP_TO_GROUND}});
   }
  }
 }
 const timer=setInterval(()=>{if(enabled)render();},10000);
 return {setVisible(value){enabled=Boolean(value);render();},update(value){rows=Array.isArray(value)?value:[];render();},clear(){rows=[];clear();},destroy(){clearInterval(timer);clear();}};
}
