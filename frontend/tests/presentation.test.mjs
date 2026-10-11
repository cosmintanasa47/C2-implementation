import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {frame} from '../dist/presentation-model.js';
import {handlePresentation} from '../server-presentation.mjs';
test('synthetic history and future are ordered and anchored',()=>{
 for(const t of [0,99,2000]){const f=frame(t);assert.equal(f.history.length,100);assert.equal(f.history.at(-1).t,t-1);assert.deepEqual(f.forecast[0],f.current);assert.equal(f.forecast.at(-1).t,t+30);assert.ok(f.history.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)));}
});
test('demo acknowledgement only accepts same-origin explicit demo POST',async()=>{
 const server=createServer((req,res)=>{if(!handlePresentation(req,res))res.writeHead(404).end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
 assert.equal((await fetch(base+'/api/presentation/engage')).status,405);
 assert.equal((await fetch(base+'/api/presentation/engage',{method:'POST'})).status,403);
 const r=await fetch(base+'/api/presentation/engage',{method:'POST',headers:{Origin:base,'X-EDTH-Demo':'synthetic-only'}});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,simulation:true,message:'Engaging — simulation',id:'DEMO-TULCEA-01'});
 }finally{await new Promise(r=>server.close(r));}
});
