const COOKIE='__Host-hansol_admin';
const encoder=new TextEncoder();
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
const cookie=(token,seconds)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
async function correctPassword(password){
  if(typeof password!=='string'||password.length>100)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode('hansol-cloudflare-admin-v1'),iterations:100000,hash:'SHA-256'},key,256));
  const expected='d50e51cda5b939f4e01d39ed5cc3b6d0733441bd5d7782ce6b816d9bf624b88a';
  let different=0;for(let i=0;i<expected.length;i++)different|=actual.charCodeAt(i)^expected.charCodeAt(i);return different===0;
}
function validValues(values){return values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length<=150&&Object.entries(values).every(([id,value])=>/^e\d{1,3}$/.test(id)&&typeof value==='string'&&value.length<=3000);}
function validApps(apps){return Array.isArray(apps)&&apps.length<=30&&JSON.stringify(apps).length<=380000&&new Set(apps.map(app=>app?.id)).size===apps.length&&apps.every(app=>app&&typeof app.id==='string'&&app.id.length>0&&app.id.length<=100&&typeof app.title==='string'&&app.title.trim().length>0&&app.title.length<=120&&typeof app.url==='string'&&app.url.length<=2000&&(()=>{try{return ['https:','http:'].includes(new URL(app.url).protocol);}catch{return false;}})()&&typeof app.thumbnail==='string'&&app.thumbnail.length<=80000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(app.thumbnail));}
export function createEditor(store){
  return async request=>{
    try{
      const url=new URL(request.url),action=url.searchParams.get('action');
      if(action==='content'&&request.method==='GET')return json(await store.get('content')||{values:{},webapps:[],revision:null});
      if(!['GET','POST'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
      let body;
      if(request.method==='POST'){
        if(request.headers.get('origin')!==url.origin)return json({error:'다른 사이트에서는 편집할 수 없습니다.'},403);
        if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON 요청이 필요합니다.'},415);
        const text=await request.text();if(encoder.encode(text).length>1000000)return json({error:'저장할 내용이 너무 큽니다.'},413);
        try{body=JSON.parse(text);}catch{return json({error:'요청 형식이 올바르지 않습니다.'},400);}
        if(!body||typeof body!=='object')return json({error:'요청 형식이 올바르지 않습니다.'},400);
      }
      const token=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
      const sessionKey=/^[a-f0-9]{64}$/.test(token)?'session/'+await hash(token):null;
      const session=sessionKey?await store.get(sessionKey):null;
      const authenticated=session&&session.expires>Date.now();
      if(action==='session'&&request.method==='GET')return authenticated?json({authenticated:true}):json({error:'로그인이 필요합니다.'},401);
      if(action==='login'&&request.method==='POST'){
        const rateKey='attempt/'+await hash(request.headers.get('cf-connecting-ip')||'local');
        const attempts=await store.get(rateKey)||{count:0,expires:0};
        if(attempts.expires>Date.now()&&attempts.count>=8)return json({error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'},429);
        if(!await correctPassword(body.password)){await store.set(rateKey,{count:attempts.expires>Date.now()?attempts.count+1:1,expires:attempts.expires>Date.now()?attempts.expires:Date.now()+900000});return json({error:'비밀번호가 올바르지 않습니다.'},401);}
        const newToken=hex(crypto.getRandomValues(new Uint8Array(32)));
        await store.set('session/'+await hash(newToken),{expires:Date.now()+43200000});await store.delete(rateKey);
        return json({authenticated:true},200,{'Set-Cookie':cookie(newToken,43200)});
      }
      if(action==='logout'&&request.method==='POST'){if(sessionKey)await store.delete(sessionKey);return json({authenticated:false},200,{'Set-Cookie':cookie('',0)});}
      if(action==='save'&&request.method==='POST'){
        if(!authenticated)return json({error:'로그인이 만료되었습니다. 비밀번호를 다시 입력해주세요.'},401);
        if(!validValues(body.values)||(body.webapps!==undefined&&!validApps(body.webapps)))return json({error:'제목, 링크 또는 이미지 형식이 올바르지 않습니다.'},400);
        const saved=await store.saveContent(body);
        return saved?json({revision:saved.revision,updatedAt:saved.updatedAt}):json({error:'다른 창에서 내용이 변경되었습니다. 편집창을 닫고 다시 열어주세요.'},409);
      }
      return json({error:'요청을 찾을 수 없습니다.'},404);
    }catch(error){console.error('Editor request failed',error.name);return json({error:'저장 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'},500);}
  };
}
