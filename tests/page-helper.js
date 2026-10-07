// Arranca la página real (index.html + js/*.js) en jsdom con una API simulada.
// Arranca la página real en jsdom (original de un solo archivo vs. versión separada) y compara el resultado.
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),vm=require('vm');
const SB=fs.readFileSync(require.resolve('@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
function jwt(){const e=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return e({alg:'HS256',typ:'JWT'})+'.'+e({sub:'u1',email:'dpriegooliva@gmail.com',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})+'.s';}
const rows=[];for(let d=0;d<4;d++)for(let s=0;s<3;s++)rows.push({id:'i'+d+s,profile:'David',fecha:['2026-10-05','2026-10-06','2026-10-07','2026-10-01'][d],dia:'Día '+(d%2+1)+' · '+(d%2?'Dorsales, bíceps y core':'Pectoral, deltoides y tríceps'),grupo:d%2?'Dorsales':'Pectoral',ejercicio:d%2?'Remo en máquina':'Press banca plano',peso:50+s,reps:8,series:1,nota:null,rm:60,variante:null,calentamiento:false});
async function boot(file,{logged,versionOverride}){
  const base=path.dirname(file);try{versionOverride=versionOverride||JSON.parse(fs.readFileSync(path.join(base,'version.json'),'utf8')).version}catch(e){}const html=fs.readFileSync(file,'utf8');
  const dom=new JSDOM(html,{url:'https://dpriegoo.github.io/ironlog/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;const errs=[];w.addEventListener('error',e=>errs.push(String(e.message)));
  w.fetch=async(url,opt={})=>{url=String(url);const J=(o,s=200)=>new w.Response?new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}}):null;
    const R=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
    if(url.includes('/rest/v1/sets')&&(opt.method||'GET')==='GET')return R(rows);
    if(url.includes('/rest/v1/allowed_users'))return R({profile:'David',altura:166});
    if(url.includes('/rest/v1/routines'))return R(null,406);
    if(url.includes('/rest/v1/weights'))return R([{fecha:'2026-10-03',peso:67.8}]);
    if(url.includes('/rpc/partner_week_volume'))return R(1234);
    if(url.includes('version.json'))return R({version:versionOverride||'x'});
    return new Response(null,{status:201});};
  w.Response=Response;w.Headers=Headers;w.Request=Request;
  w.Chart=function(){this.destroy=()=>{};this.update=()=>{}};
  w.google={accounts:{id:{initialize(){},renderButton(){},prompt(){}}}};
  w.matchMedia=w.matchMedia||(()=>({matches:false,addListener(){},addEventListener(){}}));
  if(logged){w.localStorage.setItem('profile','David');w.localStorage.setItem('sessionToken','sb');
    w.localStorage.setItem('ironlog-auth',JSON.stringify({access_token:jwt(),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r',user:{id:'u1',email:'dpriegooliva@gmail.com',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01'}}));}
  const doc=w.document;const scripts=[...doc.querySelectorAll('script')];
  for(const sc of scripts){const src=sc.getAttribute('src');let code;
    if(!src)code=sc.textContent;else if(src.includes('cdn.jsdelivr'))code=SB;else if(src.startsWith('http'))continue;else code=fs.readFileSync(path.join(base,src.split('?')[0]),'utf8');
    try{new vm.Script(code,{filename:src||'inline'}).runInContext(dom.getInternalVMContext())}catch(e){errs.push('EVAL '+(src||'inline')+': '+e.message);}}
  await new Promise(r=>setTimeout(r,1500));
  return {w,errs};
}
module.exports={boot};
