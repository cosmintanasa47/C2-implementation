import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import {once} from 'node:events';
import {createAuthBridge} from '../server-auth.mjs';
async function setup(t,{now,ttl,backendError}={}){
 const users=new Map(),received=[],sockets=new Set();
 const tcp=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let buf='',user=null;
  socket.on('data',chunk=>{buf+=chunk;let n;while((n=buf.indexOf('\n'))>=0){
   const m=JSON.parse(buf.slice(0,n));buf=buf.slice(n+1);received.push(m);
   const r={type:`${m.type}_response`,request_id:m.request_id,ok:false};
   if(backendError){r.error=backendError;}
   else if(m.type==='register'){if(users.has(m.username))r.error='username_exists';else{users.set(m.username,{password:m.password,roles:{viewer:true,engager:false,admin:false}});r.ok=true;}}
   else if(m.type==='login'){const u=users.get(m.username);if(u&&u.password===m.password){user={username:m.username,roles:u.roles};Object.assign(r,{ok:true,accepted:true,user});}else r.error='auth_failed';}
   else if(m.type==='logout'){user=null;r.ok=true;}
   else if(!user)r.error='unauthenticated';
   else if(m.type==='snapshot'){r.ok=true;r.snapshot={sensors:[],threats:[],radar:[],events:[]};}
   else if(m.type==='evaluate')r.ok=true;
   socket.write(JSON.stringify(r)+'\n');
  }});
 });tcp.listen(0,'127.0.0.1');await once(tcp,'listening');
 const bridge=createAuthBridge({port:tcp.address().port,now,ttl});
 const server=http.createServer((req,res)=>bridge.handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{bridge.close();for(const s of sockets)s.destroy();server.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>tcp.close(r))]);});
 async function call(path,cookie,body,headers={}){
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/backend/${path}`,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  const set=r.headers.get('set-cookie');return {status:r.status,data:await r.json(),cookie:set?.split(';')[0]||cookie,set};
 }
 async function ready(cookie){for(let i=0;i<50;i++){const r=await call('status',cookie);cookie=r.cookie;if(r.data.connected)return {...r,set:r.set||'HttpOnly; SameSite=Strict'};await new Promise(r=>setTimeout(r,10));}throw Error('not connected');}
 return {call,ready,users,received};
}
test('TCP registration, login and logout keep browser sessions isolated',async t=>{
 const e=await setup(t),a=await e.ready(),b=await e.ready();assert.notEqual(a.cookie,b.cookie);
 assert.equal((await e.call('snapshot',a.cookie)).status,401);
 assert.equal((await e.call('register',a.cookie,{username:'ana',password:'password',roles:{admin:true}})).status,201);
 assert.equal(e.received.at(-1).roles,undefined);
 assert.equal((await e.call('register',b.cookie,{username:'ana',password:'password'})).status,409);
 assert.equal((await e.call('login',a.cookie,{username:'ana',password:'wrong'})).status,401);
 assert.equal((await e.call('login',a.cookie,{username:'ana',password:'password'})).data.accepted,true);
 assert.equal((await e.call('status',b.cookie)).data.authenticated,false);
 assert.equal((await e.call('snapshot',a.cookie)).status,200);
 assert.equal((await e.call('evaluate',a.cookie,{threat_id:'1',status:'confirmed',role:'operator'})).status,403);
 await e.call('login',b.cookie,{username:'ana',password:'password'});
 const out=await e.call('logout',a.cookie,{});assert.equal(out.status,200);assert.match(out.set,/Max-Age=0/);
 assert.equal((await e.call('status',b.cookie)).data.authenticated,true);
 assert.equal((await e.call('status',a.cookie)).data.authenticated,false);
});
test('origin checks, server roles, validation and rate limits are enforced',async t=>{
 const e=await setup(t),a=await e.ready();
 assert.equal((await e.call('status',a.cookie,undefined,{origin:'http://evil.test'})).status,403);
 assert.equal((await e.call('status',a.cookie,undefined,{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await e.call('register',a.cookie,{username:"a';drop",password:'password'})).status,400);
 assert.equal((await e.call('register',a.cookie,{username:'abc',password:'short'})).status,400);
 e.users.set('operator',{password:'password',roles:{viewer:true,engager:true}});
 await e.call('login',a.cookie,{username:'operator',password:'password'});
 assert.equal((await e.call('evaluate',a.cookie,{threat_id:'1',status:'review',role:'admin'})).status,200);
 assert.equal(e.received.at(-1).role,undefined);
 for(let i=0;i<11;i++)await e.call('login',a.cookie,{username:'wrong',password:'wrong'});
 assert.equal((await e.call('login',a.cookie,{username:'wrong',password:'wrong'})).status,429);
});
test('expiry replaces authenticated browser session with a new unauthenticated one',async t=>{
 let clock=1000;const e=await setup(t,{now:()=>clock,ttl:30000}),a=await e.ready();
 e.users.set('user',{password:'password',roles:{viewer:true}});
 await e.call('login',a.cookie,{username:'user',password:'password'});clock+=30001;
 const r=await e.call('status',a.cookie);assert.equal(r.data.authenticated,false);assert.notEqual(r.cookie,a.cookie);
});

test('registration SQL errors are distinct from connection errors',async t=>{
 for(const error of ['registration_failed','query_failed','database_unavailable']) {
  const e=await setup(t,{backendError:error}),a=await e.ready();
  const response=await e.call('register',a.cookie,{username:'new_user',password:'password'});
  assert.equal(response.status,error==='database_unavailable'?503:500);
  assert.equal(response.data.error,error);
 }
});
