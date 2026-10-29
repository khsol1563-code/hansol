import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from '../cloudflare/editor.mjs';
import {testAuth} from './test-auth.mjs';

const origin='https://example.com';
test('lesson order can be changed only by an authenticated administrator',async()=>{
  const data=new Map([['lessons',[{id:'first',title:'첫 자료',files:[]},{id:'second',title:'둘째 자료',files:[]}]]]);
  const store={get:async key=>structuredClone(data.get(key)),set:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key)};
  const handler=createEditor(store,testAuth),request=(body,cookie)=>new Request(origin+'/api/editor?action=lesson-reorder',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  assert.equal((await handler(request({order:['second','first']}))).status,401);
  const login=await handler(new Request(origin+'/api/editor?action=login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'test-only-admin-password-2026'})})),cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await handler(request({order:['first']},cookie))).status,400);
  const reordered=await handler(request({order:['second','first']},cookie));assert.equal(reordered.status,200);assert.deepEqual((await reordered.json()).items.map(item=>item.id),['second','first']);assert.deepEqual(data.get('lessons').map(item=>item.id),['second','first']);
});

test('lesson resources can be uploaded, edited, downloaded and deleted by an administrator',async()=>{
  const data=new Map(),files=new Map();
  const store={get:async key=>structuredClone(data.get(key)),set:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key)};
  const fileStore={put:async(key,body)=>files.set(key,new Uint8Array(await new Response(body).arrayBuffer())),get:async key=>files.has(key)?{body:files.get(key)}:null,delete:async key=>files.delete(key)};
  const handler=createEditor(store,testAuth,fileStore);
  const jsonRequest=(action,body,cookie)=>new Request(origin+'/api/editor?action='+action,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  assert.deepEqual(await (await handler(jsonRequest('lessons'))).json(),{items:[]});
  const form=new FormData();form.set('title','AI 수업 지도안');form.set('description','수업에서 바로 활용할 수 있습니다.');form.set('file',new File(['lesson-content'],'lesson.pdf',{type:'application/pdf'}));form.set('thumbnail',new File(['thumbnail-one'],'cover.png',{type:'image/png'}));
  const uploadRequest=cookie=>new Request(origin+'/api/editor?action=lesson-upload',{method:'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})},body:form});
  assert.equal((await handler(uploadRequest())).status,401);
  const login=await handler(jsonRequest('login',{password:'test-only-admin-password-2026'}));const cookie=login.headers.get('set-cookie').split(';')[0];
  const uploaded=await handler(uploadRequest(cookie));assert.equal(uploaded.status,201);const item=(await uploaded.json()).item;assert.equal(item.title,'AI 수업 지도안');
  const publicItems=(await (await handler(jsonRequest('lessons'))).json()).items;assert.equal(publicItems.length,1);assert.equal(publicItems[0].fileName,'lesson.pdf');
  const download=await handler(jsonRequest('lesson-file&id='+item.id));assert.equal(download.status,200);assert.equal(await download.text(),'lesson-content');assert.match(download.headers.get('content-disposition'),/lesson\.pdf/);
  const thumbnail=await handler(jsonRequest('lesson-thumbnail&id='+item.id));assert.equal(thumbnail.status,200);assert.equal(await thumbnail.text(),'thumbnail-one');assert.equal(thumbnail.headers.get('content-type'),'image/png');
  const previousThumbnailKey=item.thumbnailKey,thumbnailForm=new FormData();thumbnailForm.set('id',item.id);thumbnailForm.set('thumbnail',new File(['thumbnail-two'],'new-cover.webp',{type:'image/webp'}));
  const changed=await handler(new Request(origin+'/api/editor?action=lesson-thumbnail-upload',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:thumbnailForm}));assert.equal(changed.status,200);assert.equal(files.has(previousThumbnailKey),false);assert.equal(await (await handler(jsonRequest('lesson-thumbnail&id='+item.id))).text(),'thumbnail-two');
  const updated=await handler(jsonRequest('lesson-update',{id:item.id,title:'수정한 지도안',description:'수정 설명'},cookie));assert.equal(updated.status,200);assert.equal((await updated.json()).item.title,'수정한 지도안');
  const deleted=await handler(jsonRequest('lesson-delete',{id:item.id},cookie));assert.equal(deleted.status,200);assert.equal(files.size,0);assert.deepEqual((await (await handler(jsonRequest('lessons'))).json()).items,[]);
});

test('lesson and webapp posts support links and up to five attachments',async()=>{
  const data=new Map(),files=new Map();
  const store={get:async key=>structuredClone(data.get(key)),set:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key),saveContent:async body=>{const current=data.get('content');if((current?.revision||null)!==(body.revision||null))return null;const saved={values:body.values,webapps:body.webapps,menuOrder:body.menuOrder,menuOrderVersion:body.menuOrderVersion,revision:crypto.randomUUID()};data.set('content',structuredClone(saved));return saved;}};
  const fileStore={put:async(key,body)=>files.set(key,new Uint8Array(await new Response(body).arrayBuffer())),get:async key=>files.has(key)?{body:files.get(key)}:null,delete:async key=>files.delete(key)};
  const handler=createEditor(store,testAuth,fileStore),request=(action,body,cookie)=>new Request(origin+'/api/editor?action='+action,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const login=await handler(request('login',{password:'test-only-admin-password-2026'}));const cookie=login.headers.get('set-cookie').split(';')[0];
  const lessonForm=new FormData();lessonForm.set('title','연결형 수업 자료');lessonForm.set('description','링크와 여러 파일');lessonForm.set('url','https://example.com/lesson-app');lessonForm.append('file',new File(['one'],'one.pdf',{type:'application/pdf'}));lessonForm.append('file',new File(['two'],'two.pptx',{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));
  const lessonResponse=await handler(new Request(origin+'/api/editor?action=lesson-upload',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:lessonForm}));assert.equal(lessonResponse.status,201);const lesson=(await lessonResponse.json()).item;assert.equal(lesson.url,'https://example.com/lesson-app');assert.equal(lesson.files.length,2);
  const extraForm=new FormData();extraForm.set('id',lesson.id);for(const name of ['three.docx','four.xlsx','five.zip'])extraForm.append('file',new File([name],name));
  const extraResponse=await handler(new Request(origin+'/api/editor?action=lesson-attachment-upload',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:extraForm}));assert.equal(extraResponse.status,200);assert.equal((await extraResponse.json()).item.files.length,5);
  const sixthForm=new FormData();sixthForm.set('id',lesson.id);sixthForm.set('file',new File(['six'],'six.pdf'));assert.equal((await handler(new Request(origin+'/api/editor?action=lesson-attachment-upload',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:sixthForm}))).status,400);
  const lessonPublic=(await (await handler(request('lessons'))).json()).items[0];const secondDownload=await handler(request('lesson-file&id='+lesson.id+'&fileId='+lessonPublic.files[1].id));assert.equal(await secondDownload.text(),'two');

  const app={id:crypto.randomUUID(),title:'공유 도구',url:'https://example.com/tool',thumbnail:'data:image/jpeg;base64,YQ=='};assert.equal((await handler(request('save',{values:{},webapps:[app],revision:null},cookie))).status,200);
  const appForm=new FormData();appForm.set('id',app.id);appForm.append('file',new File(['guide'],'guide.pdf'));appForm.append('file',new File(['slides'],'slides.pptx'));
  const appUpload=await handler(new Request(origin+'/api/editor?action=webapp-attachment-upload',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:appForm}));assert.equal(appUpload.status,201);const appFiles=(await appUpload.json()).items;assert.equal(appFiles.length,2);
  const content=await (await handler(request('content'))).json();assert.equal(content.webapps[0].attachments.length,2);const appDownload=await handler(request('webapp-file&id='+app.id+'&fileId='+appFiles[0].id));assert.equal(await appDownload.text(),'guide');
  assert.equal((await handler(request('webapp-attachment-delete',{id:app.id,fileId:appFiles[0].id},cookie))).status,200);
});
