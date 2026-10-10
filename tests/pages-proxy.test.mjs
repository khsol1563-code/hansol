import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/editor.js';
test('Pages proxy validates origin and preserves body and secure cookies',async()=>{
  const originalFetch=globalThis.fetch;
  const origin='https://hansol-97l.pages.dev';
  try{
    let called=false;
    globalThis.fetch=async(url,options)=>{
      called=true;assert.equal(String(url),'https://hansol-portfolio.khsol1563.workers.dev/api/editor?action=login');
      assert.equal(options.headers.get('origin'),'https://hansol-portfolio.khsol1563.workers.dev');
      assert.equal(options.headers.get('cookie'),'__Host-hansol_admin=existing');
      assert.equal(await new Response(options.body).text(),'{"password":"12345"}');
      return new Response('{"authenticated":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'__Host-hansol_admin=token; Path=/; HttpOnly; Secure; SameSite=Strict'}});
    };
    const request=source=>new Request(origin+'/api/editor?action=login',{method:'POST',headers:{Origin:source,Cookie:'__Host-hansol_admin=existing','Content-Type':'application/json'},body:JSON.stringify({password:'12345'})});
    assert.equal((await onRequest({request:request('https://attacker.example')})).status,403);assert.equal(called,false);
    const response=await onRequest({request:request(origin)});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.deepEqual(await response.json(),{authenticated:true});
  }finally{globalThis.fetch=originalFetch;}
});
