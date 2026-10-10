import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../netlify/lib/editor-handler.mjs';
const db=new Map();
const handler=createHandler({get:async key=>db.get(key)||null,setJSON:async(key,value)=>db.set(key,structuredClone(value)),delete:async key=>db.delete(key)});
function request(action,body,cookie,origin='https://example.netlify.app'){return new Request('https://example.netlify.app/.netlify/functions/editor?action='+action,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});}
test('authentication, shared persistence, conflict, CSRF, logout',async()=>{
  assert.equal((await handler(request('save',{values:{e0:'hello'}}))).status,401);
  assert.equal((await handler(request('login',{password:'wrong'}))).status,401);
  const login=await handler(request('login',{password:'12345'}));assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await handler(request('session',null,cookie))).status,200);
  assert.equal((await handler(request('save',{values:{e0:'new'},revision:null},cookie,'https://attacker.example'))).status,403);
  const save=await handler(request('save',{values:{e0:'새로운 소개'},revision:null},cookie));assert.equal(save.status,200);
  const content=await (await handler(request('content'))).json();assert.equal(content.values.e0,'새로운 소개');
  assert.equal((await handler(request('save',{values:{e0:'old'},revision:null},cookie))).status,409);
  assert.equal((await handler(request('save',{values:{bad:'x'},revision:content.revision},cookie))).status,400);
  assert.equal((await handler(request('logout',{},cookie))).status,200);
  assert.equal((await handler(request('session',null,cookie))).status,401);
});
test('repeated incorrect passwords are rate limited',async()=>{
  for(let i=0;i<8;i++)assert.equal((await handler(request('login',{password:'wrong'}),{ip:'test-ip'})).status,401);
  assert.equal((await handler(request('login',{password:'12345'}),{ip:'test-ip'})).status,429);
});
test('webapps persist, survive text saves, and reject unsafe links and images',async()=>{
  const memory=new Map();
  const appHandler=createHandler({get:async key=>memory.get(key)||null,setJSON:async(key,value)=>memory.set(key,structuredClone(value)),delete:async key=>memory.delete(key)});
  const login=await appHandler(request('login',{password:'12345'}));
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const app={id:'test-app',title:'수업 도구',url:'https://example.com/tool',thumbnail:'data:image/jpeg;base64,YQ=='};
  assert.equal((await appHandler(request('save',{values:{e0:'소개'},revision:null,webapps:[app]},cookie))).status,200);
  let content=await (await appHandler(request('content'))).json();
  assert.deepEqual(content.webapps,[app]);
  assert.equal((await appHandler(request('save',{values:{e0:'수정'},revision:content.revision},cookie))).status,200);
  content=await (await appHandler(request('content'))).json();assert.deepEqual(content.webapps,[app]);
  for(const invalid of [{...app,url:'javascript:alert(1)'},{...app,thumbnail:'data:image/svg+xml;base64,YQ=='},{...app,title:''}]){
    assert.equal((await appHandler(request('save',{values:{},revision:content.revision,webapps:[invalid]},cookie))).status,400);
  }
  assert.equal((await appHandler(request('save',{values:{},revision:content.revision,webapps:[]}))).status,401);
  assert.equal((await appHandler(request('save',{values:{},revision:content.revision,webapps:[]},cookie))).status,200);
  assert.deepEqual((await (await appHandler(request('content'))).json()).webapps,[]);
});
