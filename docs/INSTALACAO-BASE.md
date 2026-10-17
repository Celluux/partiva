# Instalação de uma nova empresa

O repositório é o código-base do Partiva. Dados de empresa, peças,
fotografias, usuários, históricos e credenciais pertencem à instalação e não
são incluídos no código.

## Preparar o ambiente

1. Crie um projeto Supabase vazio para a nova empresa.
2. Copie `.env.example` para `.env.local` e informe apenas a URL e a chave
   publishable desse projeto.
3. Aplique as migrações com a Supabase CLI autenticada. Elas criam um banco
   vazio; não há importação automática do PARTIVAA.
4. Configure `SUPABASE_URL`, `ALLOWED_ORIGIN` e a chave publishable no
   ambiente do Worker. Cadastre `SUPABASE_SECRET_KEY` com `wrangler secret`.
5. Crie a primeira conta Auth no painel seguro e vincule-a como administrador
   usando `PARTIVA_ADMIN_EMAIL` e `pnpm bootstrap:admin`.
6. Publique o frontend em um projeto Pages separado, usando o mesmo conjunto de
   variáveis do `.env.local`.

O aplicativo inicia com a empresa vazia. O administrador preenche **Minha
Empresa**, convida funcionários e define preferências. Identificadores e
fotografias passam a ser gerados no novo banco e Storage.

## Isolamento

Não copie `.env.local`, `worker/.dev.vars`, o diretório `artifacts/private`,
backups, dados de Storage ou usuários Auth entre instalações. Não reutilize o
perfil `deployments/partivaa` para outra empresa: crie um novo perfil de
implantação com outra referência Supabase, Pages e Worker.

## Instalação atual

O perfil `deployments/partivaa` documenta somente a infraestrutura da
instalação existente. Os dados reais permanecem no PARTIVAA e não fazem parte
do aplicativo-base.
