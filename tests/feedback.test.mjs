import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from '../cloudflare/editor.mjs';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

test('feedback persists privately, validates input and limits repeated submissions',async()=>{
  const db=new Map();
  const handler=createEditor({get:async key=>db.get(key),set:async(key,value)=>db.set(key,value),delete:async key=>db.delete(key)});
  const origin='https://example.com';
  const payload={kind:'bug',appId:'other',appTitle:'테스트 앱',title:'버튼 오류',detail:'시작 버튼이 작동하지 않아요.',email:''};
  const send=(data=payload,from=origin)=>handler(new Request(origin+'/api/editor?action=feedback',{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(data)}));
  assert.equal((await send({...payload,title:' '})).status,400);
  assert.equal((await send(payload,'https://other.com')).status,403);
  assert.equal((await send()).status,201);
  assert.equal(db.get('feedback/items')[0].detail,payload.detail);
  assert.equal((await handler(new Request(origin+'/api/editor?action=feedback'))).status,401);
  assert.equal((await handler(new Request(origin+'/api/editor?action=content'))).status,200);
  for(let i=0;i<4;i++)assert.equal((await send({...payload,kind:'request',appId:''})).status,201);
  assert.equal((await send()).status,429);
});

test('feedback tabs allow new app requests and retain drafts after failure',async()=>{
  const html=readFileSync('index.html','utf8');
  const dom=new JSDOM(html,{url:'https://example.com',runScripts:'dangerously',beforeParse(w){
    Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
    w.IntersectionObserver=class{observe(){}};
    w.fetch=async(url)=>({ok:!url.endsWith('feedback'),status:503,json:async()=>url.endsWith('feedback')?{error:'서버 연결 실패'}:{values:{},webapps:[],revision:null}});
  }});
  try{
    const d=dom.window.document;
    const toolLink=d.querySelector('.tool-collection-link');
    assert.equal(toolLink.getAttribute('href'),'#lessons');
    assert.equal(toolLink.textContent.replace(/\s+/g,''),'교육아이디어&웹앱나눔바로가기');
    assert.equal(d.querySelectorAll('.art-label').length,0);
    assert.equal(d.querySelector('#feedback h3').textContent,'함께 더 좋은 앱을 만들어요');
    assert.equal(d.querySelector('#feedback').closest('section').id,'contact');
    assert.deepEqual([...d.querySelectorAll('main>section')].map(section=>section.id),['about','project','lessons','webapps','contact']);
    assert.equal(d.querySelector('.navlinks a:nth-child(3) span').textContent,'03');
    assert.equal(d.querySelector('.navlinks a:nth-child(3)').hash,'#lessons');
    assert.equal(d.querySelector('#feedback-request').textContent,'제작 요청');
    assert.equal(d.querySelector('#feedback-email').value,'');
    assert.equal(d.querySelector('#feedback-email').placeholder,'putyoure-mailadress.com');
    d.querySelector('#feedback-request').click();
    assert.equal(d.querySelector('#feedback-app').required,false);
    d.querySelector('#feedback-title').value='모둠 앱';d.querySelector('#feedback-detail').value='모둠을 만들어주세요';
    d.querySelector('#feedback-form').requestSubmit();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.match(d.querySelector('#feedback-message').textContent,/서버 연결 실패/);
    assert.equal(d.querySelector('#feedback-detail').value,'모둠을 만들어주세요');
  }finally{dom.window.close();}
});
