import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script[1]);
mkdirSync('cloudflare/public',{recursive:true});
writeFileSync('cloudflare/public/index.html',html);
for(const asset of ['app.webmanifest','app-icon.svg'])copyFileSync('hansol-live-site/public/'+asset,'cloudflare/public/'+asset);
copyFileSync('cloudflare/sw.js','cloudflare/public/sw.js');
writeFileSync('cloudflare/public/_headers','/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n');
console.log('Cloudflare site assets built and JavaScript syntax verified.');
