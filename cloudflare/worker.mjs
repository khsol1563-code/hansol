import {createEditor} from './editor.mjs';
export class PortfolioStore{
  constructor(ctx,env={}){
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS lesson_file_chunks (file_key TEXT NOT NULL, chunk_index INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_key, chunk_index))');
    const fileStore={
      put:async(key,body)=>{
        const buffer=await new Response(body).arrayBuffer(),chunkSize=1024*1024;
        this.sql.exec('DELETE FROM lesson_file_chunks WHERE file_key = ?',key);
        for(let offset=0,index=0;offset<buffer.byteLength;offset+=chunkSize,index++)this.sql.exec('INSERT INTO lesson_file_chunks (file_key,chunk_index,data) VALUES (?,?,?)',key,index,buffer.slice(offset,Math.min(offset+chunkSize,buffer.byteLength)));
      },
      get:async key=>{
        const rows=this.sql.exec('SELECT data FROM lesson_file_chunks WHERE file_key = ? ORDER BY chunk_index',key).toArray();if(!rows.length)return null;
        const chunks=rows.map(row=>new Uint8Array(row.data)),size=chunks.reduce((total,chunk)=>total+chunk.byteLength,0),joined=new Uint8Array(size);let offset=0;
        for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}return {body:joined};
      },
      delete:async key=>{this.sql.exec('DELETE FROM lesson_file_chunks WHERE file_key = ?',key);}
    };
    this.handler=createEditor({
      get:async key=>{const rows=this.sql.exec('SELECT value FROM records WHERE key = ? AND (expires IS NULL OR expires > ?)',key,Date.now()).toArray();return rows.length?JSON.parse(rows[0].value):null;},
      set:async(key,value)=>{this.sql.exec('DELETE FROM records WHERE expires IS NOT NULL AND expires <= ?',Date.now());this.sql.exec('INSERT OR REPLACE INTO records (key,value,expires) VALUES (?,?,?)',key,JSON.stringify(value),value.expires||null);},
      delete:async key=>{this.sql.exec('DELETE FROM records WHERE key = ?',key);},
      addFeedback:async item=>{
        const rows=this.sql.exec("SELECT value FROM records WHERE key = 'feedback/items'").toArray();
        const items=rows.length?JSON.parse(rows[0].value):[];
        if(items.length>=1000)return false;
        this.sql.exec("INSERT OR REPLACE INTO records (key,value) VALUES ('feedback/items',?)",JSON.stringify([item,...items]));return true;
      },
      saveContent:async body=>{
        // Synchronous compare/write prevents simultaneous editors overwriting each other.
        const rows=this.sql.exec("SELECT value FROM records WHERE key = 'content'").toArray();
        const current=rows.length?JSON.parse(rows[0].value):null;
        if((current?.revision||null)!==(body.revision||null))return null;
        const saved={values:body.values,webapps:body.webapps??current?.webapps??[],menuOrder:body.menuOrder??current?.menuOrder??['about','project','lessons','webapps','contact'],menuOrderVersion:body.menuOrderVersion??current?.menuOrderVersion??2,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
        this.sql.exec("INSERT OR REPLACE INTO records (key,value) VALUES ('content',?)",JSON.stringify(saved));return saved;
      }
    },{passwordHash:env.ADMIN_PASSWORD_HASH,passwordSalt:env.ADMIN_PASSWORD_SALT},fileStore);
  }
  fetch(request){return this.handler(request);}
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/api/editor'||path==='/.netlify/functions/editor'){
      return env.PORTFOLIO.get(env.PORTFOLIO.idFromName('hansol-production')).fetch(request);
    }
    if(path.startsWith('/api/'))return new Response('Not found',{status:404});
    return env.ASSETS.fetch(request);
  }
};
