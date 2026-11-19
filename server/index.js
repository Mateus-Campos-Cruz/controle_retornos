import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.js';
import { HttpError, passwordPolicy, hashPassword, verifyPassword, token, digest, field, emailAddress, uuid, scope } from './security.js';

const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:3000').origin;
const production = process.env.NODE_ENV === 'production';
if (production && !origin.startsWith('https://')) throw Error('Produção exige APP_ORIGIN com HTTPS.');
const cookieName = production ? '__Host-plantao' : 'plantao';
const catalogTables = { cobrador: 'collectors', empresa: 'companies', tipo: 'contact_types', recebido: 'receipt_channels' };
const statusDb = { Pendente: 'PENDENTE', Sim: 'SIM', Não: 'NAO' };
const roleDb = { ADMINISTRADOR: 'ADMINISTRADOR', GESTOR: 'GESTOR', USUÁRIO: 'USUARIO' };
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role === 'USUARIO' ? 'USUÁRIO' : u.role, area: u.area || '', mustChangePassword: u.must_change_password });
const cookie = (value, expires = 28800) => `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expires}${production ? '; Secure' : ''}`;
const sessionHash = req => {
  const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? digest(value) : '';
};
function admin(user) { if (user.role !== 'ADMINISTRADOR') throw new HttpError(403, 'Acesso exclusivo do administrador.'); }
async function authenticate(db, req) {
  const { rows } = await db.query(`SELECT u.*, a.name AS area, s.id AS session_id FROM app.user_sessions s JOIN app.users u ON u.id=s.user_id LEFT JOIN app.areas a ON a.id=u.area_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active FOR SHARE OF u`, [sessionHash(req)]);
  if (!rows[0]) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  return rows[0];
}
async function audit(db, user, action, table, id, data = {}) {
  // Never include passwords, hashes, session tokens or request bodies in audit data.
  await db.query('INSERT INTO app.audit_log(actor_user_id,action,table_name,record_id,new_data) VALUES($1,$2,$3,$4,$5)', [user?.id || null, action, table, id, JSON.stringify(data)]);
}
async function throttle(req, email) {
  const keys = [[digest('ip:' + req.socket.remoteAddress), 100], [digest('email:' + email), 10]];
  for (const [key, limit] of keys) {
    const { rows } = await pool.query(`INSERT INTO app.auth_attempts(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN app.auth_attempts.expires_at<now() THEN 1 ELSE app.auth_attempts.attempts+1 END, expires_at=CASE WHEN app.auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE app.auth_attempts.expires_at END RETURNING attempts`, [key]);
    if (rows[0].attempts > limit) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
  }
}
async function areaId(db, name) {
  const { rows } = await db.query('INSERT INTO app.areas(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [field(name, 'Área')]);
  return rows[0].id;
}
async function state(db, me) {
  const catalogs = {};
  for (const [key, table] of Object.entries(catalogTables)) catalogs[key] = (await db.query(`SELECT name FROM app.${table} WHERE is_active ORDER BY name`)).rows.map(r => r.name);
  const permitted = scope(me);
  const { rows } = await db.query(`SELECT r.*, ct.name AS tipo, c.name AS cobrador, rc.name AS recebido, co.name AS empresa, u.name AS owner FROM app.returns r JOIN app.contact_types ct ON ct.id=r.contact_type_id JOIN app.collectors c ON c.id=r.collector_id JOIN app.receipt_channels rc ON rc.id=r.receipt_channel_id JOIN app.companies co ON co.id=r.company_id LEFT JOIN app.users u ON u.id=r.created_by_user_id WHERE r.deleted_at IS NULL AND ${permitted.sql} ORDER BY r.created_at DESC`, permitted.values);
  const users = me.role === 'ADMINISTRADOR' ? (await db.query('SELECT u.*, a.name AS area FROM app.users u LEFT JOIN app.areas a ON a.id=u.area_id WHERE u.is_active ORDER BY u.name')).rows.map(publicUser) : [publicUser(me)];
  return { me: publicUser(me), users, catalogs, records: rows.map(r => ({ id: r.id, socio: r.partner_name, contrato: r.contract_number, tipo: r.tipo, cobrador: r.cobrador, recebido: r.recebido, empresa: r.empresa, owner: r.owner || 'Usuário desativado', ownerId: r.created_by_user_id, origin: r.origin_role, createdAt: r.created_at, created: r.created_at.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), status: Object.keys(statusDb).find(k => statusDb[k] === r.conference_status) })) };
}
async function handleApi(req, res, path, data) {
  if (req.method !== 'GET' && req.headers.origin !== origin) throw new HttpError(403, 'Origem da solicitação não permitida.');
  if (path === '/api/password' && req.method === 'POST') await throttle(req, 'password:' + sessionHash(req));
  if (path === '/api/login' && req.method === 'POST') {
    const email = emailAddress(data.email);
    await throttle(req, email);
    const result = await transaction(async db => {
      const { rows } = await db.query('SELECT u.*, a.name AS area FROM app.users u LEFT JOIN app.areas a ON a.id=u.area_id WHERE lower(email)=$1 FOR UPDATE OF u', [email]);
      const user = rows[0];
      const valid = await verifyPassword(data.password, user?.password_hash);
      if (!valid || !user?.is_active) throw new HttpError(401, 'E-mail ou senha inválidos.');
      const secret = token();
      await db.query('INSERT INTO app.user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'8 hours\')', [user.id, digest(secret)]);
      await db.query('UPDATE app.users SET last_login_at=now() WHERE id=$1', [user.id]);
      await audit(db, user, 'LOGIN', 'users', user.id);
      return { secret, me: publicUser(user) };
    });
    res.setHeader('Set-Cookie', cookie(result.secret));
    return { me: result.me };
  }
  // Serialize account/security mutations before taking user row locks.
  return transaction(async db => {
    if (path.startsWith('/api/users') || path === '/api/password') await db.query('SELECT pg_advisory_xact_lock(854127)');
    const me = await authenticate(db, req);
    if (path === '/api/logout' && req.method === 'POST') {
      await db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE id=$1', [me.session_id]);
      await audit(db, me, 'LOGOUT', 'users', me.id);
      res.setHeader('Set-Cookie', cookie('', 0)); return { ok: true };
    }
    if (path === '/api/me' && req.method === 'GET') return { me: publicUser(me) };
    if (path === '/api/password' && req.method === 'POST') {
      passwordPolicy(data.password, data.confirmation);
      if (!await verifyPassword(data.currentPassword, me.password_hash)) throw new HttpError(400, 'Senha atual incorreta.');
      if (data.password === data.currentPassword) throw new HttpError(400, 'Escolha uma senha diferente da atual.');
      const hash = await hashPassword(data.password);
      await db.query('UPDATE app.users SET password_hash=$1,must_change_password=false,password_changed_at=now() WHERE id=$2', [hash, me.id]);
      await db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1', [me.id]);
      await audit(db, me, 'UPDATE', 'users', me.id, { event: 'PASSWORD_CHANGED' });
      res.setHeader('Set-Cookie', cookie('', 0)); return { ok: true, loginRequired: true };
    }
    if (me.must_change_password) throw new HttpError(403, 'Altere sua senha antes de acessar a aplicação.');
    if (path === '/api/state' && req.method === 'GET') return state(db, me);
    const userRoute = path.match(/^\/api\/users(?:\/([^/]+))?(?:\/(reset))?$/);
    if (userRoute && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      admin(me);
      const id = userRoute[1] ? uuid(userRoute[1]) : null;
      const target = id ? (await db.query('SELECT * FROM app.users WHERE id=$1 AND is_active FOR UPDATE', [id])).rows[0] : null;
      if (id && !target) throw new HttpError(404, 'Usuário não encontrado.');
      if (userRoute[2] === 'reset' && req.method === 'POST') {
        if (id === me.id) throw new HttpError(400, 'Use Alterar minha senha no seu perfil.');
        passwordPolicy(data.password, data.confirmation);
        await db.query('UPDATE app.users SET password_hash=$1,must_change_password=true,password_changed_at=now() WHERE id=$2', [await hashPassword(data.password), id]);
        await db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
        await audit(db, me, 'UPDATE', 'users', id, { event: 'ADMIN_PASSWORD_RESET' });
        return { ok: true };
      }
      if (req.method === 'DELETE' && id) {
        if (id === me.id) throw new HttpError(400, 'Você não pode desativar sua própria conta.');
        await db.query('UPDATE app.users SET is_active=false WHERE id=$1', [id]);
        await db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
        await audit(db, me, 'DELETE', 'users', id, { event: 'DEACTIVATED' }); return { ok: true };
      }
      if ((!id && req.method === 'POST') || (id && req.method === 'PATCH')) {
        const name = field(data.name, 'Nome'), email = emailAddress(data.email), role = roleDb[data.role];
        if (!role) throw new HttpError(400, 'Perfil inválido.');
        if (id === me.id && role !== me.role) throw new HttpError(400, 'Você não pode alterar seu próprio perfil de acesso.');
        const area = await areaId(db, data.area);
        let savedId = id;
        if (id) {
          await db.query('UPDATE app.users SET name=$1,email=$2,role=$3,area_id=$4 WHERE id=$5', [name,email,role,area,id]);
          if (target.role !== role || target.area_id !== area || target.email !== email) await db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1', [id]);
        } else {
          passwordPolicy(data.password, data.confirmation);
          savedId = (await db.query('INSERT INTO app.users(name,email,role,area_id,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING id', [name,email,role,area,await hashPassword(data.password)])).rows[0].id;
        }
        await audit(db, me, id ? 'UPDATE' : 'INSERT', 'users', savedId, { name,email,role,area }); return { ok: true };
      }
    }
    const catalogRoute = path.match(/^\/api\/catalogs\/(cobrador|empresa|tipo|recebido)$/);
    if (catalogRoute && ['POST','PATCH','DELETE'].includes(req.method)) {
      admin(me);const table = catalogTables[catalogRoute[1]];
      if (req.method === 'POST') {
        const name = field(data.value,'Nome',100);
        const row = (await db.query(`INSERT INTO app.${table}(name) VALUES($1) RETURNING id`,[name])).rows[0];
        await audit(db,me,'INSERT',table,row.id,{name});
      } else {
        const old = field(data.old,'Nome',120);
        const row = (await db.query(`SELECT id FROM app.${table} WHERE name=$1 AND is_active FOR UPDATE`,[old])).rows[0];
        if (!row) throw new HttpError(404,'Item não encontrado.');
        if (req.method === 'DELETE') await db.query(`UPDATE app.${table} SET is_active=false WHERE id=$1`,[row.id]);
        else await db.query(`UPDATE app.${table} SET name=$1 WHERE id=$2`,[field(data.value,'Nome',100),row.id]);
        await audit(db,me,req.method === 'DELETE'?'DELETE':'UPDATE',table,row.id,{old});
      }
      return {ok:true};
    }
    const returnRoute = path.match(/^\/api\/returns(?:\/([^/]+))?(?:\/(conference))?$/);
    if (returnRoute && ['POST','PATCH','DELETE'].includes(req.method)) {
      const id = returnRoute[1] ? uuid(returnRoute[1]) : null;
      let old;
      if (id) {
        const permitted=scope(me,'r',2);
        old=(await db.query(`SELECT r.* FROM app.returns r WHERE r.id=$1 AND r.deleted_at IS NULL AND ${permitted.sql} FOR UPDATE`,[id,...permitted.values])).rows[0];
        if (!old) throw new HttpError(404,'Retorno não encontrado.');
      }
      if (returnRoute[2] === 'conference' && req.method === 'PATCH') {
        if (!['ADMINISTRADOR','GESTOR'].includes(me.role)) throw new HttpError(403,'Sem permissão para conferir retornos.');
        const status=statusDb[data.status];if (!status) throw new HttpError(400,'Status inválido.');
        await db.query('UPDATE app.returns SET conference_status=$1,conference_updated_by=$2,conference_updated_at=$3 WHERE id=$4',[status,status==='PENDENTE'?null:me.id,status==='PENDENTE'?null:new Date(),id]);
        await audit(db,me,'UPDATE','returns',id,{event:'CONFERENCE',status});return {ok:true};
      }
      if (req.method === 'DELETE' && id) {
        await db.query('UPDATE app.returns SET deleted_at=now() WHERE id=$1',[id]);
        await audit(db,me,'DELETE','returns',id);return {ok:true};
      }
      if ((!id && req.method === 'POST') || (id && req.method === 'PATCH')) {
        const name=field(data.socio,'Sócio',160),contract=field(data.contrato,'Contrato',80).toUpperCase();
        const ids=[];
        for (const [key,column] of [['tipo','contact_type_id'],['cobrador','collector_id'],['recebido','receipt_channel_id'],['empresa','company_id']]) {
          const row=(await db.query(`SELECT id FROM app.${catalogTables[key]} WHERE name=$1 AND (is_active OR id=$2) FOR SHARE`,[field(data[key],key,120),old?.[column]||null])).rows[0];
          if (!row) throw new HttpError(400,`Selecione uma opção válida de ${key}.`);ids.push(row.id);
        }
        let savedId=id;
        if (id) await db.query('UPDATE app.returns SET partner_name=$1,contract_number=$2,contact_type_id=$3,collector_id=$4,receipt_channel_id=$5,company_id=$6 WHERE id=$7',[name,contract,...ids,id]);
        else savedId=(await db.query('INSERT INTO app.returns(partner_name,contract_number,contact_type_id,collector_id,receipt_channel_id,company_id,created_by_user_id,origin_role,area_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[name,contract,...ids,me.id,me.role,me.area_id])).rows[0].id;
        await audit(db,me,id?'UPDATE':'INSERT','returns',savedId,{socio:name,contrato:contract});return {ok:true};
      }
    }
    throw new HttpError(404,'Recurso não encontrado.');
  });
}
async function body(req) {
  if (req.method === 'GET') return {};
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415,'Envie dados JSON.');
  let size=0;const chunks=[];
  for await (const chunk of req) { size+=chunk.length;if(size>16384)throw new HttpError(413,'Solicitação muito grande.');chunks.push(chunk); }
  try { const value=JSON.parse(Buffer.concat(chunks).toString());if(!value || Array.isArray(value) || typeof value!=='object')throw Error();return value; }
  catch {throw new HttpError(400,'Dados inválidos.');}
}
const staticFiles = new Set(['index.html','app.js','api.js','login.js','settings.js','report-pdf.js']);
export const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try {
    const path=new URL(req.url,origin).pathname;
    if(path.startsWith('/api/')){const result=await handleApi(req,res,path,await body(req));res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result));return;}
    const name=path==='/'?'index.html':path.slice(1);
    if(req.method!=='GET'||!staticFiles.has(name))throw new HttpError(404,'Página não encontrada.');
    const content=await readFile(fileURLToPath(new URL('../dist/'+name,import.meta.url)));
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(content);
  }catch(error){
    const status=error.status||(error.code==='23505'?409:500);
    if(status===500)console.error('Falha na API:',error.code||error.name);
    res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:error.status?error.message:status===409?'Já existe um cadastro com este e-mail, contrato ou nome.':'Não foi possível concluir a operação. Tente novamente.'}));
  }
});
server.requestTimeout=15000;server.headersTimeout=10000;
if (!(await pool.query("SELECT version FROM app.schema_migrations WHERE version='001_auth'")).rowCount) throw Error('Execute a migração do banco antes de iniciar.');
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Aplicação disponível em '+origin));
const cleanup=setInterval(()=>pool.query("DELETE FROM app.auth_attempts WHERE expires_at<now(); DELETE FROM app.user_sessions WHERE expires_at<now()-interval '1 day'").catch(()=>{}),3600000);cleanup.unref();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>pool.end().then(()=>process.exit(0))));
