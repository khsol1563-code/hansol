import assert from 'node:assert/strict';

const origin=new URL(process.argv[2]||'http://127.0.0.1:8787').origin;
const headers=(cookie,json=false)=>({Origin:origin,...(cookie?{Cookie:cookie}:{}),...(json?{'Content-Type':'application/json'}:{})});
const json=async(action,body,cookie)=>{const response=await fetch(origin+'/api/editor?action='+action,{method:body?'POST':'GET',headers:headers(cookie,!!body),body:body?JSON.stringify(body):undefined});let data={};try{data=await response.json();}catch{}return {response,data};};
const login=await json('login',{password:process.env.HANSOL_ADMIN_PASSWORD});assert.equal(login.response.status,200,'administrator login failed');
const cookie=login.response.headers.get('set-cookie').split(';')[0];
let lessonId=null,appId=crypto.randomUUID(),appFiles=[];
try{
  const lessonForm=new FormData();lessonForm.set('title','배포 첨부 검증용 (자동 삭제)');lessonForm.set('description','자동 검증 후 삭제됩니다.');lessonForm.set('url',origin+'/#webapps');lessonForm.append('file',new File(['guide'],'verify-guide.pdf',{type:'application/pdf'}));lessonForm.append('file',new File(['slides'],'verify-slides.pptx',{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));
  const lessonResponse=await fetch(origin+'/api/editor?action=lesson-upload',{method:'POST',headers:headers(cookie),body:lessonForm});assert.equal(lessonResponse.status,201);const lesson=(await lessonResponse.json()).item;lessonId=lesson.id;assert.equal(lesson.files.length,2);assert.equal(lesson.url,origin+'/#webapps');
  const lessonDownload=await fetch(origin+'/api/editor?action=lesson-file&id='+lesson.id+'&fileId='+lesson.files[1].id);assert.equal(await lessonDownload.text(),'slides');

  const appForm=new FormData();appForm.set('id',appId);appForm.append('file',new File(['map'],'reference-map.pdf',{type:'application/pdf'}));appForm.append('file',new File(['deck'],'reference-deck.pptx',{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}));
  const appResponse=await fetch(origin+'/api/editor?action=webapp-attachment-upload',{method:'POST',headers:headers(cookie),body:appForm});assert.equal(appResponse.status,201);appFiles=(await appResponse.json()).items;assert.equal(appFiles.length,2);
  const appDownload=await fetch(origin+'/api/editor?action=webapp-file&id='+appId+'&fileId='+appFiles[0].id);assert.equal(await appDownload.text(),'map');
  console.log('PASS: live lesson link, two lesson files, two webapp files and downloads at '+origin);
}finally{
  if(lessonId)await json('lesson-delete',{id:lessonId},cookie);
  for(const file of appFiles)await json('webapp-attachment-delete',{id:appId,fileId:file.id},cookie);
  await json('logout',{},cookie);
}
