import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
const COOKIE='__Host-hansol_admin';
const hash=token=>createHash('sha256').update(token).digest('hex');
const PASSWORD_HASH=Buffer.from('0eec83a06a3d1152a65a8d56f48fe1f91f44a400206eaa69a2679104769dec3f8d5a4fc0b72f1adc3cda8cfbf303686afe07e290920ed164e4bce3f266967151','hex');
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const cookie=(token,maxAge)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
function validValues(values){return values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length<=150&&Object.entries(values).every(([id,value])=>/^e\d{1,3}$/.test(id)&&typeof value==='string'&&value.length<=3000);}
function validWebapps(apps){return Array.isArray(apps)&&apps.length<=30&&JSON.stringify(apps).length<=380000&&apps.every(app=>app&&typeof app.id==='string'&&app.id.length<=100&&typeof app.title==='string'&&app.title.trim().length>0&&app.title.length<=120&&typeof app.url==='string'&&app.url.length<=2000&&(()=>{try{return ['http:','https:'].includes(new URL(app.url).protocol);}catch{return false;}})()&&typeof app.thumbnail==='string'&&app.thumbnail.length<=80000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(app.thumbnail));}
export function createHandler(store){
  return async function(request,context={}){
    try {
      const url=new URL(request.url),action=url.searchParams.get('action');
      const read=key=>store.get(key,{type:'json'});
      if(request.method==='GET'&&action==='content') return reply(await read('content')||{values:{},revision:null});
      if(request.method!=='GET'&&request.method!=='POST') return reply({error:'지원하지 않는 요청입니다.'},405);
      if(request.method==='POST'){
        if(request.headers.get('origin')!==url.origin) return reply({error:'다른 사이트에서는 편집할 수 없습니다.'},403);
        if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON 요청이 필요합니다.'},415);
        if(Number(request.headers.get('content-length')||0)>500000)return reply({error:'내용이 너무 큽니다.'},413);
      }
      const token=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
      const sessionKey=/^[a-f0-9]{64}$/.test(token)?'session/'+hash(token):null;
      const session=sessionKey?await read(sessionKey):null;
      const loggedIn=session&&session.expires>Date.now();
      if(action==='session'&&request.method==='GET')return loggedIn?reply({authenticated:true}):reply({error:'로그인이 필요합니다.'},401);
      if(action==='login'&&request.method==='POST'){
        const body=await request.json();
        const rateKey='attempt/'+hash(context.ip||'unknown');
        const attempts=await read(rateKey)||{count:0,reset:0};
        if(attempts.reset>Date.now()&&attempts.count>=8)return reply({error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'},429);
        const correct=typeof body.password==='string'&&body.password.length<=100&&timingSafeEqual(scryptSync(body.password,'hansol-admin-2026',64),PASSWORD_HASH);
        if(!correct){await store.setJSON(rateKey,{count:attempts.reset>Date.now()?attempts.count+1:1,reset:attempts.reset>Date.now()?attempts.reset:Date.now()+900000});return reply({error:'비밀번호가 올바르지 않습니다.'},401);}
        const newToken=randomBytes(32).toString('hex');
        await store.setJSON('session/'+hash(newToken),{expires:Date.now()+43200000});
        await store.delete(rateKey);
        return reply({authenticated:true},200,{'Set-Cookie':cookie(newToken,43200)});
      }
      if(action==='logout'&&request.method==='POST'){if(sessionKey)await store.delete(sessionKey);return reply({authenticated:false},200,{'Set-Cookie':cookie('',0)});}
      if(action==='save'&&request.method==='POST'){
        if(!loggedIn)return reply({error:'로그인이 만료되었습니다. 다시 로그인해주세요.'},401);
        const body=await request.json();
        if(!validValues(body.values))return reply({error:'편집 내용의 형식 또는 길이가 올바르지 않습니다.'},400);
        if(body.webapps!==undefined&&!validWebapps(body.webapps))return reply({error:'웹앱 제목, 링크 또는 썸네일 형식이 올바르지 않습니다.'},400);
        const current=await read('content');
        if((current?.revision||null)!==(body.revision||null))return reply({error:'다른 창에서 내용을 수정했습니다. 창을 닫고 다시 열어 최신 내용을 확인해주세요.'},409);
        const saved={values:body.values,webapps:body.webapps??current?.webapps??[],revision:randomBytes(16).toString('hex'),updatedAt:new Date().toISOString()};
        await store.setJSON('content',saved);
        return reply({revision:saved.revision,updatedAt:saved.updatedAt});
      }
      return reply({error:'요청을 찾을 수 없습니다.'},404);
    }catch{return reply({error:'서버 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'},500);}
  };
}
