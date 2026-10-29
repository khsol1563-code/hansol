const COOKIE='__Host-hansol_admin';
const encoder=new TextEncoder();
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
const cookie=(token,seconds)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
async function correctPassword(password,authConfig){
  if(!/^[a-f0-9]{64}$/.test(authConfig.passwordHash||'')||typeof authConfig.passwordSalt!=='string'||authConfig.passwordSalt.length<16)return false;
  if(typeof password!=='string'||password.length>100)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(authConfig.passwordSalt),iterations:100000,hash:'SHA-256'},key,256));
  const expected=authConfig.passwordHash;
  let different=0;for(let i=0;i<expected.length;i++)different|=actual.charCodeAt(i)^expected.charCodeAt(i);return different===0;
}
function validValues(values){return values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length<=150&&Object.entries(values).every(([id,value])=>/^e\d{1,3}$/.test(id)&&typeof value==='string'&&value.length<=3000);}
function validApps(apps){return Array.isArray(apps)&&apps.length<=30&&JSON.stringify(apps).length<=380000&&new Set(apps.map(app=>app?.id)).size===apps.length&&apps.every(app=>app&&typeof app.id==='string'&&app.id.length>0&&app.id.length<=100&&typeof app.title==='string'&&app.title.trim().length>0&&app.title.length<=120&&typeof app.url==='string'&&app.url.length<=2000&&(()=>{try{return ['https:','http:'].includes(new URL(app.url).protocol);}catch{return false;}})()&&typeof app.thumbnail==='string'&&app.thumbnail.length<=80000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(app.thumbnail));}
const MENU_IDS=['about','project','contact','webapps','lessons'];
function validMenuOrder(order){return Array.isArray(order)&&order.length===MENU_IDS.length&&new Set(order).size===order.length&&MENU_IDS.every(id=>order.includes(id));}
const LESSON_FILE_LIMIT=25*1024*1024;
const THUMBNAIL_LIMIT=5*1024*1024;
const MAX_ATTACHMENTS=5;
const LESSON_EXTENSIONS=new Set(['pdf','ppt','pptx','doc','docx','hwp','hwpx','xls','xlsx','zip']);
const THUMBNAIL_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const validLessonText=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
const validUrl=value=>{if(value==='')return true;try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}};
const itemFiles=item=>Array.isArray(item.files)&&item.files.length?item.files:item.key?[{id:item.fileId||item.id,key:item.key,fileName:item.fileName,extension:item.extension,size:item.size,contentType:item.contentType}]:[];
const publicFile=file=>({id:file.id,fileName:file.fileName,extension:file.extension,size:file.size,contentType:file.contentType});
const attachmentFromFile=(file,prefix)=>{const extension=file.name.split('.').pop().toLowerCase();const id=crypto.randomUUID();return {id,key:`${prefix}/${id}.${extension}`,fileName:file.name.slice(0,240),extension,size:file.size,contentType:file.type||'application/octet-stream'};};
const validUpload=file=>file&&typeof file.stream==='function'&&file.name&&file.size>0&&file.size<=LESSON_FILE_LIMIT&&LESSON_EXTENSIONS.has(file.name.split('.').pop().toLowerCase());
const download=async(file,fileStore)=>{if(!fileStore)return json({error:'파일 저장소에 연결할 수 없습니다.'},503);const object=await fileStore.get(file.key);if(!object)return json({error:'파일을 찾을 수 없습니다.'},404);const safeName=encodeURIComponent(file.fileName).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());return new Response(object.body,{headers:{'Content-Type':file.contentType||'application/octet-stream','Content-Length':String(file.size),'Content-Disposition':`attachment; filename*=UTF-8''${safeName}`,'Cache-Control':'private, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff'}});};
export function createEditor(store,authConfig={},fileStore=null){
  return async request=>{
    try{
      const url=new URL(request.url),action=url.searchParams.get('action');
      if(action==='content'&&request.method==='GET'){
        const content=await store.get('content')||{values:{},webapps:[],revision:null};
        const webapps=await Promise.all((content.webapps||[]).map(async app=>{const attachments=await store.get('webapp-files/'+app.id)||[];return attachments.length?{...app,attachments:attachments.map(publicFile)}:app;}));
        return json({...content,webapps});
      }
      if(action==='lessons'&&request.method==='GET')return json({items:(await store.get('lessons')||[]).map(item=>({...item,files:itemFiles(item).map(publicFile)}))});
      if(action==='lesson-file'&&request.method==='GET'){
        const id=url.searchParams.get('id'),fileId=url.searchParams.get('fileId');
        if(!/^[a-f0-9-]{36}$/.test(id||''))return json({error:'자료를 찾을 수 없습니다.'},404);
        const item=(await store.get('lessons')||[]).find(entry=>entry.id===id);
        if(!item)return json({error:'자료를 찾을 수 없습니다.'},404);
        const files=itemFiles(item),file=fileId?files.find(entry=>entry.id===fileId):files[0];
        return file?download(file,fileStore):json({error:'파일을 찾을 수 없습니다.'},404);
      }
      if(action==='webapp-file'&&request.method==='GET'){
        const id=url.searchParams.get('id'),fileId=url.searchParams.get('fileId');
        if(!/^[a-f0-9-]{36}$/.test(id||'')||!/^[a-f0-9-]{36}$/.test(fileId||''))return json({error:'파일을 찾을 수 없습니다.'},404);
        const file=(await store.get('webapp-files/'+id)||[]).find(entry=>entry.id===fileId);
        return file?download(file,fileStore):json({error:'파일을 찾을 수 없습니다.'},404);
      }
      if(action==='lesson-thumbnail'&&request.method==='GET'){
        const id=url.searchParams.get('id');
        if(!/^[a-f0-9-]{36}$/.test(id||''))return json({error:'썸네일을 찾을 수 없습니다.'},404);
        const item=(await store.get('lessons')||[]).find(entry=>entry.id===id);
        if(!item?.thumbnailKey||!fileStore)return json({error:'썸네일을 찾을 수 없습니다.'},404);
        const object=await fileStore.get(item.thumbnailKey);if(!object)return json({error:'썸네일을 찾을 수 없습니다.'},404);
        return new Response(object.body,{headers:{'Content-Type':item.thumbnailContentType,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
      }
      if(!['GET','POST'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405);
      let body;
      if(request.method==='POST'){
        if(request.headers.get('origin')!==url.origin)return json({error:'다른 사이트에서는 편집할 수 없습니다.'},403);
        if(['lesson-upload','lesson-thumbnail-upload','lesson-attachment-upload','webapp-attachment-upload'].includes(action)){
          if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return json({error:'파일 업로드 형식이 올바르지 않습니다.'},415);
          if(Number(request.headers.get('content-length')||0)>LESSON_FILE_LIMIT*MAX_ATTACHMENTS+THUMBNAIL_LIMIT+500000)return json({error:'업로드 용량을 초과했습니다.'},413);
        }else{
          if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON 요청이 필요합니다.'},415);
          const text=await request.text();if(encoder.encode(text).length>1000000)return json({error:'저장할 내용이 너무 큽니다.'},413);
          try{body=JSON.parse(text);}catch{return json({error:'요청 형식이 올바르지 않습니다.'},400);}
          if(!body||typeof body!=='object')return json({error:'요청 형식이 올바르지 않습니다.'},400);
        }
      }
      const token=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
      const sessionKey=/^[a-f0-9]{64}$/.test(token)?'session/'+await hash(token):null;
      const session=sessionKey?await store.get(sessionKey):null;
      const authenticated=session&&session.expires>Date.now()&&session.authVersion===authConfig.passwordHash&&!!authConfig.passwordHash;
      if(action==='lesson-upload'&&request.method==='POST'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        if(!fileStore)return json({error:'파일 저장소에 연결할 수 없습니다.'},503);
        const form=await request.formData(),files=form.getAll('file').filter(file=>file?.name),thumbnail=form.get('thumbnail'),title=form.get('title'),description=form.get('description')||'',urlValue=(form.get('url')||'').trim();
        const hasThumbnail=thumbnail&&typeof thumbnail.name==='string'&&thumbnail.name.length>0;
        if(!validLessonText(title,120,true)||!validLessonText(description,1000)||!validUrl(urlValue)||files.length<1||files.length>MAX_ATTACHMENTS||files.some(file=>!validUpload(file))||hasThumbnail&&(!THUMBNAIL_TYPES.has(thumbnail.type)||thumbnail.size<1||thumbnail.size>THUMBNAIL_LIMIT))return json({error:'제목, 웹앱 링크, 최대 5개의 자료 파일과 5MB 이하의 썸네일을 확인해주세요.'},400);
        const items=await store.get('lessons')||[];if(items.length>=100)return json({error:'자료는 최대 100개까지 등록할 수 있습니다.'},400);
        const id=crypto.randomUUID(),now=new Date().toISOString(),attachments=files.map(file=>attachmentFromFile(file,`lessons/${id}`)),first=attachments[0];
        const item={id,...first,title:title.trim(),description:description.trim(),url:urlValue,files:attachments,createdAt:now};
        if(hasThumbnail){const thumbnailExtension=thumbnail.type==='image/png'?'png':thumbnail.type==='image/webp'?'webp':'jpg';item.thumbnailKey=`lesson-thumbnails/${id}-${crypto.randomUUID()}.${thumbnailExtension}`;item.thumbnailContentType=thumbnail.type;item.thumbnailUpdatedAt=now;}
        for(let index=0;index<attachments.length;index++)await fileStore.put(attachments[index].key,files[index].stream(),{httpMetadata:{contentType:attachments[index].contentType}});
        if(item.thumbnailKey)await fileStore.put(item.thumbnailKey,thumbnail.stream(),{httpMetadata:{contentType:item.thumbnailContentType}});
        try{await store.set('lessons',[item,...items]);}catch(error){for(const file of attachments)await fileStore.delete(file.key);if(item.thumbnailKey)await fileStore.delete(item.thumbnailKey);throw error;}
        return json({item},201);
      }
      if(['lesson-attachment-upload','webapp-attachment-upload'].includes(action)&&request.method==='POST'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        if(!fileStore)return json({error:'파일 저장소에 연결할 수 없습니다.'},503);
        const form=await request.formData(),id=form.get('id'),uploads=form.getAll('file').filter(file=>file?.name);
        if(!/^[a-f0-9-]{36}$/.test(id||'')||uploads.length<1||uploads.length>MAX_ATTACHMENTS||uploads.some(file=>!validUpload(file)))return json({error:'25MB 이하의 지원 파일을 최대 5개까지 선택해주세요.'},400);
        if(action==='lesson-attachment-upload'){
          const items=await store.get('lessons')||[],index=items.findIndex(item=>item.id===id);if(index<0)return json({error:'자료를 찾을 수 없습니다.'},404);
          const current=itemFiles(items[index]);if(current.length+uploads.length>MAX_ATTACHMENTS)return json({error:'첨부파일은 게시물당 최대 5개입니다.'},400);
          const added=uploads.map(file=>attachmentFromFile(file,`lessons/${id}`));for(let i=0;i<added.length;i++)await fileStore.put(added[i].key,uploads[i].stream(),{httpMetadata:{contentType:added[i].contentType}});
          items[index]={...items[index],files:[...current,...added]};await store.set('lessons',items);return json({item:{...items[index],files:items[index].files.map(publicFile)}});
        }
        const key='webapp-files/'+id,current=await store.get(key)||[];if(current.length+uploads.length>MAX_ATTACHMENTS)return json({error:'첨부파일은 게시물당 최대 5개입니다.'},400);
        const added=uploads.map(file=>attachmentFromFile(file,`webapps/${id}`));for(let i=0;i<added.length;i++)await fileStore.put(added[i].key,uploads[i].stream(),{httpMetadata:{contentType:added[i].contentType}});const files=[...current,...added];await store.set(key,files);return json({items:files.map(publicFile)},201);
      }
      if(['lesson-attachment-delete','webapp-attachment-delete'].includes(action)&&request.method==='POST'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        if(action==='lesson-attachment-delete'){
          const items=await store.get('lessons')||[],index=items.findIndex(item=>item.id===body.id);if(index<0)return json({error:'자료를 찾을 수 없습니다.'},404);const files=itemFiles(items[index]),file=files.find(entry=>entry.id===body.fileId);if(!file)return json({error:'파일을 찾을 수 없습니다.'},404);if(files.length<=1)return json({error:'수업 아이디어에는 파일이 1개 이상 필요합니다.'},400);await fileStore?.delete(file.key);items[index]={...items[index],files:files.filter(entry=>entry.id!==body.fileId)};await store.set('lessons',items);return json({item:{...items[index],files:items[index].files.map(publicFile)}});
        }
        const key='webapp-files/'+body.id,files=await store.get(key)||[],file=files.find(entry=>entry.id===body.fileId);if(!file)return json({error:'파일을 찾을 수 없습니다.'},404);await fileStore?.delete(file.key);const remaining=files.filter(entry=>entry.id!==body.fileId);await store.set(key,remaining);return json({items:remaining.map(publicFile)});
      }
      if(action==='lesson-thumbnail-upload'&&request.method==='POST'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        if(!fileStore)return json({error:'파일 저장소에 연결할 수 없습니다.'},503);
        const form=await request.formData(),id=form.get('id'),thumbnail=form.get('thumbnail');
        if(!validLessonText(id,100,true)||!thumbnail||typeof thumbnail.stream!=='function'||!thumbnail.name||!THUMBNAIL_TYPES.has(thumbnail.type)||thumbnail.size<1||thumbnail.size>THUMBNAIL_LIMIT)return json({error:'5MB 이하의 PNG, JPG, WebP 이미지를 선택해주세요.'},400);
        const items=await store.get('lessons')||[],index=items.findIndex(item=>item.id===id);if(index<0)return json({error:'자료를 찾을 수 없습니다.'},404);
        const previousKey=items[index].thumbnailKey,extension=thumbnail.type==='image/png'?'png':thumbnail.type==='image/webp'?'webp':'jpg',thumbnailKey=`lesson-thumbnails/${id}-${crypto.randomUUID()}.${extension}`;
        await fileStore.put(thumbnailKey,thumbnail.stream(),{httpMetadata:{contentType:thumbnail.type}});
        items[index]={...items[index],thumbnailKey,thumbnailContentType:thumbnail.type,thumbnailUpdatedAt:new Date().toISOString()};
        try{await store.set('lessons',items);}catch(error){await fileStore.delete(thumbnailKey);throw error;}if(previousKey)await fileStore.delete(previousKey);
        return json({item:items[index]});
      }
      if(action==='lesson-update'&&request.method==='POST'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        if(!validLessonText(body.id,100,true)||!validLessonText(body.title,120,true)||!validLessonText(body.description,1000)||!validUrl(body.url||''))return json({error:'자료 제목, 설명과 웹앱 링크를 확인해주세요.'},400);
        const items=await store.get('lessons')||[],index=items.findIndex(item=>item.id===body.id);if(index<0)return json({error:'자료를 찾을 수 없습니다.'},404);
        items[index]={...items[index],title:body.title.trim(),description:body.description.trim(),url:(body.url||'').trim()};await store.set('lessons',items);return json({item:items[index]});
      }
      if(action==='lesson-delete'&&request.method==='POST'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        const items=await store.get('lessons')||[],item=items.find(entry=>entry.id===body.id);if(!item)return json({error:'자료를 찾을 수 없습니다.'},404);
        if(fileStore){for(const file of itemFiles(item))await fileStore.delete(file.key);if(item.thumbnailKey)await fileStore.delete(item.thumbnailKey);}await store.set('lessons',items.filter(entry=>entry.id!==body.id));return json({deleted:true});
      }
      if(action==='feedback'&&request.method==='GET'){
        if(!authenticated)return json({error:'관리자 로그인이 필요합니다.'},401);
        return json({items:await store.get('feedback/items')||[]});
      }
      if(action==='feedback'&&request.method==='POST'){
        const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
        if(!['bug','report','request'].includes(body.kind)||!text(body.appId,100,body.kind!=='request')||!text(body.appTitle,120,true)||!text(body.title,120,true)||!text(body.detail,3000,true)||!text(body.email,254)||(body.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)))return json({error:'앱, 제목, 내용, 이메일 형식을 확인해주세요.'},400);
        const rateKey='feedback/rate/'+await hash(request.headers.get('cf-connecting-ip')||'local');
        const rate=await store.get(rateKey);
        if(rate?.expires>Date.now()&&rate.count>=5)return json({error:'접수가 많습니다. 10분 후 다시 시도해주세요.'},429);
        const item={id:crypto.randomUUID(),kind:body.kind,appId:body.appId,appTitle:body.appTitle.trim(),title:body.title.trim(),detail:body.detail.trim(),email:body.email.trim(),createdAt:new Date().toISOString()};
        if(store.addFeedback){if(!await store.addFeedback(item))return json({error:'접수함이 가득 찼습니다. 이메일로 문의해주세요.'},503);}
        else {const items=await store.get('feedback/items')||[];if(items.length>=1000)return json({error:'접수함이 가득 찼습니다. 이메일로 문의해주세요.'},503);await store.set('feedback/items',[item,...items]);}
        await store.set(rateKey,{count:rate?.expires>Date.now()?rate.count+1:1,expires:rate?.expires>Date.now()?rate.expires:Date.now()+600000});
        return json({id:item.id},201);
      }
      if(action==='session'&&request.method==='GET')return authenticated?json({authenticated:true}):json({error:'로그인이 필요합니다.'},401);
      if(action==='login'&&request.method==='POST'){
        const rateKey='attempt/'+await hash(request.headers.get('cf-connecting-ip')||'local');
        const attempts=await store.get(rateKey)||{count:0,expires:0};
        if(attempts.expires>Date.now()&&attempts.count>=8)return json({error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'},429);
        if(!await correctPassword(body.password,authConfig)){await store.set(rateKey,{count:attempts.expires>Date.now()?attempts.count+1:1,expires:attempts.expires>Date.now()?attempts.expires:Date.now()+900000});return json({error:'비밀번호가 올바르지 않습니다.'},401);}
        const newToken=hex(crypto.getRandomValues(new Uint8Array(32)));
        await store.set('session/'+await hash(newToken),{expires:Date.now()+3600000,authVersion:authConfig.passwordHash});await store.delete(rateKey);
        return json({authenticated:true},200,{'Set-Cookie':cookie(newToken,3600)});
      }
      if(action==='logout'&&request.method==='POST'){if(sessionKey)await store.delete(sessionKey);return json({authenticated:false},200,{'Set-Cookie':cookie('',0)});}
      if(action==='save'&&request.method==='POST'){
        if(!authenticated)return json({error:'로그인이 만료되었습니다. 비밀번호를 다시 입력해주세요.'},401);
        if(!validValues(body.values)||(body.webapps!==undefined&&!validApps(body.webapps))||(body.menuOrder!==undefined&&!validMenuOrder(body.menuOrder)))return json({error:'제목, 링크, 이미지 또는 메뉴 순서 형식이 올바르지 않습니다.'},400);
        const previous=await store.get('content'),saved=await store.saveContent(body);
        if(saved&&fileStore){const nextIds=new Set((saved.webapps||[]).map(app=>app.id));for(const app of previous?.webapps||[]){if(nextIds.has(app.id))continue;const key='webapp-files/'+app.id;for(const file of await store.get(key)||[])await fileStore.delete(file.key);await store.delete(key);}}
        return saved?json({revision:saved.revision,updatedAt:saved.updatedAt}):json({error:'다른 창에서 내용이 변경되었습니다. 편집창을 닫고 다시 열어주세요.'},409);
      }
      return json({error:'요청을 찾을 수 없습니다.'},404);
    }catch(error){console.error('Editor request failed',error.name);return json({error:'저장 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'},500);}
  };
}
