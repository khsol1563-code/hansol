import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from './test-auth.mjs';
function setup(){
  const data=new Map();
  return createEditor({get:async key=>structuredClone(data.get(key)),set:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key),saveContent:async body=>{
    const current=data.get('content');if((current?.revision||null)!==(body.revision||null))return null;
    const saved={values:body.values,webapps:body.webapps??current?.webapps??[],menuOrder:body.menuOrder??current?.menuOrder,menuOrderVersion:body.menuOrderVersion??current?.menuOrderVersion,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};data.set('content',structuredClone(saved));return saved;
  }});
}
const origin='https://hansol.example.workers.dev';
function request(action,body,cookie,headers={}){return new Request(origin+'/api/editor?action='+action,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});}
test('Cloudflare authentication and public persistence, edits, deletion, CSRF and logout',async()=>{
  const handler=setup();
  assert.equal((await handler(request('save',{values:{}}))).status,401);
  assert.equal((await handler(request('login',{password:'wrong'}))).status,401);
  const login=await handler(request('login',{password:'test-only-admin-password-2026'}));assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await handler(request('session',null,cookie))).status,200);
  const app={id:'sample',title:'수업 도구',url:'https://example.com',thumbnail:'data:image/jpeg;base64,YQ=='};
  const menuOrder=['about','project','lessons','webapps','contact'];
  assert.equal((await handler(request('save',{values:{e0:'고한솔'},webapps:[app],menuOrder,menuOrderVersion:2},cookie))).status,200);
  let content=await (await handler(request('content'))).json();assert.deepEqual(content.webapps,[app]);assert.equal(content.values.e0,'고한솔');assert.deepEqual(content.menuOrder,menuOrder);assert.equal(content.menuOrderVersion,2);
  assert.equal((await handler(request('save',{values:{},revision:null},cookie))).status,409);
  assert.equal((await handler(request('save',{values:{e0:'소개 수정'},revision:content.revision},cookie))).status,200);
  content=await (await handler(request('content'))).json();assert.deepEqual(content.webapps,[app]);
  for(const invalid of [{...app,url:'javascript:alert(1)'},{...app,thumbnail:'data:image/svg+xml;base64,YQ=='},{...app,title:''}])assert.equal((await handler(request('save',{values:{},webapps:[invalid],revision:content.revision},cookie))).status,400);
  assert.equal((await handler(request('save',{values:{},menuOrder:['about','project'],revision:content.revision},cookie))).status,400);
  assert.equal((await handler(request('save',{values:{},menuOrderVersion:3,revision:content.revision},cookie))).status,400);
  assert.equal((await handler(request('save',{values:{},webapps:[],revision:content.revision},cookie,{Origin:'https://attacker.example'}))).status,403);
  assert.equal((await handler(request('save',{values:{e0:'최종'},webapps:[],revision:content.revision},cookie))).status,200);
  assert.deepEqual((await (await handler(request('content'))).json()).webapps,[]);
  assert.equal((await handler(request('logout',{},cookie))).status,200);
  assert.equal((await handler(request('session',null,cookie))).status,401);
});
test('Cloudflare rate limit and malformed request validation',async()=>{
  const handler=setup();
  for(let i=0;i<8;i++)assert.equal((await handler(request('login',{password:'wrong'}))).status,401);
  assert.equal((await handler(request('login',{password:'test-only-admin-password-2026'}))).status,429);
  assert.equal((await handler(new Request(origin+'/api/editor?action=login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{'}))).status,400);
});
