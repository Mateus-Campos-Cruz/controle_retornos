import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { hashPassword } from '../server/security.js';

const connectionString=process.env.TEST_DATABASE_URL;
test('API com PostgreSQL real', {skip:!connectionString, timeout:120000}, async t=>{
  if(!new URL(connectionString).pathname.endsWith('_test'))throw Error('Use um banco dedicado com nome terminado em _test.');
  const db=new pg.Pool({connectionString});
  const origin='http://127.0.0.1:3107';
  let server;
  t.after(async()=>{if(server){server.kill();await new Promise(resolve=>server.once('exit',resolve));}await db.end();});
  await db.query('DROP SCHEMA IF EXISTS app CASCADE');
  const schema=await readFile(new URL('../database/schema.sql',import.meta.url),'utf8');
  await db.query(schema);
  const migration=await readFile(new URL('../database/migrations/001_auth.sql',import.meta.url),'utf8');
  await db.query(migration);await db.query(migration);
  const area=(await db.query("INSERT INTO app.areas(name) VALUES('Área A'),('Área B') RETURNING id,name")).rows;
  const password='TesteInicial1!';
  const hash=await hashPassword(password);
  const users=[];
  for(const [name,role,index] of [['admin','ADMINISTRADOR',0],['gestor','GESTOR',0],['usuario','USUARIO',0],['externo','USUARIO',1]]){
    const user=(await db.query('INSERT INTO app.users(name,email,role,area_id,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,false) RETURNING id',[name,name+'@teste.local',role,area[index].id,hash])).rows[0];users.push(user);
  }
  for(const table of ['contact_types','collectors','receipt_channels','companies'])await db.query(`INSERT INTO app.${table}(name) VALUES('Opção')`);
  server=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_URL:connectionString,APP_ORIGIN:origin,PORT:'3107',HOST:'127.0.0.1',NODE_ENV:'test'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let log='';server.stderr.on('data',chunk=>log+=chunk);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou: '+log)),10000);server.stdout.on('data',()=>{clearTimeout(timer);resolve();});server.once('exit',()=>{clearTimeout(timer);reject(Error('Servidor encerrou: '+log));});});
  async function request(path,{method='GET',data,cookie,requestOrigin=origin}={}){
    const response=await fetch(origin+'/api'+path,{method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json',Origin:requestOrigin}),...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  }
  async function login(email,pass=password){const result=await request('/login',{method:'POST',data:{email:email+'@teste.local',password:pass}});assert.equal(result.status,200,JSON.stringify(result.body));return result.cookie;}
  const admin=await login('admin'),gestor=await login('gestor'),user=await login('usuario'),outside=await login('externo');
  let firstId,createdUser;
  await t.test('login exige senha correta; cookies não expõem credenciais',async()=>{
    const bad=await request('/login',{method:'POST',data:{email:'admin@teste.local',password:'Errada123!'}});assert.equal(bad.status,401);
    assert.equal((await request('/state')).status,401);
    const result=await request('/login',{method:'POST',data:{email:'admin@teste.local',password}});
    assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.match(result.headers.get('set-cookie'),/SameSite=Strict/);
    assert.equal(JSON.stringify(result.body).includes('password_hash'),false);
  });
  await t.test('operações validam origem e perfil no servidor',async()=>{
    assert.equal((await request('/users',{method:'POST',cookie:user,data:{}})).status,403);
    assert.equal((await request('/users',{method:'POST',cookie:admin,data:{},requestOrigin:'https://atacante.invalid'})).status,403);
    assert.equal((await request('/catalogs/empresa',{method:'POST',cookie:user,data:{value:'Não permitido'}})).status,403);
    assert.equal((await fetch(origin+'/server/index.js')).status,404);
    assert.equal((await fetch(origin+'/.env')).status,404);
  });
  const payload={socio:'Sócio real',contrato:'contrato-1',tipo:'Opção',cobrador:'Opção',recebido:'Opção',empresa:'Opção'};
  await t.test('persistência, duplicidade, escopo e conferência',async()=>{
    assert.equal((await request('/returns',{method:'POST',cookie:user,data:payload})).status,200);
    assert.equal((await request('/returns',{method:'POST',cookie:outside,data:{...payload,contrato:'contrato-2'}})).status,200);
    assert.equal((await request('/returns',{method:'POST',cookie:user,data:payload})).status,409);
    const mine=(await request('/state',{cookie:user})).body;assert.equal(mine.records.length,1);firstId=mine.records[0].id;
    assert.equal(mine.records[0].contrato,'CONTRATO-1');
    assert.equal((await request('/state',{cookie:gestor})).body.records.length,1);
    assert.equal((await request('/state',{cookie:admin})).body.records.length,2);
    assert.equal((await request('/returns/'+firstId,{method:'PATCH',cookie:outside,data:payload})).status,404);
    assert.equal((await request('/returns/'+firstId+'/conference',{method:'PATCH',cookie:user,data:{status:'Sim'}})).status,403);
    assert.equal((await request('/returns/'+firstId+'/conference',{method:'PATCH',cookie:gestor,data:{status:'Sim'}})).status,200);
    assert.equal((await request('/returns/'+firstId+'/conference',{method:'PATCH',cookie:gestor,data:{status:'Pendente'}})).status,200);
  });
  await t.test('cadastro exige política e confirmação; primeira entrada é restrita',async()=>{
    const data={name:'Novo usuário',email:'novo@teste.local',role:'USUÁRIO',area:'Área A',password:'fraca',confirmation:'fraca'};
    assert.equal((await request('/users',{method:'POST',cookie:admin,data})).status,400);
    data.password=password;assert.equal((await request('/users',{method:'POST',cookie:admin,data})).status,400);
    data.confirmation=password;assert.equal((await request('/users',{method:'POST',cookie:admin,data})).status,200);
    createdUser=(await request('/state',{cookie:admin})).body.users.find(u=>u.email===data.email).id;
    const initial=await login('novo');assert.equal((await request('/state',{cookie:initial})).status,403);
    assert.equal((await request('/password',{method:'POST',cookie:initial,data:{currentPassword:password,password:'Pessoal456!',confirmation:'Pessoal456!'}})).status,200);
    assert.equal((await request('/me',{cookie:initial})).status,401);
    const renewed=await login('novo','Pessoal456!');assert.equal((await request('/state',{cookie:renewed})).status,200);
    assert.equal((await request('/users/'+createdUser+'/reset',{method:'POST',cookie:admin,data:{password:'Temporaria789!',confirmation:'Temporaria789!'}})).status,200);
    assert.equal((await request('/state',{cookie:renewed})).status,401);
    const reset=await login('novo','Temporaria789!');assert.equal((await request('/state',{cookie:reset})).status,403);
    assert.equal((await request('/users/'+createdUser,{method:'DELETE',cookie:admin,data:{}})).status,200);
    assert.equal((await request('/me',{cookie:reset})).status,401);
  });
  await t.test('histórico de catálogo, exclusão lógica e auditoria sem segredos',async()=>{
    assert.equal((await request('/catalogs/empresa',{method:'DELETE',cookie:admin,data:{old:'Opção'}})).status,200);
    assert.equal((await request('/returns',{method:'POST',cookie:user,data:{...payload,contrato:'novo-contrato'}})).status,400);
    assert.equal((await request('/returns/'+firstId,{method:'PATCH',cookie:user,data:payload})).status,200);
    assert.equal((await request('/returns/'+firstId,{method:'DELETE',cookie:user,data:{}})).status,200);
    assert.equal((await request('/state',{cookie:user})).body.records.length,0);
    assert.equal((await db.query('SELECT deleted_at FROM app.returns WHERE id=$1',[firstId])).rows[0].deleted_at instanceof Date,true);
    const audit=JSON.stringify((await db.query('SELECT * FROM app.audit_log')).rows);
    assert.equal(audit.includes(password),false);assert.equal(audit.includes('scrypt$'),false);assert.match(audit,/ADMIN_PASSWORD_RESET/);
    assert.equal((await request('/logout',{method:'POST',cookie:user,data:{}})).status,200);
    assert.equal((await request('/me',{cookie:user})).status,401);
  });
  await t.test('tentativas repetidas são limitadas',async()=>{
    let result;for(let i=0;i<11;i++)result=await request('/login',{method:'POST',data:{email:'inexistente@teste.local',password:'Errada123!'}});
    assert.equal(result.status,429);
  });
});
