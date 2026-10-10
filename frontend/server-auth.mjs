// Same-origin HTTP/SSE gateway. Each opaque browser cookie owns a separate TCP session.
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { classifyMessage, createJsonSplitter } from './dist/backend-contract.js';
const COOKIE='edth_session';
const MAX_BODY=8192, TTL=30*60*1000, RPC_TIMEOUT=15000;
export function createAuthBridge({host='127.0.0.1',port=55067,connect=options=>net.createConnection(options),now=()=>Date.now(),ttl=TTL}={}) {
  const sessions=new Map(), attempts=new Map();
  const configured=Number.isInteger(Number(port))&&Number(port)>0&&Number(port)<65536;
  function answer(res,code,body) {
    res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(body));return true;
  }
  function status(s) {return {configured,connected:s.connected,authenticated:!!s.user,username:s.user?.username??null,roles:s.user?.roles??{},session:s.generation,ignored:s.ignored};}
  function event(s,type,data) {
    for(const res of s.listeners) {
      if(res.writableLength>1024*1024) {res.destroy();s.listeners.delete(res);continue;}
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }
  function end(s) {
    clearTimeout(s.retry);s.socket?.destroy();
    for(const item of s.pending.values()) {clearTimeout(item.timer);item.reject(new Error('disconnected'));}
    s.pending.clear();for(const res of s.listeners)res.end();s.listeners.clear();sessions.delete(s.id);
  }
  function open(s) {
    if(!sessions.has(s.id)||!configured)return;
    const socket=connect({host,port:Number(port)});s.socket=socket;
    const splitter=createJsonSplitter({maxBytes:4*1024*1024});
    socket.on('connect',()=>{if(s.socket!==socket)return;s.connected=true;event(s,'status',status(s));});
    socket.on('data',chunk=>{
      if(s.socket!==socket)return;
      const {messages,rejected}=splitter.push(chunk);s.ignored+=rejected;
      for(const m of messages) {
        if(typeof m.request_id==='string') {
          const item=s.pending.get(m.request_id);
          if(!item || m.type!==`${item.type}_response`)continue;
          s.pending.delete(m.request_id);clearTimeout(item.timer);item.resolve(m);continue;
        }
        // Feed messages are delivered only to authenticated sessions.
        if(!s.user)continue;
        const parsed=classifyMessage(m);
        if(!parsed||!['threat','map_point'].includes(parsed.kind)){s.ignored++;continue;}
        event(s,parsed.kind,{seq:++s.seq,receivedAt:new Date(now()).toISOString(),...parsed.value});
      }
    });
    socket.on('error',()=>{});
    socket.on('close',()=>{
      if(s.socket!==socket)return;s.connected=false;s.user=null;s.socket=null;s.generation=randomUUID();
      for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(new Error('disconnected'));}s.pending.clear();
      event(s,'status',status(s));
      if(sessions.has(s.id)){s.retry=setTimeout(()=>open(s),2000);s.retry.unref?.();}
    });
  }
  function getSession(req,res) {
    const raw=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`));
    const token=raw?.slice(COOKIE.length+1);let s=sessions.get(token);
    if(s && now()-s.used>=ttl){end(s);s=null;}
    if(!s) {
      if(sessions.size>=32)return null;
      const id=randomBytes(32).toString('hex');
      s={id,used:now(),connected:false,user:null,socket:null,listeners:new Set(),pending:new Map(),generation:randomUUID(),seq:0,ignored:0};
      sessions.set(id,s);
      res.setHeader('Set-Cookie',`${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.ceil(ttl/1000)}`);
      open(s);
    }
    // SSE reconnect/status polling does not extend an authenticated session forever.
    if(req.method==='POST') {
      s.used=now();
      res.setHeader('Set-Cookie',`${COOKIE}=${s.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.ceil(ttl/1000)}`);
    }
    return s;
  }
  async function body(req) {
    if(!/^application\/json\b/i.test(req.headers['content-type']||''))throw new Error('content_type');
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('too_large');chunks.push(chunk);}
    try {const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||typeof b!=='object'||Array.isArray(b))throw 0;return b;}
    catch {throw new Error('invalid');}
  }
  function rpc(s,type,data={}) {
    if(!s.connected||!s.socket)return Promise.reject(new Error('disconnected'));
    if(s.pending.size)return Promise.reject(new Error('pending'));
    return new Promise((resolve,reject)=>{
      const request_id=randomUUID();
      const timer=setTimeout(()=>{
        s.pending.delete(request_id);reject(new Error('timeout'));
        // Drop the TCP session after timeout. A late success must never authenticate the browser.
        s.socket?.destroy();
      },RPC_TIMEOUT);
      s.pending.set(request_id,{type,resolve,reject,timer});
      s.socket.write(`${JSON.stringify({...data,type,request_id})}\n`);
    });
  }
  const sweep=setInterval(()=>{
    for(const s of sessions.values())if(now()-s.used>=ttl)end(s);
    for(const [key,a]of attempts)if(now()-a.started>60000)attempts.delete(key);
  },10000);sweep.unref?.();
  return {
    async handle(req,res) {
      const path=new URL(req.url,'http://localhost').pathname;
      if(!path.startsWith('/api/backend/'))return false;
      const origin=req.headers.origin, hostHeader=req.headers.host;
      if((origin&&origin!==`http://${hostHeader}`)||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])))return answer(res,403,{error:'forbidden'});
      if(!configured)return answer(res,path.endsWith('/status')?200:503,{configured:false,error:'disconnected'});
      const s=getSession(req,res);if(!s)return answer(res,503,{error:'busy'});
      if(path==='/api/backend/status'&&req.method==='GET')return answer(res,200,status(s));
      if(path==='/api/backend/events'&&req.method==='GET') {
        if(s.listeners.size>=4)return answer(res,429,{error:'busy'});
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
        s.listeners.add(res);event(s,'status',status(s));
        const pulse=setInterval(()=>res.write(': keep-alive\n\n'),20000);pulse.unref?.();
        res.on('close',()=>{clearInterval(pulse);s.listeners.delete(res);});return true;
      }
      const operation=path.split('/').at(-1);
      if((operation==='snapshot'&&req.method!=='GET')||(operation!=='snapshot'&&req.method!=='POST'))return answer(res,405,{error:'method'});
      if(!['login','register','logout','snapshot','evaluate','launch'].includes(operation))return answer(res,404,{error:'not_found'});
      try {
        let data=operation==='snapshot'?{}:await body(req);
        if(operation==='login'||operation==='register') {
          const key=req.socket?.remoteAddress||'local';
          let a=attempts.get(key);
          if(!a||now()-a.started>60000){a={count:0,started:now()};attempts.set(key,a);}
          if(++a.count>10)return answer(res,429,{error:'rate_limited'});
          if(typeof data.username!=='string'||!/^[-A-Za-z0-9_.@]{1,50}$/.test(data.username.trim())||typeof data.password!=='string'||!data.password||Buffer.byteLength(data.password)>1024||(operation==='register'&&data.password.length<8))return answer(res,400,{error:'invalid'});
          data={username:data.username.trim(),password:data.password};
        } else if(!s.user)return answer(res,401,{error:'unauthenticated'});
        if(operation==='launch')return answer(res,501,{error:'unsupported'});
        if(operation==='evaluate') {
          if(!s.user.roles?.engager&&!s.user.roles?.admin)return answer(res,403,{error:'forbidden'});
          data={threat_id:data.threat_id,status:data.status,reason:data.reason??''};
        }
        const result=await rpc(s,operation,data);
        if(!result.ok) {
          const error=result.error||'auth_failed';
          const codes={auth_failed:401,unauthenticated:401,forbidden:403,invalid:400,username_exists:409,already_authenticated:409,unsupported:501,database_unavailable:503,registration_failed:500,query_failed:500};
          return answer(res,codes[error]||400,{error});
        }
        if(operation==='login') {
          if(!result.accepted||!result.user||typeof result.user.username!=='string')return answer(res,502,{error:'invalid_response'});
          s.user=result.user;s.generation=randomUUID();event(s,'status',status(s));
        }
        if(operation==='logout') {
          s.user=null;s.generation=randomUUID();event(s,'status',status(s));
          // Invalidate the old token; a future login obtains a fresh browser session.
          res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
          answer(res,200,{ok:true});end(s);return true;
        }
        return answer(res,operation==='register'?201:200,result);
      } catch(error) {
        const codes={content_type:415,too_large:413,invalid:400,pending:409,timeout:504,disconnected:503};
        return answer(res,codes[error.message]||500,{error:codes[error.message]?error.message:'internal'});
      }
    },
    close(){clearInterval(sweep);for(const s of [...sessions.values()])end(s);},
  };
}
