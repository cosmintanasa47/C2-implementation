// Standalone demo acknowledgement: never forwards to SQL, Qt or hardware.
export function handlePresentation(req,res) {
  if (new URL(req.url,'http://localhost').pathname!=='/api/presentation/engage') return false;
  const respond=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='POST') {respond(405,{ok:false});return true;}
  if(req.headers.origin!==`http://${req.headers.host}` || req.headers['x-edth-demo']!=='synthetic-only') {
    respond(403,{ok:false});return true;
  }
  console.info('Engaging — simulation | DEMO-TULCEA-01 | no hardware command');
  respond(200,{ok:true,simulation:true,message:'Engaging — simulation',id:'DEMO-TULCEA-01'});
  return true;
}
