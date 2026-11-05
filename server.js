import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const dataDir=process.env.DATA_DIR||path.join(root,'data');
const dataFile=path.join(dataDir,'state.json');
const supabaseUrl=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const supabaseKey=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const useCloud=Boolean(supabaseUrl&&supabaseKey);
if(Boolean(supabaseUrl)!==Boolean(supabaseKey)){console.error('Both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');process.exit(1)}
if(useCloud && !/^https:\/\/[^/]+$/.test(supabaseUrl)){console.error('SUPABASE_URL must be an HTTPS origin.');process.exit(1)}
const appPassword=process.env.APP_PASSWORD||'';
const hosted=process.env.NODE_ENV==='production';
if(hosted && !useCloud){console.error('Hosted deployment requires Supabase storage to avoid losing your data on restart.');process.exit(1)}
if(hosted && appPassword.length<16){console.error('Set APP_PASSWORD to a unique value of at least 16 characters before hosting publicly.');process.exit(1)}
function constantEqual(a,b){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function authorized(req){if(!appPassword)return !hosted;const h=req.headers.authorization||'';if(!h.startsWith('Basic '))return false;try{const value=Buffer.from(h.slice(6),'base64').toString('utf8');const sep=value.indexOf(':');return sep>=0&&constantEqual(value.slice(sep+1),appPassword)}catch{return false}}
function trustedWrite(req){const origin=req.headers.origin;if(!origin)return true;try{const a=new URL(origin);return a.host===req.headers.host&&['https:','http:'].includes(a.protocol)}catch{return false}}
const staticDir=path.join(root,'public');
const defaultState={vehicles:[],preferences:{name:'Mercedes',closing:'Come see me to always get the Wright deal!'},lastSync:null};
let writeQueue=Promise.resolve();
async function cloudRequest(method,body){
  const r=await fetch(`${supabaseUrl}/rest/v1/marketplace_state?id=eq.1`,{
    method, headers:{'apikey':supabaseKey,'Authorization':`Bearer ${supabaseKey}`,'Content-Type':'application/json', 'Accept':'application/json',...(method==='PATCH'?{'Prefer':'return=minimal'}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)throw Error(`Cloud database error (${r.status}); verify Supabase table and credentials.`);
  return method==='GET'?r.json():undefined;
}
async function readState(){
  if(useCloud){const records=await cloudRequest('GET');if(!records.length)throw Error('Cloud database row missing; run the SQL setup.');return records[0].state;}
  try{return JSON.parse(await fs.readFile(dataFile,'utf8'))}catch(e){if(e.code==='ENOENT')return structuredClone(defaultState);throw e}
}
async function saveState(state){writeQueue=writeQueue.catch(()=>{}).then(async()=>{
  if(useCloud){await cloudRequest('PATCH',{state,updated_at:new Date().toISOString()});return}
  await fs.mkdir(path.dirname(dataFile),{recursive:true});const tmp=dataFile+'.tmp';await fs.writeFile(tmp,JSON.stringify(state,null,2));await fs.rename(tmp,dataFile)
});await writeQueue;}
const send=(res,status,body,type='application/json',headers={})=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',...headers});res.end(type==='application/json'?JSON.stringify(body):body)};
async function bodyJson(req){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>30e6)throw Error('Request too large');parts.push(chunk)}return JSON.parse(Buffer.concat(parts).toString('utf8'))}
function urlSafe(raw){const u=new URL(raw);if(u.protocol!=='https:' || !/(^|\.)davewrightauto\.com$/i.test(u.hostname))throw Error('Only HTTPS Dave Wright Auto URLs supported');return u.href}
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
function entities(html){const blocks=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];let out=[];function visit(x){if(!x||typeof x!=='object')return;if(Array.isArray(x))return x.forEach(visit);const type=String(x['@type']||'');if(/Vehicle|Car|Product/i.test(type))out.push(x);if(x['@graph'])visit(x['@graph']);if(x.itemListElement)visit(x.itemListElement);if(x.item)visit(x.item)}for(const m of blocks){try{visit(JSON.parse(m[1]))}catch{}}return out}
function normalizeVehicle(x,sourceUrl){const image=x.image||x.images||[];let photos=(Array.isArray(image)?image:[image]).map(t=>typeof t==='string'?t:t?.url).filter(s=>typeof s==='string'&&/^https?:\/\//.test(s));const offer=Array.isArray(x.offers)?x.offers[0]:x.offers||{};const title=clean(x.name||x.title||'');const vin=clean(x.vehicleIdentificationNumber||x.vin||x.vehicleId||'').toUpperCase();return {id:vin||clean(x.sku)||sourceUrl,vin,title,year:x.vehicleModelDate||x.modelDate||'',make:clean(x.brand?.name||x.brand||''),model:clean(x.model||''),trim:clean(x.vehicleConfiguration||x.trim||''),stock:clean(x.sku||''),price:Number(offer.price||x.price)||0,mileage:Number(x.mileageFromOdometer?.value||x.mileageFromOdometer||0)||0,condition:/used|pre.?owned/i.test(String(x.itemCondition||''))?'Pre-owned':'New',url:clean(x.url||sourceUrl),description:clean(x.description||''),photos,selectedPhotos:photos,status:'Available',listingUrl:'',postedAt:null,source:'website'}}
function parseHTML(html,url){let result=entities(html).map(x=>normalizeVehicle(x,url)).filter(v=>v.title||v.vin);let links=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>{try{return new URL(m[1],url).href}catch{return null}}).filter(x=>x&&/davewrightauto\.com\/auto\//i.test(x));return {vehicles:result,detailLinks:[...new Set(links)].slice(0,400)}}
async function fetchHTML(url){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),17000);try{const r=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; WrightMarketplaceDesk/3.0; inventory-importer)','Accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw Error('Dealership responded HTTP '+r.status);let html=await r.text();if(html.length>8e6)throw Error('HTML response too large');return html}finally{clearTimeout(timer)}}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{ok:true});if(!authorized(req))return send(res,401,{error:'Login required'},'application/json',{'WWW-Authenticate':'Basic realm="Wright Marketplace Desk"'});if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!trustedWrite(req))return send(res,403,{error:'Cross-origin writes are not allowed'});if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{ok:true,storage:useCloud?'cloud':'local'});if(req.method==='GET'&&u.pathname==='/api/state')return send(res,200,await readState());if(req.method==='PUT'&&u.pathname==='/api/state'){const state=await bodyJson(req);if(!Array.isArray(state.vehicles)||state.vehicles.length>30000)throw Error('Invalid vehicle state');await saveState(state);return send(res,200,{ok:true,count:state.vehicles.length})}if(req.method==='POST'&&u.pathname==='/api/import'){const {url,scanDetails=false}=await bodyJson(req);const safe=urlSafe(url);const html=await fetchHTML(safe);let parsed=parseHTML(html,safe);if(scanDetails&&parsed.detailLinks.length){const urls=parsed.detailLinks.slice(0,Math.min(100,Number(process.env.MAX_DETAIL_IMPORT||100)));let errors=0;for(let i=0;i<urls.length;i+=4){const b=await Promise.allSettled(urls.slice(i,i+4).map(async link=>parseHTML(await fetchHTML(urlSafe(link)),link).vehicles));for(const x of b){if(x.status==='fulfilled')parsed.vehicles.push(...x.value);else errors++}}parsed.errors=errors}const seen=new Set();parsed.vehicles=parsed.vehicles.filter(v=>{const k=v.vin||v.url||v.id;if(seen.has(k))return false;seen.add(k);return true});return send(res,200,{...parsed,count:parsed.vehicles.length})}if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});const pathname=u.pathname==='/'?'/index.html':u.pathname;const file=path.resolve(staticDir,'.'+pathname);if(!file.startsWith(staticDir+path.sep))return send(res,403,{error:'Not allowed'});try{return send(res,200,await fs.readFile(file),mime[path.extname(file)]||'application/octet-stream')}catch{return send(res,404,{error:'Not found'})}}catch(e){send(res,400,{error:e.message||'Unexpected error'})}}).listen(port,process.env.HOST||(hosted?'0.0.0.0':'127.0.0.1'),()=>console.log(`Wright Marketplace Desk 3.0: http://localhost:${port}`));
