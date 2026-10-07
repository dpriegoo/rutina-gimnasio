// Prueba del adaptador de Supabase (js/api-supabase.js) contra una API simulada: login, lecturas paginadas,
// guardados, conflicto de rutina y cierre de sesión. Comprueba qué peticiones salen.
//   npm test
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const code=fs.readFileSync(path.join(root,'js','api-supabase.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'js','utils.js'),'utf8')+'\nconst SUPABASE_URL=\'https://cqulyecdgkqjlzerfeue.supabase.co\';const SUPABASE_KEY=\'sb_publishable_test\';';
const store={};
global.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
global.window=global;
const sbmod=require('@supabase/supabase-js');
global.supabase=sbmod;
const reqs=[];
const jwt=(()=>{const h=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');const p=Buffer.from(JSON.stringify({sub:'u1',email:'dpriegooliva@gmail.com',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');return h+'.'+p+'.sig'})();
let setsRows=[];for(let i=0;i<1500;i++)setsRows.push({id:'id'+String(i).padStart(5,'0'),profile:'David',fecha:'2026-09-07',dia:'Día 1',grupo:'Pectoral',ejercicio:'Press',peso:30,reps:6,series:1,nota:null,rm:36,variante:null,calentamiento:false});
global.fetch=async(url,opt={})=>{
  url=String(url);const body=opt.body?String(opt.body):'';const m=opt.method||'GET';
  reqs.push({m,url:url.replace('',''),body,h:opt.headers&&(typeof opt.headers.get==='function'?opt.headers.get('Prefer'):(opt.headers.Prefer||opt.headers.prefer))});
  const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
  if(url.includes('/auth/v1/token')) return J({access_token:jwt,token_type:'bearer',expires_in:3600,refresh_token:'r1',user:{id:'u1',email:'dpriegooliva@gmail.com',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01'}});
  if(url.includes('/auth/v1/logout')) return new Response(null,{status:204});
  if(url.includes('/rest/v1/allowed_users')&&m==='GET') return J({profile:'David',altura:166});
  if(url.includes('/rest/v1/routines')&&m==='GET') return J({version:1,data:{days:[1]}});
  if(url.includes('/rest/v1/sets')&&m==='GET'){const u=new URL(url);const off=Number(u.searchParams.get('offset')||0),lim=Number(u.searchParams.get('limit')||1000);return J(setsRows.slice(off,off+lim));}
  if(url.includes('/rest/v1/weights')&&m==='GET') return J([{fecha:'2026-09-09',peso:68.6}]);
  if(url.includes('/rpc/save_routine')) return J(JSON.parse(body).base_version===1?2:-1);
  return new Response(null,{status:201});
};
global.getProfile=()=>localStorage.getItem('profile');
eval(code+';global.__t={sbLogin,sbRequest}');
const T=global.__t;
setTimeout(()=>{console.error('FALLO: tiempo agotado');process.exit(2)},20000);
(async()=>{
 assert.deepStrictEqual(await T.sbRequest({action:'getHeight'}),{error:'unauthorized'},'sin sesión debe dar unauthorized');
 assert.deepStrictEqual(await T.sbLogin('google.id.token'),{sessionToken:'sb',profile:'David'},'login');
 localStorage.setItem('profile','David');
 const list=await T.sbRequest({action:'list'});
 assert.strictEqual(list.length,1500,'list pagina de 1000 en 1000');
 assert.strictEqual(list[0]['Perfil'],'David'); assert('Peso (kg)' in list[0] && 'Calentamiento' in list[0],'formato Sheets');
 assert.deepStrictEqual(await T.sbRequest({action:'getHeight'}),{altura:166,v:3,rv:1});
 assert.deepStrictEqual(await T.sbRequest({action:'saveRoutine',baseVersion:1,routine:{days:[1]}}),{ok:true,version:2});
 assert.strictEqual((await T.sbRequest({action:'saveRoutine',baseVersion:5,routine:{days:[1]}})).error,'conflict');
 assert.deepStrictEqual(await T.sbRequest({action:'saveWeight',peso:68.1,fecha:'2026-10-07'}),{ok:true});
 const save=await T.sbRequest({entries:[{id:'x1',perfil:'David',fecha:'2026-10-07',dia:'Día 1',grupo:'Pectoral',ejercicio:'Press',peso:30,reps:6,series:1}]});
 assert(save.ok&&save.count===1);
 const up=reqs.find(r=>r.m==='POST'&&r.url.includes('/rest/v1/sets'));
 assert(up.url.includes('on_conflict=id')&&/ignore-duplicates/.test(up.h||''),'guardado idempotente (ignore-duplicates)');
 assert.deepStrictEqual(await T.sbRequest({action:'logout'}),{ok:true});
 assert.deepStrictEqual(await T.sbRequest({action:'getHeight'}),{error:'unauthorized'},'tras logout, unauthorized');
 console.log('OK adapter: login, paginación, guardado idempotente, conflicto de rutina, logout');
 process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1)});
