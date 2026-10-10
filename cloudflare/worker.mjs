import {createEditor} from './editor.mjs';
export class PortfolioStore{
  constructor(ctx){
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER)');
    this.handler=createEditor({
      get:async key=>{const rows=this.sql.exec('SELECT value FROM records WHERE key = ? AND (expires IS NULL OR expires > ?)',key,Date.now()).toArray();return rows.length?JSON.parse(rows[0].value):null;},
      set:async(key,value)=>{this.sql.exec('DELETE FROM records WHERE expires IS NOT NULL AND expires <= ?',Date.now());this.sql.exec('INSERT OR REPLACE INTO records (key,value,expires) VALUES (?,?,?)',key,JSON.stringify(value),value.expires||null);},
      delete:async key=>{this.sql.exec('DELETE FROM records WHERE key = ?',key);},
      saveContent:async body=>{
        // Synchronous compare/write prevents simultaneous editors overwriting each other.
        const rows=this.sql.exec("SELECT value FROM records WHERE key = 'content'").toArray();
        const current=rows.length?JSON.parse(rows[0].value):null;
        if((current?.revision||null)!==(body.revision||null))return null;
        const saved={values:body.values,webapps:body.webapps??current?.webapps??[],revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
        this.sql.exec("INSERT OR REPLACE INTO records (key,value) VALUES ('content',?)",JSON.stringify(saved));return saved;
      }
    });
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
