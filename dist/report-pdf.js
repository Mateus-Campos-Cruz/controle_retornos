window.createManagementPdf = function({rows,records,metrics,generatedAt}) {
  const pages=[];let ops,y;
  const colors=['#72101C','#42805B','#B98A28','#C88490','#687587'];
  const ctx=document.createElement('canvas').getContext('2d');
  const rgb=h=>h.slice(1).match(/../g).map(v=>(parseInt(v,16)/255).toFixed(3)).join(' ');
  const hex=s=>Array.from(String(s).normalize('NFC')).map(c=>(c.charCodeAt(0)<=255?c.charCodeAt(0):({'–':150,'—':151,'’':146}[c]||63)).toString(16).padStart(2,'0')).join('');
  function text(s,x,t,size=10,bold=false){ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf 0.125 0.16 0.22 rg 1 0 0 1 '+x+' '+(595-t-size)+' Tm <'+hex(s)+'> Tj ET');}
  function rect(x,t,w,h,c){ops.push(rgb(c)+' rg '+x+' '+(595-t-h)+' '+w+' '+h+' re f');}
  function page(title){ops=[];pages.push(ops);text('PLANTÃO SOLUÇÃO',36,24,10,true);text(title,36,44,20,true);text('Gerado em '+generatedAt,36,74,9);y=105;}
  function wrap(s,w){ctx.font='10px Arial';const lines=[''];for(const c of String(s).replace(/\s+/g,' ')){let i=lines.length-1;if(lines[i]&&ctx.measureText(lines[i]+c).width>w)lines.push(c);else lines[i]+=c;}return lines;}
  page('Dashboard executivo');
  text('Gráficos e indicadores: base completa ('+records.length+' registros). Tabela: filtros da aba Relatório gerencial.',36,y,9);y+=25;
  const cards=[['Total de retornos',records.length],['Conferências pendentes',records.filter(r=>r.status==='Pendente').length],['Aprovadas (Sim)',records.filter(r=>r.status==='Sim').length],['Rejeitadas (Não)',records.filter(r=>r.status==='Não').length],['Retornos no mês',metrics.monthly],['Pendentes há mais de 48 horas',metrics.overdue]];
  cards.forEach(([label,value],i)=>{const x=36+i%3*260,t=y+Math.floor(i/3)*72;rect(x,t,250,62,'#F3F6F9');rect(x,t,3,62,colors[i%5]);text(label,x+12,t+9);text(value,x+12,t+27,22,true);});
  y+=150;text('Comparativo mensal: '+metrics.comparison.replace(/↑/g,'+').replace(/↓/g,'-'),36,y);y+=30;
  function chart(title,key,percent=false,limit=null){
    if(limit || y+65>550)page("Dashboard executivo");
    text(title,36,y,13,true);y+=26;
    const counts=new Map();records.forEach(r=>counts.set(r[key]||'Não informado',(counts.get(r[key]||'Não informado')||0)+1));
    const max=Math.max(1,...counts.values());let i=0;
    if(!counts.size){text('Nenhum retorno cadastrado.',36,y);y+=28;}
    const entries=limit?[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR')).slice(0,limit):[...counts];
    for(const [label,count] of entries){
      const lines=wrap(label,220),h=Math.max(28,lines.length*12+8);
      if(y+h>550)page(title+' · continuação');
      lines.forEach((line,j)=>text(line,36,y+j*12));rect(270,y+2,430,12,'#EEF2F7');rect(270,y+2,430*count/(percent?records.length:max),12,colors[i++%5]);text(count+' ('+Math.round(count/records.length*100)+'%)',712,y,10,true);y+=h;
    }y+=18;
  }
  chart('Quantidade de retornos por operador / cobrador','cobrador');
  chart('Distribuição por recebimento','recebido',true);
  chart('Distribuição por empresa','empresa',true);
  page('Relatório gerencial');text(rows.length+' registro(s) · filtros aplicados na tabela',36,y);y+=24;
  const widths=[185,123,169,123,170],labels=['Sócio','Tipo de contato','Cobrador','Sócio recebeu','Empresa'];
  function header(){rect(36,y,770,26,'#EEF2F7');let x=36;labels.forEach((s,i)=>{text(s,x+7,y+7,10,true);x+=widths[i];});y+=26;}
  header();if(!rows.length)text('Nenhum registro encontrado para os filtros selecionados.',36,y+12);
  rows.forEach((row,index)=>{
    const cells=row.map((s,i)=>wrap(s,widths[i]-14)),n=Math.max(...cells.map(c=>c.length));let offset=0;
    while(offset<n){
      if(y+26>550){page('Relatório gerencial · continuação');header();}
      const take=Math.min(n-offset,Math.floor((550-y-12)/13)),h=take*13+12;
      rect(36,y,770,h,index%2?'#F3F6F9':'#FFFFFF');let x=36;
      cells.forEach((lines,i)=>{lines.slice(offset,offset+take).forEach((s,j)=>text(s,x+7,y+6+j*13));x+=widths[i];});
      y+=h;offset+=take;
    }
  });
  pages.forEach((p,i)=>{ops=p;text('Plantão Solução · Página '+(i+1)+' de '+pages.length,36,570,8);});
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'],kids=[];
  pages.forEach(p=>{const id=objects.length,s=p.join('\n')+'\n';kids.push(id+' 0 R');objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(id+1)+' 0 R >>');objects.push('<< /Length '+s.length+' >>\nstream\n'+s+'endstream');});
  objects[2]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>';
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets.push(pdf.length);pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=pdf.length;pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';offsets.slice(1).forEach(n=>pdf+=String(n).padStart(10,'0')+' 00000 n \n');
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return new Blob([pdf],{type:'application/pdf'});
};
