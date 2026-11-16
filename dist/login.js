let sessionUserId=null;

function showLogin(){
  document.body.classList.add('signed-out');
  document.querySelector('#loginPage')?.remove();
  const page=document.createElement('main');
  page.id='loginPage';page.className='login-page';
  page.innerHTML=`<section class="login-brand"><div class="brand"><div class="brand-mark">P</div><div><strong>Plantão Solução</strong><small>Solução FSA</small></div></div><div><div class="eyebrow">GESTÃO DE RETORNOS</div><h1>Sua operação.<br>Uma visão completa.</h1><p>Organize os retornos, acompanhe sua equipe e consulte os resultados em um só lugar.</p></div><small>Organização e clareza para o seu dia a dia.</small></section><section class="login-content"><div class="login-card"><div class="eyebrow">BEM-VINDO</div><h2>Entrar no Plantão Solução</h2><p class="login-description">Informe o e-mail de um usuário cadastrado para acessar a demonstração.</p><form id="loginForm"><div class="field"><label for="loginEmail">E-mail</label><input id="loginEmail" type="email" name="email" autocomplete="username" placeholder="nome@empresa.com.br" required></div><p id="loginError" role="alert"></p><button class="primary login-submit" type="submit">Entrar na demonstração →</button></form><div class="login-demo"><strong>Acessos de exemplo</strong><p>Selecione um perfil para preencher o e-mail:</p><div class="login-profiles"></div></div><p class="login-note">MVP demonstrativo, sem senha ou autenticação real. Os dados ficam em memória e são descartados ao recarregar a página.</p></div></section>`;
  document.body.append(page);
  for(const user of settings.demoAccounts()){
    const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent=user.name+' · '+user.role;
    button.onclick=()=>{document.querySelector('#loginEmail').value=user.email;document.querySelector('#loginEmail').focus();};
    page.querySelector('.login-profiles').append(button);
  }
  page.querySelector('#loginForm').onsubmit=event=>{
    event.preventDefault();
    const email=page.querySelector('#loginEmail').value.trim().toLowerCase();
    const user=settings.demoAccounts().find(item=>item.email.toLowerCase()===email);
    if(!user){page.querySelector('#loginError').textContent='E-mail não cadastrado. Use um dos acessos demonstrativos ou solicite o cadastro ao administrador.';return;}
    sessionUserId=user.id;role=user.role;view='dashboard';
    document.body.classList.remove('signed-out');page.remove();render();
    document.querySelector('#content h1')?.setAttribute('tabindex','-1');document.querySelector('#content h1')?.focus();
  };
}

function logout(){
  sessionUserId=null;role='';
  if(dashboardTimer!==null){clearInterval(dashboardTimer);dashboardTimer=null;}
  document.querySelector('#settingsDialog')?.close();
  document.querySelector('#modalBackdrop').classList.remove('show');
  document.querySelector('#sidebar').classList.remove('open');
  document.querySelector('#toast').classList.remove('show');
  document.querySelector('#content').replaceChildren();
  document.querySelector('#nav').replaceChildren();
  showLogin();document.querySelector('#loginEmail').focus();
}
