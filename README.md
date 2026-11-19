# Plantão Solução

Aplicação com API Node.js, PostgreSQL e autenticação por e-mail e senha. O frontend deve ser servido pela API: abrir `dist/index.html` como arquivo local não permite autenticar.

## Instalação

1. Instale Node.js 24 LTS e PostgreSQL 14 ou superior.
2. Crie um banco vazio e um usuário PostgreSQL. Copie `.env.example` para `.env` e configure `DATABASE_URL` e `APP_ORIGIN`.
3. Execute `npm ci`.
4. **Banco novo:** `npm run db:init`. Isso cria as tabelas e os catálogos iniciais, sem usuários ou retornos fictícios.
5. **Banco existente no schema anterior:** faça backup e execute `npm run db:migrate`. Não execute `db:init` em um banco existente. A migração preserva registros; contas sem hash não podem entrar até receberem senha pelo administrador.
6. Configure `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_PASSWORD_CONFIRM` no ambiente local do processo e execute `npm run admin:create`. Use uma senha inicial forte. O comando só permite criar o primeiro administrador com senha; remova as variáveis de senha depois. Não publique senhas, arquivos `.env` nem credenciais em Git. A primeira entrada exige uma nova senha pessoal.
7. Execute `npm start` e abra o endereço definido em `APP_ORIGIN`, por exemplo `http://localhost:3000`.

O script `db:init` deve ser executado com a identidade de migração. Em produção, a API deve utilizar outra identidade, sem superusuário nem permissão de criar/apagar tabelas; conceda uso no schema `app`, SELECT/INSERT/UPDATE/DELETE nas tabelas operacionais e uso nas sequences, com INSERT apenas para a tabela de auditoria. Restrinja a rede do banco ao servidor.

## Senhas e sessões

- Senhas entre 8 e 128 caracteres, com uma letra maiúscula, um número e um caractere especial; confirmação obrigatória no cadastro, redefinição e troca.
- Hash scrypt com salt aleatório; senhas e tokens não são retornados pela API nem gravados na auditoria.
- Sessões de 8 horas, token aleatório com hash no banco, cookie HttpOnly/SameSite=Strict e Secure em produção.
- Administrador cadastra usuários, define a senha inicial e pode redefini-la. O usuário precisa trocar a senha inicial antes de acessar dados. A redefinição encerra todas as sessões anteriores.
- Todos os perfis podem alterar sua própria senha informando a atual. A troca encerra as sessões e exige novo login.
- Há limite de tentativas por conta e endereço de conexão em uma janela de 15 minutos. Atrás de proxy, o limite de IP é compartilhado pelo proxy; configure também limitação de tráfego no proxy. Cabeçalhos de IP enviados pelo cliente não são confiados pela API.
- A API exige a origem exata de `APP_ORIGIN` para alterações e não habilita CORS.

Os parâmetros de scrypt seguem a [orientação da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Permissões

| Perfil | Retornos e dashboards | Conferência | Usuários e catálogos |
| --- | --- | --- | --- |
| Administrador | Todos | Sim | Administrar |
| Gestor | Retornos da sua área | Na própria área | Apenas consultar seu perfil |
| Usuário | Apenas seus retornos | Não | Apenas consultar seu perfil |

A API aplica essas regras em todas as consultas e alterações. A área do retorno é registrada na criação, preservando seu vínculo histórico mesmo que o autor mude de área. Retornos antigos sem área precisam de classificação administrativa no banco antes de serem visíveis a gestores. Administradores continuam podendo consultá-los.

Usuários são desativados, retornos excluídos logicamente e itens de catálogo inativados. Isso preserva referências e autoria. E-mails desativados continuam reservados no banco; reativação requer procedimento administrativo no banco nesta versão. Não há cadastro público nem envio de recuperação por e-mail; a senha inicial/redefinida deve ser entregue ao usuário por canal privado.

## Publicação

- Defina `NODE_ENV=production` e `APP_ORIGIN=https://seu-dominio`.
- Use proxy reverso com certificado TLS e encaminhe ao `HOST`/`PORT` da API. Não exponha diretamente a porta interna. A origem precisa corresponder exatamente ao endereço usado no navegador.
- Use conexão PostgreSQL com validação de certificado quando o banco for remoto. Configure backups e teste a restauração antes da publicação.
- Execute migrações com backup, crie o primeiro administrador, teste cada perfil e só então libere o acesso.
- Defina retenção da auditoria, monitoramento de erros e capacidade para o volume esperado. Relatórios/dashboards carregam os registros do escopo atual; bases grandes precisam de paginação e agregação no servidor antes de ampliar a operação.
- A migração não importa os dados do protótipo que existiam apenas na memória do navegador.

## Verificação

`npm test` executa testes de política de senha, hashing e escopo. Os testes de integração usam um PostgreSQL **exclusivo de testes**, contendo `_test` no nome, informado em `TEST_DATABASE_URL`; não aponte essa variável ao banco real. Eles inicializam e removem apenas o schema `app` desse banco de testes.

Os arquivos de teste e ferramentas locais não são servidos pela API. A publicação deve incluir `dist`, `server`, `database`, `package.json` e `package-lock.json`, sem `.tools`, `.git` ou credenciais.
