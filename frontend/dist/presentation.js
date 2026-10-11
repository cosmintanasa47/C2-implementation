import {createLocalMap} from './cesium-map.js';
import {frame} from './presentation-model.js';
const $=id=>document.getElementById(id);
let viewer,elapsed=0,paused=false,pending=false,last=performance.now();
const C=window.Cesium;
let drone,history,forecast,inner,outer;
const xyz=p=>C.Cartesian3.fromDegrees(p.lon,p.lat,160);
const map=createLocalMap({container:$('map'),initialMode:'2d',onStatus:s=>{$('map-status').textContent=s.message;},onViewerReady:v=>{
 viewer=v;
 drone=v.entities.add({id:'presentation-drone',position:xyz(frame(0).current),point:{pixelSize:18,color:C.Color.RED,outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:'DEMO-TULCEA-01 · SIMULARE',font:'14px sans-serif',fillColor:C.Color.WHITE,showBackground:true,pixelOffset:new C.Cartesian2(0,-30),disableDepthTestDistance:Number.POSITIVE_INFINITY}});
 history=v.entities.add({polyline:{positions:[],width:2,material:C.Color.fromCssColorString('#aebbc9'),clampToGround:true}});
 forecast=v.entities.add({polyline:{positions:[],width:4,material:new C.PolylineDashMaterialProperty({color:C.Color.fromCssColorString('#ff9aaf')}),clampToGround:true}});
 const circle=(r,color)=>v.entities.add({position:xyz(frame(0).current),show:false,ellipse:{semiMajorAxis:r,semiMinorAxis:r,material:C.Color.fromCssColorString(color).withAlpha(.18)}});
 outer=circle(100,'#f7ce58');inner=circle(50,'#ff9aaf');
}});
function center(){const p=frame(elapsed).current;map.flyToPlace({lon:p.lon,lat:p.lat,height:3500});}
function draw(){if(!viewer)return;const f=frame(elapsed);drone.position=xyz(f.current);history.polyline.positions=[...f.history,f.current].map(xyz);forecast.polyline.positions=f.forecast.map(xyz);history.show=$('history').checked;forecast.show=$('forecast').checked;for(const e of [inner,outer]){e.position=xyz(f.current);e.show=$('zones').checked;} $('position').textContent=`${f.current.lat.toFixed(6)}, ${f.current.lon.toFixed(6)}`;$('time').textContent=`${elapsed.toFixed(0)} s`;viewer.scene.requestRender();}
$('center').onclick=center;
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Continuă':'Pauză';};
$('reset').onclick=()=>{elapsed=0;paused=false;last=performance.now();$('pause').textContent='Pauză';$('ack').textContent='Scenariu reluat.';draw();center();};
$('expand').onclick=()=>{const expanded=$('stage').classList.toggle('expanded');$('expand').textContent=expanded?'Revino':'Mărește harta';$('expand').setAttribute('aria-pressed',String(expanded));requestAnimationFrame(()=>map.resize());};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('stage').classList.contains('expanded'))$('expand').click();});
$('engage').onclick=async()=>{if(pending)return;pending=true;$('engage').disabled=true;$('ack').textContent='Se trimite mesajul demo…';try{const response=await fetch('./api/presentation/engage',{method:'POST',headers:{'X-EDTH-Demo':'synthetic-only'},signal:AbortSignal.timeout(5000)});const data=await response.json();if(!response.ok||data.simulation!==true||data.id!=='DEMO-TULCEA-01')throw Error();$('ack').textContent=data.message;}catch{$('ack').textContent='Mesajul nu a fost confirmat. Verifică serverul Node.';}finally{pending=false;$('engage').disabled=false;}};
for(const id of ['history','forecast','zones'])$(id).onchange=draw;
draw();center();
const timer=setInterval(()=>{const now=performance.now();if(!paused)elapsed+=(now-last)/1000;last=now;draw();},200);
window.addEventListener('pagehide',()=>{clearInterval(timer);map.destroy();},{once:true});
