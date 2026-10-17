# Partiva — operação interna

Aplicativo de uma única empresa de desmonte, com acesso individual de funcionários. Mantém a identidade visual, os símbolos e o mascote aprovados. Não possui cadastro público de empresas, planos, assinaturas ou seleção de organizações.

## Executar

Requer Node.js 24 e pnpm 11.25.0. As dependências estão fixadas em `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Frontend em `http://127.0.0.1:5173`. Em outro terminal, `pnpm worker:connected` executa o backend de convites conectado ao PARTIVAA em `127.0.0.1:8787`; o frontend encaminha `/api` para ele. Não é necessário Docker para executar o frontend, Worker ou os testes PostgreSQL locais.

Sem a chave pública do Supabase, a tela informa a configuração pendente e bloqueia operações. Não há dados fictícios, login alternativo ou gravação local como substituto do banco.

## Projeto Supabase oficial

Somente **PARTIVAA**, referência **twtldgdceidyurinrvsy**, é autorizado nesta implementação. Frontend, Worker e scripts de migração rejeitam o projeto antigo. Nenhuma implantação em produção é autorizada por estes scripts.

Para configurar um token já criado, execute no seu terminal local:

```powershell
node scripts/connect-supabase.mjs
```

O campo de entrada é oculto. O Windows criptografa a credencial com DPAPI em `%LOCALAPPDATA%\Partiva\CodexCredentials`, com acesso restrito ao usuário e SYSTEM. O invocador injeta o token somente no ambiente do processo da CLI. O token não fica em argumentos, código, `.env`, histórico do terminal ou Git.

```powershell
node scripts/supabase-auth.mjs db query --linked --project-ref twtldgdceidyurinrvsy "select current_database()"
node scripts/supabase-auth.mjs migration list --linked --project-ref twtldgdceidyurinrvsy
pnpm configure:dev
pnpm inspect:dev
```

`configure:dev` seleciona apenas uma chave pública publishable/anon e grava `.env.local`, ignorado pelo Git. Nenhuma chave administrativa é enviada ao navegador. Alternativamente, copie `.env.example` para `.env.local` e configure a chave pública do projeto autorizado.

Antes de migrar, confira o banco, o histórico e os registros existentes. A cópia SQL na raiz é um arquivo legado; a pasta `supabase/migrations` é a fonte das migrações.

```powershell
node scripts/supabase-auth.mjs link --project-ref twtldgdceidyurinrvsy
pnpm migrate:dev
```

Esse comando apenas mostra o que seria aplicado. Depois da conferência de compatibilidade e preservação, `pnpm migrate:dev -- --apply` aplica as migrações aditivas ao projeto vinculado de desenvolvimento. Não execute `db reset`, não reaplique SQL à força e não altere histórico de migrações sem conferir o esquema remoto.

## Empresa e funcionários

A empresa ativa aproveita `workspaces` e `workspace_members`. O primeiro administrador deve ser uma conta Supabase Auth autorizada e já existente; não há promoção automática de cadastros públicos. `PARTIVA_ADMIN_EMAIL` e `pnpm bootstrap:admin` permitem a vinculação inicial por um operador confiável, recusando a operação se já houver administrador ativo.

Perfis: Administrador, Operação, Fotografias, Vendas e Consulta. Desativar um funcionário bloqueia imediatamente o acesso aos dados, mesmo com token Auth ainda válido. O banco impede remover o último administrador ativo.

Em **Minha Empresa**, administradores editam razão social, nome fantasia, CNPJ, contato, endereço, logo, taxas e preferências. Dados comerciais, funcionários e alterações da empresa possuem histórico. Os demais funcionários consultam os dados permitidos.

Para convites, copie `worker/.dev.vars.example` para `worker/.dev.vars` e configure as chaves de desenvolvimento. A chave administrativa pertence exclusivamente ao Worker. Em hospedagem, use os secrets do Cloudflare e a ligação de serviço `PARTIVA_API`; nunca configure `VITE_` com uma chave administrativa. O estado de integração distingue configuração, envio testado e conexão inexistente.

## Fluxo operacional

- Cadastro progressivo em três passos, salvamento real de rascunhos e recuperação de preenchimento após falha de rede.
- Identificador numérico gerado no PostgreSQL; imutável e nunca reutilizado. Transações canceladas podem deixar lacunas, sem reciclar números.
- Detran repetível com aviso, catálogo pesquisável, campos condicionais, título sugerido editável e preço em centavos.
- Fotografias privadas: originais preservados, versões editadas vinculadas, capa, ordenação e seleção para anúncio. Envio interrompido após upload pode ter seu vínculo recuperado.
- Kanban com colunas configuráveis, regras de passagem, movimentos livres e exclusão transacional com destino obrigatório.
- Tabela com os mesmos registros, filtros combinados, ordenação e preferências individuais salvas no banco.
- Reservas, vendas presenciais, vendas online confirmadas manualmente, cancelamentos e proteção transacional contra venda duplicada.
- Estados operacional, de anúncio e de venda separados. Etapa operacional não simula publicação ou venda.
- Mercado Livre permanece desconectado. A integração oficial é posterior; não existem publicações fictícias.

Excluir uma peça é arquivá-la: identidade, fotos e histórico permanecem preservados, com opção de restauração. Dados locais antigos só são importados após conferência explícita em Minha Empresa; a origem é mantida e importações repetidas não duplicam peças.

## Verificações

```powershell
pnpm check
pnpm test
pnpm test:e2e
pnpm build
pnpm worker:check
pnpm format:check
```

Os testes de banco executam as migrações reais em PostgreSQL embarcado (PGlite), incluindo RLS, concorrência, vendas e preservação de registros anteriores. Os testes de navegador usam esse mesmo banco por um transporte isolado de teste. Auth e transporte de Storage desses testes são fixtures: não comprovam o funcionamento do serviço Supabase remoto. A sincronização entre duas sessões também é verificada localmente por atualização de dados; Realtime remoto exige homologação no projeto de desenvolvimento.

`pnpm test:dev` realiza apenas leituras no Supabase real, com uma conta de teste autorizada fornecida por ambiente. Não cria dados remotos de teste. Os testes E2E usam Edge no Windows e Chromium no CI.

## GitHub e Cloudflare

GitHub permanece como fonte versionada. O workflow de verificação executa build, código, banco e navegador; ele não publica. Cloudflare Pages hospeda `dist`, e Pages Functions encaminha `/api` para o Worker privado de desenvolvimento. Os arquivos do sistema antigo e suas credenciais não são usados na nova execução.

As atualizações devem ser revisadas em branch própria. Não faça merge ou publicação de produção sem autorização. Consulte `IMPLEMENTACAO.md` para resultados e pendências de homologação.

A integração real foi validada em 17/10/2026; consulte `IMPLEMENTACAO.md`. Os scripts `validate-live.mjs` e `validate-live-browser.mjs` gravam dados técnicos e só devem ser executados com autorização explícita e `--allow-writes`. Não fazem parte da execução normal ou CI.
