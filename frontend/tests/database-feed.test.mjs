import test from 'node:test';
import assert from 'node:assert/strict';
import {startLive,resetLive,loadDatabaseSnapshot,getSnapshot,updateObservation} from '../dist/data.js';
const data={sensors:[{id:3,nume:'Camera',sensor_type:'camera',latitude:'44.4',longitude:'26.1'}],
 threats:[{id:7,threat_type:'uas',latitude:'44.41',longitude:'26.11',last_seen_at:'2026-10-10T15:00:00Z',status:'review'},
 {id:8,threat_type:'unknown',latitude:null,longitude:null,last_seen_at:'2026-10-10T15:00:00Z',status:'new'}],
 radar:[{id:1,sensor_id:3,drone_id:7,detected_at:'2026-10-10T15:00:00Z'}],
 events:[{id:1,threat_id:7,status:'review',reason:'Checked',username:'operator',time:'2026-10-10T15:00:00Z'}]};
test('SQL snapshot preserves identifiers, radar relations and absent coordinates',async()=>{
 startLive();resetLive();loadDatabaseSnapshot(data);const snapshot=await getSnapshot();
 assert.equal(snapshot.sensors[0].type,'eoir');assert.deepEqual(snapshot.sensors[0].position,{latitude:44.4,longitude:26.1});
 assert.deepEqual(snapshot.observations[0].sensorIds,['DB-SEN-3']);
 assert.equal(snapshot.observations[0].databaseId,'7');assert.equal(snapshot.observations[1].position,null);
 assert.equal(snapshot.observations[0].confidence,null);assert.equal(snapshot.events[0].observationId,'DB-THR-7');
});
test('SQL evaluation persists via API and rejects failures without changing local state',async t=>{
 startLive();resetLive();loadDatabaseSnapshot(data);const saved=globalThis.fetch;
 t.after(()=>{globalThis.fetch=saved;});let sent;
 globalThis.fetch=async(path,options)=>{sent={path,options};return {ok:false,json:async()=>({error:'forbidden'})};};
 await assert.rejects(updateObservation('DB-THR-7','confirmed',{role:'operator'}));
 assert.equal((await getSnapshot()).observations[0].status,'review');
 globalThis.fetch=async(path,options)=>{sent={path,options};return {ok:true,json:async()=>({ok:true})};};
 await updateObservation('DB-THR-7','confirmed',{role:'operator'});
 assert.equal(sent.path,'./api/backend/evaluate');assert.equal(sent.options.credentials,'same-origin');
 assert.equal(JSON.parse(sent.options.body).threat_id,'7');assert.equal((await getSnapshot()).observations[0].status,'confirmed');
});
test('catalog eo_ir and SQL drone models retain their display types',async()=>{
 startLive();resetLive();loadDatabaseSnapshot({sensors:[{id:1,sensor_type:'eo_ir'}],threats:[{id:2,threat_type:'drona',drone_model:'Test model',uav_model_id:9}]});
 const snapshot=await getSnapshot();
 assert.equal(snapshot.sensors[0].type,'eoir');
 assert.equal(snapshot.observations[0].type,'uas');
 assert.equal(snapshot.observations[0].droneType,'Test model');
});
test('old or future radar detections do not mark a sensor active',async()=>{
 for(const stamp of ['2020-01-01T00:00:00Z',new Date(Date.now()+60000).toISOString()]) {
  startLive();resetLive();loadDatabaseSnapshot({...data,radar:[{sensor_id:3,detected_at:stamp}]});
  assert.equal((await getSnapshot()).sensors[0].status,'offline');
 }
 loadDatabaseSnapshot({...data,radar:[{sensor_id:3,detected_at:new Date().toISOString()}]});
 assert.equal((await getSnapshot()).sensors[0].status,'online');
});
