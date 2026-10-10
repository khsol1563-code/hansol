const BACKEND='https://hansol-portfolio.khsol1563.workers.dev';
export async function onRequest({request}){
  const url=new URL(request.url);
  if(request.method==='POST'&&request.headers.get('origin')!==url.origin){
    return new Response(JSON.stringify({error:'다른 사이트에서는 편집할 수 없습니다.'}),{status:403,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }
  const upstream=new URL('/api/editor'+url.search,BACKEND);
  const headers=new Headers(request.headers);
  // Validate the visitor's origin above, then forward the same authenticated
  // request through this site's Cloudflare Pages function to the storage Worker.
  if(request.method==='POST')headers.set('origin',upstream.origin);
  const response=await fetch(upstream,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
  return new Response(response.body,{status:response.status,headers:response.headers});
}
