let sessionUser=null;
function clearSession(){
  sessionUser=null;records=[];role='';settings.load({users:[],catalogs:{}});
  if(dashboardTimer!==null){clearInterval(dashboardTimer);dashboardTimer=null;}
  document.querySelector('#settingsDialog')?.close();
  document.querySelector('#modalBackdrop')?.classList.remove('show');
  document.querySelector('#sidebar')?.classList.remove('open');
  document.querySelector('#toast')?.classList.remove('show');
  document.querySelector('#content')?.replaceChildren();document.querySelector('#nav')?.replaceChildren();
}
async function loadState(){
  const expectedUser=sessionUser?.id;
  const data=await api.request('/state');
  if(sessionUser?.id!==expectedUser)throw Error('A sessão foi alterada. Entre novamente.');
  sessionUser=data.me;role=data.me.role;records=data.records;settings.load(data);
}
function loginShell(title,description,form){
  document.body.classList.add('signed-out');document.querySelector('#loginPage')?.remove();
  const page=document.createElement('main');page.id='loginPage';page.className='login-page';
  page.innerHTML=`<section class="login-brand"><div class="brand"><div class="brand-mark">P</div><div><strong>Plantão Solução</strong><small>Solução FSA</small></div></div><div><div class="eyebrow">GESTÃO DE RETORNOS</div><h1>Sua operação.<br>Uma visão completa.</h1><p>Organize os retornos, acompanhe sua equipe e consulte os resultados em um só lugar.</p></div><small>Organização e clareza para o seu dia a dia.</small></section><section class="login-content"><div class="login-card"><div class="eyebrow">ACESSO SEGURO</div><h2>${title}</h2><p class="login-description">${description}</p>${form}</div></section>`;
  document.body.append(page);return page;
}
function showLogin(message=''){
  const page=loginShell('Entrar no Plantão Solução','Informe seu e-mail e sua senha.',`<form id="loginForm"><div class="field"><label for="loginEmail">E-mail</label><input id="loginEmail" type="email" name="email" autocomplete="username" maxlength="254" required></div><div class="field"><label for="loginPassword">Senha</label><input id="loginPassword" type="password" name="password" autocomplete="current-password" maxlength="128" required></div><p id="loginError" role="alert"></p><button class="primary login-submit" type="submit">Entrar</button></form><p class="login-note">Esqueceu sua senha? Solicite uma redefinição ao administrador.</p>`);
  page.querySelector('#loginError').textContent=message;
  page.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
    try{
      const result=await api.request('/login','POST',Object.fromEntries(new FormData(event.target)));
      sessionUser=result.me;
      if(sessionUser.mustChangePassword){showPasswordChange(true);return;}
      await loadState();view='dashboard';document.body.classList.remove('signed-out');page.remove();render();
    }catch(error){page.querySelector('#loginError').textContent=error.message;}
    finally{button.disabled=false;}
  };
}
function showPasswordChange(required=false){
  const page=loginShell('Alterar senha',required?'Defina uma nova senha pessoal para continuar.':'Confirme sua senha atual e cadastre a nova senha.',`<form><div class="field"><label for="currentPassword">Senha atual</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></div>${passwordFields()}<p id="loginError" role="alert"></p><button class="primary login-submit" type="submit">Salvar nova senha</button><button class="ghost" type="button" id="passwordCancel">${required?'Sair':'Cancelar'}</button></form>`);
  page.querySelector('#passwordCancel').onclick=()=>required?logout():(page.remove(),document.body.classList.remove('signed-out'));
  page.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;
    try{const data=Object.fromEntries(new FormData(event.target));validatePassword(data.password,data.confirmation);await api.request('/password','POST',data);clearSession();showLogin('Senha alterada. Entre com a nova senha.');}
    catch(error){page.querySelector('#loginError').textContent=error.message;}finally{button.disabled=false;}
  };
}
async function logout(){
  try{await api.request('/logout','POST',{});clearSession();showLogin();}
  catch(error){if(error.status!==401)toast(error.message);}
}
async function initializeSession(){
  showLogin();
  if(location.protocol==='file:'){showLogin('Abra pelo endereço do servidor para usar a autenticação e o banco de dados.');return;}
  try{const result=await api.request('/me');sessionUser=result.me;if(sessionUser.mustChangePassword){showPasswordChange(true);return;}await loadState();document.querySelector('#loginPage')?.remove();document.body.classList.remove('signed-out');render();}
  catch(error){if(error.status!==401)showLogin(error.message);}
}
