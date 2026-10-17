# Partiva

Base visual e operacional para gestão de peças automotivas.

## O que já está funcionando

- Quadro Kanban com colunas operacionais personalizáveis.
- Busca por peça, veículo, categoria ou código interno.
- Filtro por categoria.
- Modal inteligente para cadastro de peça.
- Ficha detalhada com avanço de etapa e exclusão.
- Persistência local para prototipação e demonstração.
- Tela de login e cadastro de novos usuários via Supabase Auth, ativada ao configurar `config.js`.
- Migração Supabase com workspaces, membros, colunas, peças, fotos e eventos.
- RLS preparado para separar acesso por workspace.

## Como visualizar

Abra `index.html` no navegador. Como a versão inicial é estática, não é necessário instalar dependências para validar a interface.

## Próxima ativação do Supabase

1. Crie um projeto no Supabase e habilite o Auth.
2. Execute `supabase/migrations/20261016000000_partiva_foundation.sql` no SQL Editor.
3. Preencha `config.js` com a URL do projeto, a chave publishable/anon e o `workspaceId`. Nunca use a `service_role` no navegador.
4. O login/cadastro já está conectado ao Supabase Auth quando a configuração existe. A próxima camada é substituir a persistência local em `app.js` por consultas ao banco, mantendo os estados independentes (`operational_status`, `listing_status`, `sale_status`).

## Deploy

O projeto está estruturado como site estático para Cloudflare Pages e inclui `wrangler.toml`.

## Fluxo oficial de atualização

- O GitHub (`Celluux/partiva`, branch `main`) é a fonte oficial do código.
- Toda alteração feita no projeto deve ser registrada no GitHub antes de ser considerada concluída.
- O Cloudflare Pages está conectado ao repositório e publica automaticamente cada atualização da branch `main` em `https://partiva.pages.dev/`.
- O Supabase permanece como backend oficial para autenticação, banco de dados e armazenamento.
- Não enviar chaves secretas ao navegador ou ao GitHub; apenas a chave publishable do Supabase pode aparecer em `config.js`.

## Identidade visual

- Wordmark textual em Caveat, sem símbolo acoplado ao logotipo.
- Paleta baseada em azul-petróleo, branco, cinza-claro, grafite e âmbar operacional.
- Mascote separado em `assets/partiva-mascot.png`.
- Diretrizes persistidas em `.interface-design/system.md` e `design-system/partiva/MASTER.md`.
