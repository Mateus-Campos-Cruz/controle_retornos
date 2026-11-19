import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordPolicy,hashPassword,verifyPassword,scope,emailAddress } from '../server/security.js';
test('senha exige tamanho, maiúscula, número, especial e confirmação',()=>{
  for(const value of ['Ab1!','abcdefgh1!','Abcdefgh!','Abcdefgh1','Abcdefg1 '])assert.throws(()=>passwordPolicy(value,value));
  assert.throws(()=>passwordPolicy('Senha123!','Outra123!'));
  assert.throws(()=>passwordPolicy('A1!'+ 'x'.repeat(126),'A1!'+ 'x'.repeat(126)));
  assert.doesNotThrow(()=>passwordPolicy('Senha123!','Senha123!'));
  assert.doesNotThrow(()=>passwordPolicy('Árvore12!','Árvore12!'));
});
test('hashes são únicos, verificáveis e não aceitam senha incorreta',async()=>{
  const a=await hashPassword('Senha123!'),b=await hashPassword('Senha123!');
  assert.notEqual(a,b);assert.equal(a.includes('Senha123!'),false);
  assert.equal(await verifyPassword('Senha123!',a),true);
  assert.equal(await verifyPassword('Errada123!',a),false);
  assert.equal(await verifyPassword('Senha123!',null),false);
  assert.equal(await verifyPassword({},a),false);
});
test('escopo de dados restringe usuários e gestores no servidor',()=>{
  assert.deepEqual(scope({role:'USUARIO',id:'u1'}),{sql:'r.created_by_user_id=$1',values:['u1']});
  assert.deepEqual(scope({role:'GESTOR',area_id:'a1'},'r',2),{sql:'r.area_id=$2',values:['a1']});
  assert.deepEqual(scope({role:'ADMINISTRADOR'}),{sql:'TRUE',values:[]});
  assert.equal(emailAddress(' Teste@Exemplo.com '),'teste@exemplo.com');
});
