import {readFileSync,existsSync} from 'node:fs';
const html=readFileSync('public/index.html','utf8');
if(/010-9467|tel:/.test(html))throw new Error('Phone number must be removed');
for(const name of ['public/admin.js','public/hero-character.png','netlify/functions/editor.mjs'])if(!existsSync(name))throw new Error('Missing '+name);
console.log('Website and server assets verified.');
