import test from 'node:test';
import assert from 'node:assert/strict';
import {createThreatRiskLayer,riskLabel} from '../dist/threat-risk-layer.js';
const color={withAlpha(){return this;}};
const C={Color:{fromCssColorString:()=>color,YELLOW:color,GRAY:color,WHITE:color,BLACK:color,CYAN:color},Cartesian3:{fromDegrees:(x,y)=>({x,y})},Cartesian2:class{},HeightReference:{CLAMP_TO_GROUND:1},DistanceDisplayCondition:class{},PolylineDashMaterialProperty:class{}};
test('risk layer defaults off, displays 50/100m radii and prediction, clears on logout',()=>{
 const entities=[];const viewer={entities:{add:o=>(entities.push(o),o),remove:o=>entities.splice(entities.indexOf(o),1)},scene:{requestRender(){}}};
 const layer=createThreatRiskLayer(C,viewer);
 try{
 layer.update([{latitude:44,longitude:26,threat_id:1,last_seen_at:new Date().toISOString(),risk_level:'imminent',prediction_available:true,predicted_latitude:44.001,predicted_longitude:26.001}]);
 assert.equal(entities.length,0);layer.setVisible(true);assert.equal(entities.length,5);
 assert.deepEqual(entities.filter(x=>x.ellipse).map(x=>x.ellipse.semiMajorAxis),[100,50]);
 assert.match(entities[0].label.text,/RISC IMINENT/);
 layer.setVisible(false);assert.equal(entities.length,0);layer.setVisible(true);layer.clear();assert.equal(entities.length,0);
 layer.update([{latitude:44,longitude:26,last_seen_at:'2000-01-01T00:00:00Z',risk_level:'imminent'}]);assert.equal(entities.length,1);assert.match(entities[0].label.text,/Date vechi/);
 }finally{layer.destroy();}
});
test('predicted proximity is distinct from imminent and missing data stays unknown',()=>{
 assert.match(riskLabel({risk_level:'predicted_high'}),/estimat/);
 assert.doesNotMatch(riskLabel({risk_level:'predicted_high'}),/IMINENT/);
 assert.match(riskLabel({risk_level:'unknown'}),/indisponibilă/);
});
