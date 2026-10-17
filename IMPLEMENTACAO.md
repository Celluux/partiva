# Implementação Partiva

Projeto local: `C:\Users\marce\OneDrive\Documentos\PARTIVA`.
Branch: `codex/partiva-operacional`.
Destino externo autorizado: `PARTIVAA` (`twtldgdceidyurinrvsy`).

## Implementado e verificado localmente

| Área | Entrega |
|---|---|
| Persistência | Repositório Supabase compartilhado, paginação das consultas, sessões Auth e atualização por Realtime com atualização periódica de apoio |
| Segurança | RLS de leitura por vínculo ativo, gravações por funções validadas, perfis, restrição à empresa ativa, backend administrativo e arquivos privados |
| Identidade | Sequência PostgreSQL sem ciclo, reserva permanente, unicidade, proteção contra alterações e exclusão física |
| Cadastro | Modal único, três passos, campos completos solicitados, seleções pesquisáveis, condicionais, rascunhos, alerta Detran e recuperação após falha |
| Fotos | Upload múltiplo com progresso e prévia, duas posições iniciais, capa, ordem, remoção controlada, originais e versões editadas, recuperação de vínculo de upload |
| Kanban | Colunas com nome, cor, regra, ordem e exclusão segura; movimento por arraste ou seleção, com retorno e validação no servidor |
| Cards e tabela | Identificador, nome, veículo, preço, imagem, pendências; tabela com pesquisa, filtros, ordenação e configuração individual |
| Anúncios | Título sugerido editável, taxa configurável, líquido em centavos, validação de prontidão; nenhuma publicação simulada |
| Vendas | Reserva, venda presencial, registro online confirmado manualmente, cancelamentos, disponibilidade e bloqueio de duplicidade |
| Histórico | Autor, data e ações de peças, fotografias, movimentações, vendas, empresa e acessos |
| Minha Empresa | Cadastro, endereço, logo, funcionários, perfis, taxa, preferências e estado das integrações; edição sensível restrita a administrador |
| Preservação | Migração aditiva, códigos e campos legados preservados, arquivos sem sobrescrita, arquivamento/restauração e importação local conferida/idempotente |
| Interface | Identidade aprovada preservada; menus e ações reais, estados de erro/carregamento, diálogo nativo, teclado e responsividade |

## Verificações concluídas

- 46 testes Vitest: regras, SQL PostgreSQL/RLS, fotos, segurança, preservação e Worker.
- 10 testes de navegador: criação/edição, persistência, Detran, campos condicionais, fotos/versões/capa, exclusão de coluna, empresa, reservas/vendas, consulta, mobile, recuperação após falha, tabela/filtros e duas sessões de funcionários.
- Build Vite concluído.
- TypeScript e análise de sintaxe concluídos.
- Empacotamento do Worker em modo `--dry-run` concluído, sem publicação.
- Compilação das funções do Pages concluída; Worker local respondeu com as integrações efetivamente pendentes.

As fixtures locais de Auth e transporte de arquivos não substituem a homologação real do Supabase Auth, Storage e Realtime. Os números acima correspondem à suíte local, não a uma aprovação do ambiente remoto.

## Validação real do PARTIVAA — 17/10/2026

Conexão autenticada com o projeto oficial `twtldgdceidyurinrvsy`, usando credencial protegida pelo Windows. Chave pública configurada em `.env.local`; chave administrativa usada somente em memória no teste e no ambiente do Worker local.

Quatro migrações aplicadas e registradas: fundação, operação, otimização das políticas RLS e resposta de conflitos de negócio. Simulação final confirmou banco atualizado, sem migrações pendentes. Snapshot dos dados e políticas anteriores preservado em `artifacts/private/partivaa-before-migration.json`, fora do Git.

A conta autorizada pelo usuário está vinculada como administradora da única empresa ativa. Cadastro público desabilitado e retornos de autenticação configurados para o aplicativo local. Todas as tabelas públicas têm RLS e os buckets de fotos e logotipo são privados.

### Testes efetivamente executados no serviço real

- Dez verificações integradas aprovadas: Auth e isolamento, rascunhos simultâneos, identificadores, edição/conflitos, Kanban configurável e transferência segura, Realtime entre sessões, Storage privado com originais/versões/capa/ordem, empresa/preferências/perfis, bloqueio de anúncios incompletos e reservas/vendas/cancelamentos/histórico.
- Cinco funções verificadas por HTTP com conflitos de versão retornando 409 imediatamente. Corrigido o uso de SQLSTATE 40001 para conflitos de negócio, que provocava repetição pelo PostgREST; agora usam PT409.
- Navegador real conectado diretamente ao Supabase: login, edição, tabela, recarga e confirmação dos dados gravados no PostgreSQL. Sem interceptação de rede ou transporte simulado nessa verificação.
- Relatórios privados: `artifacts/private/partivaa-live-validation.json`, `partivaa-live-browser.json` e `dev-inspection.json`.
- Ao final: quatro contas técnicas bloqueadas e sem vínculo ativo; três peças técnicas arquivadas; três fotografias e histórico preservados. Nenhuma peça técnica permanece no estoque ativo.

### Execução e limites atuais

Frontend local em http://127.0.0.1:5173 e Worker Wrangler em http://127.0.0.1:8787. Para iniciar novamente: `pnpm dev` e, em outro terminal, `pnpm worker:connected`. O segundo usa a credencial DPAPI para carregar as chaves somente no processo do Wrangler.

O backend de convites está configurado; envio e entrega de e-mails ainda não foram testados, pois nenhum convite foi enviado. Hospedagem e segredos de produção no Cloudflare dependem da publicação autorizada. A API oficial do Mercado Livre permanece desconectada; vendas online são registradas mediante confirmação manual, sem publicar anúncios.

A auditoria final não aponta mais os avisos de desempenho RLS corrigidos. Resta o aviso de proteção contra senhas vazadas: o Supabase recusou a ativação com HTTP 402 porque exige plano Pro ou superior. Nenhuma contratação foi realizada.

As peças, configurações, funcionários, histórico e fotografias usam Supabase real. O navegador mantém a sessão de autenticação e recuperação temporária de preenchimento; isso não substitui a persistência do banco.

Nenhum reset, exclusão física de dados, alteração do sistema antigo ou publicação em produção foi executado.

## Migração do sistema antigo — 17/10/2026

Migração real concluída no PARTIVAA: 200 peças salvas e um rascunho adicional, totalizando 201 registros. Foram vinculadas 48 fotografias e preservados oito rascunhos, taxas individuais, compatibilidades em intervalo e histórico. Três rascunhos ambíguos permanecem em Minha Empresa para comparação; não geraram peças duplicadas. Os 57 anúncios antigos usam estado histórico separado da API, e a peça vendida permanece indisponível.

Backup recuperável anterior à escrita e ensaio de restauração isolado aprovados. Reexecução real reutilizou 201 peças, oito rascunhos e 48 fotos, sem duplicação. A auditoria comparou todos os campos e hashes e confirmou a preservação dos 63 arquivos da origem e dos três registros preexistentes. Regressão: 64 testes automatizados, dez testes de navegador e build aprovados.

Dados reais, manifesto, backup e relatório detalhado estão em `artifacts/private/desmonte-migration`, fora do Git. Os scripts genéricos são `backup-partivaa.mjs`, `import-desmonte.mjs` e `verify-desmonte-migration.mjs`. O importador exige `--apply`; a verificação é somente leitura por padrão, com uma opção explícita para completar metadados de arquivo.
