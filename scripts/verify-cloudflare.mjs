import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8787';
const origin=new URL(base).origin;
async function api(action,body,cookie){
  const response=await fetch(origin+'/api/editor?action='+action,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  return {response,data:await response.json()};
}
const page=await fetch(origin+'/');assert.equal(page.status,200);assert.match(await page.text(),/함께 쓰는 바이브코딩 웹앱/);
assert.equal((await api('login',{password:'wrong'})).response.status,401);
assert.equal((await api('save',{values:{},revision:null})).response.status,401);
const login=await api('login',{password:process.env.HANSOL_ADMIN_PASSWORD});assert.equal(login.response.status,200);
const cookie=login.response.headers.get('set-cookie').split(';')[0];assert.equal((await api('session',undefined,cookie)).response.status,200);
const initial=(await api('content')).data;
if(process.argv.includes('--write')){
  const app={id:'deploy-check-'+crypto.randomUUID(),title:'배포 검증용 (자동 삭제)',url:origin,thumbnail:'data:image/jpeg;base64,'+readFileSync(new URL('../tests/test-thumbnail.jpg',import.meta.url)).toString('base64')};
  const values=initial.values||{};const apps=initial.webapps||[];
  const added=await api('save',{values,webapps:[...apps,app],revision:initial.revision},cookie);assert.equal(added.response.status,200,JSON.stringify(added.data));
  let published=(await api('content')).data;assert.equal(published.webapps.at(-1).title,app.title);
  const edited={...app,title:'배포 수정 검증용 (자동 삭제)'};
  const updated=await api('save',{values,webapps:published.webapps.map(item=>item.id===app.id?edited:item),revision:published.revision},cookie);assert.equal(updated.response.status,200);
  published=(await api('content')).data;assert.equal(published.webapps.at(-1).title,edited.title);
  const deleted=await api('save',{values,webapps:apps,revision:published.revision},cookie);assert.equal(deleted.response.status,200);
  const restored=(await api('content')).data;assert.deepEqual(restored.values,values);assert.deepEqual(restored.webapps,apps);
  console.log('PASS: thumbnail upload, public read, edit, deletion, original content preserved.');
}
assert.equal((await api('logout',{},cookie)).response.status,200);
assert.equal((await api('session',undefined,cookie)).response.status,401);
console.log('PASS: homepage, password rejection, authentication, secure session, logout at '+origin);
