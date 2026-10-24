import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from '../cloudflare/editor.mjs';
import {testAuth} from './test-auth.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const origin='https://example.com';
const request=(action,body,cookie)=>new Request(origin+'/api/editor?action='+action,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
test('missing or malformed authentication secrets fail closed',async()=>{
 const store={get:async()=>null,set:async()=>{},delete:async()=>{}};
 for(const config of [{},{passwordHash:'bad',passwordSalt:'short'}])assert.equal((await createEditor(store,config)(request('login',{password:'test-only-admin-password-2026'}))).status,401);
});
test('legacy sessions and sessions from an older password cannot authorize',async()=>{
 const token='a'.repeat(64);const key='session/'+createHash('sha256').update(token).digest('hex');
 for(const authVersion of [undefined,'b'.repeat(64)]){const store={get:async k=>k===key?{expires:Date.now()+60000,authVersion}:null};assert.equal((await createEditor(store,testAuth)(request('session',null,'__Host-hansol_admin='+token))).status,401);}
});
test('new authenticated session lasts one hour and is bound to password version',async()=>{
 const data=new Map();const store={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)};
 const login=await createEditor(store,testAuth)(request('login',{password:'test-only-admin-password-2026'}));assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Max-Age=3600/);assert.equal([...data.values()][0].authVersion,testAuth.passwordHash);
});
test('deployed authentication settings accept the administrator password',async()=>{
 const config=JSON.parse(readFileSync(new URL('../cloudflare/wrangler.jsonc',import.meta.url),'utf8')).vars;
 const data=new Map();const store={get:async k=>data.get(k),set:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)};
 assert.equal((await createEditor(store,{passwordHash:config.ADMIN_PASSWORD_HASH,passwordSalt:config.ADMIN_PASSWORD_SALT})(request('login',{password:'12345'}))).status,200);
});
