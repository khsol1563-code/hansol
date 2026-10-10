(() => {
  const selector = 'h1,.intro,.name span,.section-heading h2,.section-heading p,.feature h3,.feature p,.date,.role h4,.row .period,.row strong,.row p,.education strong,.education p,.award strong,.award p,.award time,#contact h2,#contact p,.contact-link strong';
  const fields = [...document.querySelectorAll(selector)].map((el, i) => {
    el.dataset.edit = 'e' + i;
    return {el, id: 'e' + i, original: el.innerText, section: el.closest('section').id};
  });
  const dialog = document.querySelector('#admin-dialog');
  const message = document.querySelector('#admin-message');
  const loginView = document.querySelector('#login-view');
  const editorView = document.querySelector('#editor-view');
  let revision = null;
  let loading;
  const status = text => {message.textContent = text;};
  async function api(action, method='GET', data) {
    const response = await fetch('/.netlify/functions/editor?action=' + action, {method, credentials:'same-origin', cache:'no-store', headers: data ? {'Content-Type':'application/json'} : {}, body:data ? JSON.stringify(data) : undefined});
    let result;
    try {result = await response.json();} catch {throw new Error('서버 편집 기능이 아직 연결되지 않았습니다. Netlify 서버 배포를 먼저 완료해주세요.');}
    if (!response.ok) {const error = new Error(result.error || '요청을 처리하지 못했습니다.'); error.status=response.status; throw error;}
    return result;
  }
  function apply(values) {
    fields.forEach(({el,id}) => {
      if(typeof values?.[id]!=='string')return;
      if(el.tagName==='H1'){
        const lines=values[id].split('\n');el.replaceChildren(document.createTextNode(lines.shift()));
        if(lines.length){el.append(document.createElement('br'));const accent=document.createElement('em');accent.textContent=lines.join('\n');el.append(accent);}
      }else el.textContent=values[id];
    });
    const email = document.querySelector('.contact-link strong').textContent.trim();
    document.querySelector('.contact-link').href='mailto:' + email;
  }
  async function loadContent() {
    const result = await api('content');
    revision = result.revision;
    apply(result.values);
  }
  function renderFields() {
    const container = document.querySelector('#editor-fields');
    container.replaceChildren();
    let section;
    fields.forEach(({id,el,section:group},index) => {
      if(section!==group){const heading=document.createElement('h3'); heading.textContent=({about:'소개',project:'프로젝트 · 경력 · 학력 · 수상',contact:'연락'})[group];container.append(heading);section=group;}
      const label=document.createElement('label');label.htmlFor='edit-'+id;label.textContent=el.textContent.trim().slice(0,40)||'내용 '+(index+1);
      const input=document.createElement(el.matches('.contact-link strong')?'input':'textarea');
      input.id='edit-'+id;input.name=id;input.maxLength=3000;input.value=el.innerText;
      if(el.matches('.contact-link strong')){input.type='email';input.required=true;}
      container.append(label,input);
    });
  }
  function showEditor(){loginView.hidden=true;editorView.hidden=false;renderFields();document.querySelector('#editor-fields textarea')?.focus();}
  document.querySelector('#admin-open').addEventListener('click', async()=>{
    dialog.showModal();status('접속 상태를 확인하고 있습니다.');
    try{await loading;await api('session');showEditor();status('');}
    catch(error){loginView.hidden=false;editorView.hidden=true;status(error.status===401?'':error.message);document.querySelector('#admin-password').focus();}
  });
  document.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
  document.querySelector('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;status('로그인 중입니다.');
    try{await api('login','POST',{password:document.querySelector('#admin-password').value});document.querySelector('#admin-password').value='';await loadContent();showEditor();status('');}
    catch(error){status(error.message);}finally{button.disabled=false;}
  });
  document.querySelector('#editor-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;status('사이트에 저장하고 있습니다.');
    const values=Object.fromEntries(new FormData(event.target));
    try{const result=await api('save','POST',{values,revision});revision=result.revision;apply(values);status('저장했습니다. 방문자는 새로고침하면 수정된 내용을 볼 수 있습니다.');}
    catch(error){if(error.status===401){loginView.hidden=false;editorView.hidden=true;}status(error.message);}finally{button.disabled=false;}
  });
  document.querySelector('#admin-logout').addEventListener('click',async()=>{try{await api('logout','POST',{});editorView.hidden=true;loginView.hidden=false;status('로그아웃했습니다.');}catch(error){status(error.message);}});
  loading=loadContent().catch(error=>{console.info('관리자 서버 연결 대기:',error.message);});
})();
