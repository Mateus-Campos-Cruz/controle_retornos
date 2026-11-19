import { readFile } from 'node:fs/promises';
import { pool, transaction } from './db.js';
import { passwordPolicy, hashPassword, emailAddress, field } from './security.js';
const read = async name => (await readFile(new URL('../database/'+name,import.meta.url),'utf8')).replace(/^\uFEFF/,'');
try {
  const command=process.argv[2];
  if(command==='init') {
    // New databases only. No DROP or destructive schema replacement.
    await pool.query(await read('schema.sql'));
    console.log('Banco inicializado.');
  } else if(command==='migrate') {
    await pool.query(await read('migrations/001_auth.sql'));
    console.log('Migração aplicada.');
  } else if(command==='admin') {
    const name=field(process.env.ADMIN_NAME,'ADMIN_NAME'),email=emailAddress(process.env.ADMIN_EMAIL);
    passwordPolicy(process.env.ADMIN_PASSWORD,process.env.ADMIN_PASSWORD_CONFIRM);
    const hash=await hashPassword(process.env.ADMIN_PASSWORD);
    await transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(854127)');
      if((await db.query("SELECT 1 FROM app.users WHERE role='ADMINISTRADOR' AND is_active AND password_hash IS NOT NULL")).rowCount)throw Error('Já existe administrador. Use o gerenciamento de usuários.');
      const area=(await db.query("INSERT INTO app.areas(name) VALUES('Administração') ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id")).rows[0].id;
      await db.query("INSERT INTO app.users(name,email,role,area_id,password_hash,must_change_password) VALUES($1,$2,'ADMINISTRADOR',$3,$4,true)",[name,email,area,hash]);
    });
    console.log('Administrador criado. A primeira entrada exige troca de senha. Remova as variáveis ADMIN_PASSWORD e ADMIN_PASSWORD_CONFIRM do ambiente.');
  } else throw Error('Use init, migrate ou admin.');
  if(command==='init') {
    const catalogs=JSON.parse(await read('catalogs.json'));
    const tables={cobrador:'collectors',empresa:'companies',tipo:'contact_types',recebido:'receipt_channels'};
    await transaction(async db=>{for(const [key,names] of Object.entries(catalogs))for(const name of names)await db.query(`INSERT INTO app.${tables[key]}(name) VALUES($1) ON CONFLICT DO NOTHING`,[name]);});
  }
}catch(error){console.error(error.code ? 'Falha no banco: '+error.code : error.message);process.exitCode=1;}
finally{await pool.end();}
