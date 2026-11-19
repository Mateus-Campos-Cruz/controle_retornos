const settings=(()=>{
  const roles=['ADMINISTRADOR','GESTOR','USUÁRIO'];
  const labels={cobrador:'Cobradores',empresa:'Empresas',tipo:'Tipos de contato',recebido:'Meios de recebimento'};
  let users=[],catalogs={cobrador:[],empresa:[],tipo:[],recebido:[]},tab='profile',category='cobrador';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function load(data){users=data.users||[];catalogs={cobrador:[],empresa:[],tipo:[],recebido:[],...data.catalogs};}
  function current(){return sessionUser;}
  function requireAdmin(){if(current()?.role!=='ADMINISTRADOR')throw Error('Acesso exclusivo do administrador.');}
  function values(key){return [...(catalogs[key]||[])];}
  function options(key,selected='',history=false){const list=values(key);if(history)for(const r of records)if(r[key]&&!list.includes(r[key]))list.push(r[key]);if(selected&&!list.includes(selected))list.push(selected);return list.map(v=>`<option value="${escape(v)}" ${v===selected?'selected':''}>${escape(v)}${!catalogs[key].includes(v)?' (removido do catálogo)':''}</option>`).join('');}
  function render(){
    if(role!=='ADMINISTRADOR')tab='profile';const me=current();
    const tabs=[['profile','Meu perfil'],...(role==='ADMINISTRADOR'?[['users','Gerenciamento de usuários'],['catalogs','Catálogos do formulário']]:[])];let body='';
    if(tab==='profile')body=`<div class="card panel"><h2>Informações do perfil</h2><dl class="profile-grid">${[['Nome',me.name],['E-mail',me.email],['Perfil de acesso',me.role],['Área',me.area]].map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><button class="primary" data-change-password>Alterar minha senha</button></div>`;
    if(tab==='users')body=`<div class="card panel"><div class="panel-title"><h3>Usuários (${users.length})</h3><button class="primary" data-user-new>+ Adicionar usuário</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Área</th><th>Senha</th><th>Ações</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escape(u.name)}</td><td>${escape(u.email)}</td><td>${escape(u.role)}</td><td>${escape(u.area)}</td><td>${u.mustChangePassword?'Troca pendente':'Cadastrada'}</td><td><div class="row-actions"><button data-user-edit="${escape(u.id)}">Editar</button>${u.id!==me.id?`<button data-user-reset="${escape(u.id)}">Redefinir senha</button><button class="danger" data-user-delete="${escape(u.id)}">Desativar</button>`:''}</div></td></tr>`).join('')}</tbody></table></div></div>`;
    if(tab==='catalogs')body=`<div class="card panel"><div class="panel-title"><div class="field"><label for="catalogCategory">Catálogo</label><select id="catalogCategory">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${category===key?'selected':''}>${label}</option>`).join('')}</select></div><button class="primary" data-catalog-new>+ Adicionar item</button></div><p>Remover impede novos cadastros com esse item e preserva os registros existentes.</p><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Ações</th></tr></thead><tbody>${catalogs[category].map((v,i)=>`<tr><td>${escape(v)}</td><td><div class="row-actions"><button data-catalog-edit="${i}">Editar</button><button class="danger" data-catalog-delete="${i}">Remover</button></div></td></tr>`).join('')||'<tr><td colspan="2">Nenhum item cadastrado.</td></tr>'}</tbody></table></div></div>`;
    return `<div class="view-head"><div><div class="eyebrow">Preferências e administração</div><h1>Configurações</h1><p>Consulte seu perfil e mantenha os cadastros da operação atualizados.</p></div></div><nav class="settings-tabs" aria-label="Seções de configurações">${tabs.map(([id,label])=>`<button class="${tab===id?'primary':'ghost'}" data-settings-tab="${id}">${label}</button>`).join('')}</nav>${body}`;
  }
  function dialog(title,fields,onSave,button='Salvar'){
    document.querySelector('#settingsDialog')?.remove();const d=document.createElement('dialog');d.id='settingsDialog';d.className='modal settings-dialog';d.setAttribute('aria-labelledby','settingsTitle');
    d.innerHTML=`<form><div class="modal-head"><h2 id="settingsTitle">${escape(title)}</h2></div>${fields}<p class="settings-error" role="alert"></p><div class="modal-foot"><button type="button" class="ghost" data-cancel>Cancelar</button><button class="primary" type="submit">${button}</button></div></form>`;
    document.body.append(d);d.querySelector('[data-cancel]').onclick=()=>d.close();d.onclose=()=>d.remove();
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const submit=e.target.querySelector('[type=submit]');submit.disabled=true;try{requireAdmin();await onSave(Object.fromEntries(new FormData(e.target)));d.close();await loadState();window.render();toast('Alteração salva.');}catch(error){if(d.isConnected)d.querySelector('[role=alert]').textContent=error.message;else toast(error.message);}finally{submit.disabled=false;}};d.showModal();
  }
  function userEditor(id){requireAdmin();const u=users.find(u=>u.id===id)||{name:'',email:'',area:'',role:'USUÁRIO'};
    dialog(id?'Editar usuário':'Adicionar usuário',`<div class="modal-grid">${[['name','Nome','text',120],['email','E-mail','email',254],['area','Área','text',120]].map(([key,label,type,max])=>`<div class="field"><label for="user-${key}">${label}</label><input id="user-${key}" name="${key}" type="${type}" value="${escape(u[key])}" required maxlength="${max}"></div>`).join('')}<div class="field"><label for="user-role">Perfil</label><select id="user-role" name="role">${roles.map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div></div>${id?'':'<p>Cadastre uma senha inicial. O usuário deverá trocá-la no primeiro acesso.</p>'+passwordFields()}`,async data=>{if(!id)validatePassword(data.password,data.confirmation);await api.request('/users'+(id?'/'+id:''),id?'PATCH':'POST',data);});
  }
  function resetPassword(id){const user=users.find(u=>u.id===id);dialog('Redefinir senha',`<p>Defina uma senha inicial para ${escape(user.name)} e entregue-a por um canal privado. As sessões serão encerradas e o usuário deverá trocar a senha no próximo acesso.</p>${passwordFields()}`,async data=>{validatePassword(data.password,data.confirmation);await api.request('/users/'+id+'/reset','POST',data);},'Redefinir senha');}
  function catalogEditor(index){const key=category,old=index===null?null:catalogs[key][index];dialog(old===null?'Adicionar item':'Editar item',`<div class="field"><label for="catalog-name">Nome em ${labels[key]}</label><input id="catalog-name" name="value" value="${escape(old||'')}" required maxlength="100"></div>`,data=>api.request('/catalogs/'+key,old===null?'POST':'PATCH',{old,value:data.value}));}
  function bind(){
    document.querySelectorAll('[data-settings-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.settingsTab;window.render();});
    document.querySelector('[data-change-password]')?.addEventListener('click',()=>showPasswordChange());
    document.querySelector('[data-user-new]')?.addEventListener('click',()=>userEditor(null));
    document.querySelectorAll('[data-user-edit]').forEach(b=>b.onclick=()=>userEditor(b.dataset.userEdit));
    document.querySelectorAll('[data-user-reset]').forEach(b=>b.onclick=()=>resetPassword(b.dataset.userReset));
    document.querySelectorAll('[data-user-delete]').forEach(b=>b.onclick=()=>dialog('Desativar usuário','<p>Desativar esta conta e encerrar suas sessões? A autoria dos retornos será preservada.</p>',()=>api.request('/users/'+b.dataset.userDelete,'DELETE',{}),'Desativar'));
    document.querySelector('#catalogCategory')?.addEventListener('change',e=>{category=e.target.value;window.render();});
    document.querySelector('[data-catalog-new]')?.addEventListener('click',()=>catalogEditor(null));
    document.querySelectorAll('[data-catalog-edit]').forEach(b=>b.onclick=()=>catalogEditor(Number(b.dataset.catalogEdit)));
    document.querySelectorAll('[data-catalog-delete]').forEach(b=>b.onclick=()=>{const key=category,old=catalogs[key][Number(b.dataset.catalogDelete)];dialog('Remover item',`<p>Remover “${escape(old)}” das opções?</p>`,()=>api.request('/catalogs/'+key,'DELETE',{old}),'Remover');});
  }
  return {load,current,render,bind,values,options};
})();
