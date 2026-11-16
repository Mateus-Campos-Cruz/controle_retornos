// MVP: authorization is simulated; production must enforce these rules on the server.
const settings = (() => {
  const roles = ['ADMINISTRADOR', 'GESTOR', 'USUÁRIO'];
  const users = [
    {id:1,name:'Mateus Campos',email:'mateus@example.com',role:roles[0],area:'Administração'},
    {id:2,name:'Mariana Alves',email:'mariana@example.com',role:roles[1],area:'Operações'},
    {id:3,name:'João Pedro',email:'joao@example.com',role:roles[2],area:'Operações'},
    {id:4,name:'Carolina Silva',email:'carolina@example.com',role:roles[1],area:'Operações'}
  ];
  const labels = {cobrador:'Cobradores',empresa:'Empresas',tipo:'Tipos de contato',recebido:'Meios de recebimento'};
  const catalogs = {
    cobrador:[
      "Aguinaldo Machado",
      "Ana Carolina de Oliveira Freitas",
      "Ana Paula Santana",
      "Antonio Magalhaes Neto",
      "Bruna Alves Costa Coelho Bandeira",
      "Cleber Silva Figueredo Camargos",
      "David Gonçalves Magalhaes",
      "Edna Aparecida Garcia Corral",
      "Elaine da Costa Duarte",
      "Emerson Pereira de Moraes",
      "Erika dos Santos Martins",
      "Esther Layse dos Reis Maciel",
      "Fabiano Silva Mendes",
      "Fabio Limonte",
      "Gabriel Basilio Cobrador",
      "Gleison Magalhaes da Silva",
      "Jorge Luiz Vieira da Silva",
      "Augusto Honorato",
      "Kelly Ketoly Costa Rocha",
      "Lilian Alessandra Oliveira",
      "Luana Caroline Fernandes Braz",
      "Marciel Marques",
      "Maria Rita Emilio Vieira",
      "Mary Taina Rodrigues dos Santos",
      "Milton Andrade Eufrasio",
      "Moises Rodrigues Machado",
      "Neide Campelo",
      "Rayane Passos Camargo Soares",
      "Ricardo Alexandre Cobrador",
      "Rodrigo Barbosa de Oliveira",
      "Vagner Pereira",
      "Walner Basilio",
    ],
    empresa:['Thermas MG','Itiquira','AGI Bank','Saúde e Vida','Bali Park'],
    tipo:['Ligação','Presencial','Digital'],
    recebido:['RCS','Email','Carta','Solange','SMS','WhatsApp','Rede Social','Não identificado','Protesto','SERASA','Vendas']
  };
  let tab='profile', category='cobrador', nextId=5;
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => value.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
  function current(){return users.find(u=>u.id===sessionUserId)}
  function requireAdmin(){if(current()?.role!=='ADMINISTRADOR')throw Error('Acesso exclusivo do administrador.');}
  function values(key){return [...(catalogs[key]||[])];}
  function options(key, selected='', includeHistory=false){
    const list=values(key);
    if(includeHistory) for(const r of records) if(r[key]&&!list.includes(r[key]))list.push(r[key]);
    if(selected&&!list.includes(selected))list.push(selected);
    return list.map(value=>`<option value="${escape(value)}" ${value===selected?'selected':''}>${escape(value)}${!catalogs[key].includes(value)?' (removido do catálogo)':''}</option>`).join('');
  }
  function saveUser(id,data){
    requireAdmin();
    const name=data.name.trim(),email=data.email.trim().toLowerCase(),area=data.area.trim();
    if(!name||!area||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!roles.includes(data.role))throw Error('Preencha nome, e-mail válido, área e perfil.');
    if(users.some(u=>u.id!==id&&u.email===email))throw Error('Este e-mail já está cadastrado.');
    const old=users.find(u=>u.id===id);
    if(id&&!old)throw Error('Usuário não encontrado.');
    if(old===current()&&old.role!==data.role)throw Error('Não é possível alterar o próprio perfil de acesso nesta sessão.');
    if(old){Object.assign(old,{name,email,area,role:data.role});}else users.push({id:nextId++,name,email,area,role:data.role});
  }
  function removeUser(id){requireAdmin();const index=users.findIndex(u=>u.id===id);if(index<0)throw Error('Usuário não encontrado.');if(users[index]===current())throw Error('Não é possível remover o usuário desta sessão.');users.splice(index,1);}
  function saveCatalog(key,old,value){
    requireAdmin();if(!Object.hasOwn(catalogs,key))throw Error('Catálogo inválido.');
    value=value.trim();if(!value||value.length>100)throw Error('Informe um nome de até 100 caracteres.');
    if(catalogs[key].some(v=>v!==old&&normalize(v)===normalize(value)))throw Error('Este item já existe no catálogo.');
    if(old!==null){const i=catalogs[key].indexOf(old);if(i<0)throw Error('Item não encontrado.');catalogs[key][i]=value;
      for(const record of records)if(record[key]===old){record[key]=value;record.updated=new Date().toISOString();}
    }else catalogs[key].push(value);
  }
  function removeCatalog(key,value){requireAdmin();if(!Object.hasOwn(catalogs,key))throw Error('Catálogo inválido.');const i=catalogs[key].indexOf(value);if(i<0)throw Error('Item não encontrado.');catalogs[key].splice(i,1);}
  function render(){
    if(role!=='ADMINISTRADOR')tab='profile';
    const me=current();
    const tabs=[['profile','Meu perfil'],...(role==='ADMINISTRADOR'?[['users','Gerenciamento de usuários'],['catalogs','Catálogos do formulário']]:[])];
    let body='';
    if(tab==='profile')body=`<div class="card panel"><h2>Informações do perfil</h2>${me?`<dl class="profile-grid"><div><dt>Nome</dt><dd>${escape(me.name)}</dd></div><div><dt>E-mail demonstrativo</dt><dd>${escape(me.email)}</dd></div><div><dt>Perfil de acesso</dt><dd>${escape(me.role)}</dd></div><div><dt>Área</dt><dd>${escape(me.area)}</dd></div></dl>`:'<p>Nenhum usuário cadastrado para este perfil demonstrativo.</p>'}</div>`;
    if(tab==='users')body=`<div class="card panel"><div class="panel-title"><h3>Usuários (${users.length})</h3><button class="primary" data-user-new>+ Adicionar usuário</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Área</th><th>Ações</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escape(u.name)}</td><td>${escape(u.email)}</td><td>${escape(u.role)}</td><td>${escape(u.area)}</td><td><div class="row-actions"><button data-user-edit="${u.id}">Editar</button><button class="danger" data-user-delete="${u.id}">Remover</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
    if(tab==='catalogs')body=`<div class="card panel"><div class="panel-title"><div class="field"><label for="catalogCategory">Catálogo</label><select id="catalogCategory">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${category===key?'selected':''}>${label}</option>`).join('')}</select></div><button class="primary" data-catalog-new>+ Adicionar item</button></div><p>Editar um nome atualiza os retornos vinculados. Remover impede novos cadastros com esse item, mas preserva o histórico. Sócio e contrato continuam sendo preenchidos em cada retorno.</p><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Ações</th></tr></thead><tbody>${catalogs[category].map((v,i)=>`<tr><td>${escape(v)}</td><td><div class="row-actions"><button data-catalog-edit="${i}">Editar</button><button class="danger" data-catalog-delete="${i}">Remover</button></div></td></tr>`).join('')||'<tr><td colspan="2">Nenhum item cadastrado.</td></tr>'}</tbody></table></div></div>`;
    return `<div class="view-head"><div><div class="eyebrow">Preferências e administração</div><h1>Configurações</h1><p>Consulte seu perfil e mantenha os cadastros da operação atualizados.</p></div></div><div class="notice">Ambiente demonstrativo: alterações em memória, descartadas ao recarregar a página. Não cria contas de acesso reais.</div><nav class="settings-tabs" aria-label="Seções de configurações">${tabs.map(([id,label])=>`<button class="${tab===id?'primary':'ghost'}" data-settings-tab="${id}" ${tab===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav>${body}`;
  }
  function dialog(title,fields,onSave,button='Salvar'){
    document.querySelector('#settingsDialog')?.remove();
    const previous=document.activeElement;
    const d=document.createElement('dialog');d.id='settingsDialog';d.className='modal settings-dialog';d.setAttribute('aria-labelledby','settingsTitle');
    d.innerHTML=`<form><div class="modal-head"><h2 id="settingsTitle">${escape(title)}</h2></div>${fields}<p class="settings-error" role="alert"></p><div class="modal-foot"><button type="button" class="ghost" data-cancel>Cancelar</button><button class="primary" type="submit">${button}</button></div></form>`;
    document.body.append(d);d.querySelector('[data-cancel]').onclick=()=>d.close();d.onclose=()=>{d.remove();previous?.focus()};
    d.querySelector('form').onsubmit=e=>{e.preventDefault();try{requireAdmin();onSave(Object.fromEntries(new FormData(e.target)));d.close();window.render();toast('Alteração salva.');}catch(error){d.querySelector('[role=alert]').textContent=error.message;}};
    d.showModal();
  }
  function userEditor(id){requireAdmin();const u=users.find(u=>u.id===id)||{name:'',email:'',area:'',role:'USUÁRIO'};dialog(id?'Editar usuário':'Adicionar usuário',`<div class="modal-grid">${[['name','Nome','text'],['email','E-mail','email'],['area','Área','text']].map(([key,label,type])=>`<div class="field"><label for="user-${key}">${label}</label><input id="user-${key}" name="${key}" type="${type}" value="${escape(u[key])}" required maxlength="120"></div>`).join('')}<div class="field"><label for="user-role">Perfil</label><select id="user-role" name="role">${roles.map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div></div>`,data=>saveUser(id,data));}
  function catalogEditor(index){requireAdmin();const key=category,old=index===null?null:catalogs[key][index];dialog(old===null?'Adicionar item':'Editar item',`<div class="field"><label for="catalog-name">Nome em ${labels[key]}</label><input id="catalog-name" name="value" value="${escape(old||'')}" required maxlength="100"></div>`,data=>saveCatalog(key,old,data.value));}
  function bind(){
    document.querySelectorAll('[data-settings-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.settingsTab!=='profile')requireAdmin();tab=b.dataset.settingsTab;window.render()});
    document.querySelector('[data-user-new]')?.addEventListener('click',()=>userEditor(null));
    document.querySelectorAll('[data-user-edit]').forEach(b=>b.onclick=()=>userEditor(Number(b.dataset.userEdit)));
    document.querySelectorAll('[data-user-delete]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.userDelete);dialog('Remover usuário','<p>Remover este usuário? Os retornos e a autoria histórica serão preservados.</p>',()=>removeUser(id),'Remover')});
    document.querySelector('#catalogCategory')?.addEventListener('change',e=>{category=e.target.value;window.render()});
    document.querySelector('[data-catalog-new]')?.addEventListener('click',()=>catalogEditor(null));
    document.querySelectorAll('[data-catalog-edit]').forEach(b=>b.onclick=()=>catalogEditor(Number(b.dataset.catalogEdit)));
    document.querySelectorAll('[data-catalog-delete]').forEach(b=>b.onclick=()=>{const key=category,value=catalogs[key][Number(b.dataset.catalogDelete)];dialog('Remover item',`<p>Remover “${escape(value)}” das opções de novos retornos? Os registros existentes serão preservados.</p>`,()=>removeCatalog(key,value),'Remover')});
  }
  function demoAccounts(){return users.map(({id,name,email,role})=>({id,name,email,role}));}
  return {render,bind,current,demoAccounts,values,options,saveUser,removeUser,saveCatalog,removeCatalog};
})();
