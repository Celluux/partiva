# Perfil de implantação: PARTIVAA

Este diretório descreve a instalação atual do Partiva. Ele contém somente
referências de implantação, nunca dados da empresa, usuários, fotografias ou
segredos. O banco e o Storage continuam exclusivamente no Supabase configurado
para esta instalação.

- Projeto Supabase: `twtldgdceidyurinrvsy`
- Pages: `partiva`
- Branch de prévia: `codex/partiva-operacional`
- Worker: `partivaa-api`

O arquivo `frontend.public.json` contém somente a URL do projeto e a chave
publicável do Supabase. Essa chave é própria para uso no navegador e não é uma
credencial administrativa. O build do Pages lê esse arquivo por meio de
`scripts/build-pages.mjs`; chaves secretas nunca entram no bundle. Segredos do
Worker devem ser cadastrados com Wrangler e nunca commitados.
