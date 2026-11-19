
  let records=[];
  let role='', view='dashboard', editingId=null, font=16;
  const navItems=[['dashboard','▦','Dashboard executivo'],['retornos','✎','Formulário de retornos'],['consolidado','▤','Consolidado'],['relatorio','▥','Relatório gerencial'],['settings','⚙','Configurações']];
  const $=s=>document.querySelector(s); const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function setFontSize(size){
    font=Math.max(13,Math.min(19,size));
    document.documentElement.style.fontSize=font+'px';
    $('#fontDown').disabled=font===13;
    $('#fontUp').disabled=font===19;
  }
  function permitted(v){return !!settings.current()&&(v!=='consolidado'||canChangeConference())}
  function renderNav(){ $('#nav').innerHTML=navItems.filter(([id])=>permitted(id)).map(([id,ic,label])=>`<button class="${view===id?'active':''}" data-view="${id}"><span class="nav-icon">${ic}</span>${label}</button>`).join(''); document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;$('#sidebar').classList.remove('open');render()}) }
  function head(kicker,title,desc,action=''){return `<div class="view-head"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`}
  function stat(label,value,note,icon){return `<div class="card stat"><div class="stat-label">${label}<span>${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`}
  function recordCreationDate(record){
    if(record.createdAt){
      const date=new Date(record.createdAt);
      return Number.isNaN(date.getTime())?null:date;
    }
    const match=String(record.created||'').match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!match)return null;
    const [,day,month,year,hour,minute,second]=match.map((v,i)=>i?Number(v??0):v);
    const date=new Date(year,month-1,day,hour,minute,second);
    return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day&&date.getHours()===hour&&date.getMinutes()===minute&&date.getSeconds()===Number(second)?date:null;
  }
  function executiveMetrics(items,now=new Date()){
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const previousStart=new Date(now.getFullYear(),now.getMonth()-1,1);
    const previousLastDay=new Date(now.getFullYear(),now.getMonth(),0).getDate();
    // Match the elapsed day/time; when the prior month is shorter, include its entire last day.
    const previousEnd=now.getDate()>previousLastDay?new Date(start.getTime()-1):new Date(now.getFullYear(),now.getMonth()-1,now.getDate(),now.getHours(),now.getMinutes(),now.getSeconds(),now.getMilliseconds());
    let monthly=0,previous=0,overdue=0,invalid=0;
    for(const record of items){
      const date=recordCreationDate(record);
      if(!date){invalid++;continue;}
      if(date>=start&&date<=now)monthly++;
      if(date>=previousStart&&date<=previousEnd)previous++;
      if(record.status==='Pendente'&&now-date>48*60*60*1000)overdue++;
    }
    const change=previous?(monthly-previous)/previous*100:null;
    const comparison=change===null?(monthly?'Sem base no mês anterior':'Sem retornos nos dois períodos'):(change>0?'↑ ':change<0?'↓ ':'')+Math.abs(change).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% vs. mesmo período anterior';
    return {monthly,previous,overdue,invalid,comparison};
  }
  function dashboard(){const metrics=executiveMetrics(records);let pending=records.filter(r=>r.status==='Pendente').length;let yes=records.filter(r=>r.status==='Sim').length;let no=records.filter(r=>r.status==='Não').length;let counts=[...new Set([...settings.values('cobrador'),...records.map(r=>r.cobrador)])].map(c=>[c,records.filter(r=>r.cobrador===c).length]).filter(x=>x[1]);let max=Math.max(1,...counts.map(x=>x[1]));let companies=[...new Set([...settings.values('empresa'),...records.map(r=>r.empresa)])];return head('Visão geral','Dashboard executivo','Acompanhe a operação de retornos em um único lugar.',`<div class="dashboard-refresh"><button type="button" class="primary" id="refreshDashboard">↻ Atualizar dados</button><small role="status">Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · Automático a cada 2 minutos</small></div>`)+`<div class="grid stats">${stat('Total de retornos',records.length,'Registros válidos','↗')}${stat('Conferências pendentes',pending,'Requer atenção','!')}${stat('Aprovadas (Sim)',yes,'Conferidas','✓')}${stat('Rejeitadas (Não)',no,'Em revisão','×')}${stat('Retornos no mês',metrics.monthly,metrics.comparison,'▦')}${stat('Pendentes há mais de 48 horas',metrics.overdue,'Tempo desde o cadastro','◷')}</div><div class="grid grid-2"><div class="card panel"><div class="panel-title"><h3>Total de retornos por cobrador</h3><span>Atualizado agora</span></div>${counts.length?counts.map(([n,v])=>`<div class="chart-row"><span>${esc(n)}</span><div class="bar-track"><div class="bar" style="width:${v/max*100}%"></div></div><b>${v}</b></div>`).join(''):'<div class="empty">Sem dados de cobradores.</div>'}</div><div class="card panel"><div class="panel-title"><h3>Distribuição por recebimento</h3><span>Todos os registros</span></div>${receiptChart()}</div></div><div class="card panel" style="margin-top:18px"><div class="panel-title"><h3>Distribuição por empresa</h3><span>Base consolidada</span></div>${companies.map((c,i)=>`<div class="chart-row"><span>${esc(c)}</span><div class="bar-track"><div class="bar" style="width:${records.length?records.filter(r=>r.empresa===c).length/records.length*100:0}%;background:${['var(--color-primary)','#42805B','#B98A28','#C88490','#687587'][i%5]}"></div></div><b>${records.length?Math.round(records.filter(r=>r.empresa===c).length/records.length*100):0}%</b></div>`).join('')}</div>`}
  function filters(){return `<div class="filters"><div class="field search"><label for="search">Pesquisar em todas as colunas</label><input id="search" type="search" placeholder="Digite qualquer informação do registro..."></div><div class="field"><label>Empresa</label><select id="filterCompany"><option value="">Todas as empresas</option>${settings.options('empresa','',true)}</select></div><div class="field"><label>Conferência</label><select id="filterStatus"><option value="">Todos os status</option><option>Pendente</option><option>Sim</option><option>Não</option></select></div></div>`}
  function table(mode='retornos'){let rows=records; if(mode==='relatorio') return `<div class="card table-card">${filters()}<div class="table-wrap"><table class="table"><thead><tr><th>Sócio</th><th>Tipo de contato</th><th>Cobrador</th><th>Sócio recebeu</th><th>Empresa</th><th>Ação</th></tr></thead><tbody id="rows">${rows.map(r=>`<tr><td><b>${esc(r.socio)}</b></td><td>${esc(r.tipo)}</td><td>${esc(r.cobrador)}</td><td>${esc(r.recebido)}</td><td>${esc(r.empresa)}</td><td><button class="row-actions ghost" data-edit-record="${r.id}">Corrigir</button></td></tr>`).join('')}</tbody></table></div></div>`;
    return `<div class="card table-card">${filters()}<div class="table-wrap"><table class="table"><thead><tr><th>Sócio</th><th>Contrato</th><th>Contato</th><th>Cobrador</th><th>Recebido por</th><th>Empresa</th>${mode==='consolidado'?'<th>Conferência</th>':''}<th>Responsável</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody id="rows">${rows.map(r=>`<tr><td><b>${esc(r.socio)}</b></td><td>${esc(r.contrato)}</td><td>${esc(r.tipo)}</td><td>${esc(r.cobrador)}</td><td>${esc(r.recebido)}</td><td>${esc(r.empresa)}</td>${mode==='consolidado'?`<td>${conferenceControl(r)}</td>`:''}<td>${esc(r.owner)}</td><td>${esc(r.created)}</td><td><div class="row-actions"><button data-edit-record="${r.id}">Editar</button><button data-delete-record="${r.id}" class="danger">Excluir</button></div></td></tr>`).join('')}</tbody></table></div></div>`}
  function retornos(){return head('Cadastro operacional','Formulário de retornos','Cadastre e gerencie os retornos disponíveis para seu perfil.',`<button class="primary" id="newBtn">+ Novo retorno</button>`)+table();}
  const CONFERENCE_STATUSES=['Pendente','Sim','Não'];
  function canChangeConference(){
    return ['ADMINISTRADOR','GESTOR'].includes(settings.current()?.role);
  }
  function conferenceControl(record){
    const color=record.status==='Sim'?'green':record.status==='Não'?'red':'yellow';
    if(!canChangeConference())return '<span class="tag '+color+'">'+esc(record.status)+'</span>';
    return '<select class="tag conference-select '+color+'" aria-label="Conferência de '+esc(record.socio)+'" data-conference-id="'+record.id+'">'+CONFERENCE_STATUSES.map(status=>'<option value="'+status+'" '+(status===record.status?'selected':'')+'>'+status+'</option>').join('')+'</select>';
  }
  async function handleConferenceChange(select){
    const old=records.find(r=>r.id===select.dataset.conferenceId);select.disabled=true;
    try{await api.request('/returns/'+select.dataset.conferenceId+'/conference','PATCH',{status:select.value});if(old)old.status=select.value;select.className='tag conference-select '+(select.value==='Sim'?'green':select.value==='Não'?'red':'yellow');$('#search')?.dispatchEvent(new Event('input'));toast('Conferência atualizada.');}
    catch(error){if(old)select.value=old.status;toast(error.message);}finally{select.disabled=false;}
  }
  function consolidado(){if(!canChangeConference())return '<div class="empty">Acesso não autorizado.</div>';return head('Fonte única','Consolidado','Visão centralizada de todos os retornos válidos.',`<span class="role">${role==='GESTOR'?'ESCOPO DA ÁREA':'TODAS AS ORIGENS'}</span>`)+table('consolidado');}
  function relatorio(){let total=records.length;return head('Análise gerencial','Relatório gerencial',`Consulta operacional · ${total} retornos consistentes com a fonte única.`,`<div class="report-actions"><button type="button" class="primary" id="downloadReport">↓ Baixar relatório PDF</button></div>`)+`<div class="card panel" style="margin-bottom:18px"><div class="panel-title"><h3>Quantidade de retornos por operador / cobrador</h3><span>Total geral: <b>${total}</b></span></div>${[...new Set([...settings.values('cobrador'),...records.map(r=>r.cobrador)])].map((c,i)=>`<div class="chart-row"><span>${esc(c)}</span><div class="bar-track"><div class="bar" style="width:${records.length?records.filter(r=>r.cobrador===c).length/records.length*100:0}%"></div></div><b>${records.filter(r=>r.cobrador===c).length}</b></div>`).join('')}</div>${table('relatorio')}`}
  function downloadReport(){
    const source=$('#rows');
    if(!source){toast('Não foi possível localizar a tabela do relatório.');return;}
    try {
      const rows=Array.from(source.rows).filter(row=>!row.hidden&&!row.hasAttribute('data-search-empty')).map(row=>Array.from(row.cells).slice(0,5).map(cell=>cell.textContent.trim()));
      const now=new Date();
      const blob=createManagementPdf({rows,records,metrics:executiveMetrics(records,now),generatedAt:now.toLocaleString('pt-BR')});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='relatorio-gerencial-'+now.toISOString().slice(0,10)+'.pdf';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      toast('Download do PDF iniciado.');
    }catch(error){console.error('Falha ao gerar relatório PDF:',error);toast('Não foi possível gerar o PDF. Tente novamente.');}
  }
  const DASHBOARD_REFRESH_MS=120000;
  let dashboardTimer=null;
  function receiptChart(){
    const colors=['#72101C','#42805B','#B98A28','#C88490','#687587'];
    const groups=[...new Set(records.map(r=>r.recebido))].map(label=>({label,count:records.filter(r=>r.recebido===label).length}));
    if(!groups.length)return '<div class="empty">Nenhum retorno cadastrado.</div>';
    let angle=0;
    const segments=groups.map((group,i)=>{const start=angle;angle+=group.count/records.length*360;return colors[i%colors.length]+' '+start+'deg '+angle+'deg';});
    return '<div class="donut-wrap"><div class="donut" aria-hidden="true" style="background:conic-gradient('+segments.join(',')+')"></div><div class="legend">'+groups.map((group,i)=>'<span><i style="background:'+colors[i%colors.length]+'"></i>'+esc(group.label)+' · '+group.count+' ('+Math.round(group.count/records.length*100)+'%)</span>').join('')+'</div></div>';
  }
  async function refreshDashboard(manual=false){
    if(view!=='dashboard'||!settings.current())return;
    const hadFocus=document.activeElement?.id==='refreshDashboard';
    try{await loadState();}catch(error){toast(error.message);return;}
    if(view!=='dashboard'||!settings.current())return;
    $('#content').innerHTML=dashboard();
    $('#refreshDashboard').onclick=()=>refreshDashboard(true);
    if(hadFocus)$('#refreshDashboard').focus();
    if(manual)toast('Dados do dashboard atualizados.');
  }
  function syncDashboardRefresh(){
    if(view==='dashboard'){
      $('#refreshDashboard').onclick=()=>refreshDashboard(true);
      if(dashboardTimer===null)dashboardTimer=setInterval(()=>refreshDashboard(),DASHBOARD_REFRESH_MS);
    }else if(dashboardTimer!==null){
      clearInterval(dashboardTimer);dashboardTimer=null;
    }
  }
  function render(){if(!settings.current()){showLogin();return;}$('#sessionRole').textContent=role;$('.avatar').textContent=settings.current().name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();$('.avatar').title=settings.current().name;renderNav();$('#crumb').textContent=navItems.find(x=>x[0]===view)?.[2]||'Dashboard executivo'; $('#content').innerHTML=view==='dashboard'?dashboard():view==='retornos'?retornos():view==='consolidado'?consolidado():view==='settings'?settings.render():relatorio();bindFilters();if(view==='settings')settings.bind();if($('#downloadReport'))$('#downloadReport').onclick=downloadReport;syncDashboardRefresh();if($('#newBtn'))$('#newBtn').onclick=()=>openModal();}
  function normalizeSearch(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();}
  function recordMatchesFilters(record,query,company,status){
    const fields=['socio','contrato','tipo','cobrador','recebido','empresa','owner','origin','created','status'];
    const phrase=normalizeSearch(query).replace(/\s+/g,' ');
    const matches=!phrase||fields.some(key=>normalizeSearch(record[key]).replace(/\s+/g,' ').includes(phrase));
    return matches&&(!company||record.empresa===company)&&(!status||record.status===status);
  }
  function bindFilters(){
    const apply=()=>{
      const query=$('#search')?.value||'',company=$('#filterCompany')?.value||'',status=$('#filterStatus')?.value||'';
      const body=$('#rows');if(!body)return;
      body.querySelector('[data-search-empty]')?.remove();
      let visible=0;
      [...body.rows].forEach((row,index)=>{
        const match=recordMatchesFilters(records[index],query,company,status);
        row.hidden=!match;if(match)visible++;
      });
      if(!visible){
        const row=body.insertRow();row.dataset.searchEmpty='true';
        const cell=row.insertCell();cell.colSpan=body.closest('table').querySelectorAll('thead th').length;
        cell.className='empty';cell.textContent='Nenhum registro encontrado para os filtros informados.';
      }
    };
    ['search','filterCompany','filterStatus'].forEach(id=>{const el=$('#'+id);if(el)el.oninput=apply;});
  }
  function openModal(id){editingId=id||null;let r=records.find(x=>x.id===id);$('#modalTitle').textContent=id?'Editar retorno':'Novo retorno';let f=$('#returnForm');f.reset();for(const key of ['tipo','cobrador','recebido','empresa'])f.elements[key].innerHTML='<option value="">Selecione</option>'+settings.options(key,r?.[key]||'');if(r)Object.keys(r).forEach(k=>{if(f.elements[k])f.elements[k].value=r[k]});$('#modalBackdrop').classList.add('show')}
  document.querySelector('#content').addEventListener('click',async event=>{
    const edit=event.target.closest('[data-edit-record]');if(edit){openModal(edit.dataset.editRecord);return;}
    const remove=event.target.closest('[data-delete-record]');
    if(remove&&confirm('Excluir este retorno?')){remove.disabled=true;try{await api.request('/returns/'+remove.dataset.deleteRecord,'DELETE',{});await loadState();render();toast('Retorno excluído.');}catch(error){toast(error.message);}finally{remove.disabled=false;}}
  });
  document.querySelector('#content').addEventListener('change',event=>{if(event.target.matches('[data-conference-id]'))handleConferenceChange(event.target);});
  function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2600)}
  function formatMemberName(value){
    return String(value).toLocaleLowerCase('pt-BR').replace(/(^|[\s'-])(\p{L})/gu,(_,separator,letter)=>separator+letter.toLocaleUpperCase('pt-BR'));
  }
  function formatContract(value){return String(value).toLocaleUpperCase('pt-BR');}
  function formatTextInput(input,formatter){
    const start=input.selectionStart,end=input.selectionEnd,value=input.value;
    input.value=formatter(value);
    if(start!==null&&end!==null)input.setSelectionRange(formatter(value.slice(0,start)).length,formatter(value.slice(0,end)).length);
  }
  for(const [field,formatter] of [['socio',formatMemberName],['contrato',formatContract]]){
    const input=$('#returnForm').elements[field];
    input.addEventListener('input',event=>{if(!event.isComposing)formatTextInput(input,formatter);});
    input.addEventListener('compositionend',()=>formatTextInput(input,formatter));
    input.addEventListener('blur',()=>{input.value=formatter(input.value).trim();});
  }
  $('#returnForm').onsubmit=async e=>{
    e.preventDefault();const submit=e.target.querySelector('button.primary');submit.disabled=true;
    try{const data=Object.fromEntries(new FormData(e.target));data.socio=formatMemberName(data.socio).trim().replace(/\s+/g,' ');data.contrato=formatContract(data.contrato).trim();await api.request('/returns'+(editingId?'/'+editingId:''),editingId?'PATCH':'POST',data);$('#modalBackdrop').classList.remove('show');await loadState();render();toast('Retorno salvo.');}
    catch(error){toast(error.message);}finally{submit.disabled=false;}
  };
  $('#closeModal').onclick=$('#cancelModal').onclick=()=>$('#modalBackdrop').classList.remove('show');$('#themeBtn').onclick=()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';$('#fontUp').onclick=()=>setFontSize(font+1);$('#fontDown').onclick=()=>setFontSize(font-1);$('#logoutButton').onclick=logout;$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');initializeSession();
