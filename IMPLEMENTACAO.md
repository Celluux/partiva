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

## Validação externa

Em 17/10/2026, todas as configurações foram atualizadas para o projeto oficial `PARTIVAA` (`twtldgdceidyurinrvsy`), incluindo frontend, Worker, CSP, scripts e testes. A configuração rejeita outros projetos. As duas migrações locais permanecem preparadas, sem execução remota.

As tentativas de listar os projetos e consultar o banco nesta sessão retornaram `Access token not provided`, mesmo após o login informado no PowerShell. O histórico e o esquema remoto ainda não puderam ser conferidos. Nenhuma migração remota foi aplicada. A tentativa de inspeção está registrada no arquivo local ignorado pelo Git `artifacts/private/dev-inspection.json`.

Foi preparado um assistente de autenticação com entrada oculta e proteção DPAPI fora do repositório. A verificação externa prossegue após sua configuração pelo usuário, sem compartilhar o token na conversa.

Ainda dependem da conferência do ambiente externo: histórico real de migrações, aplicação compatível da migração aditiva, primeiro administrador autorizado, configuração das chaves, regras efetivas do Storage, Realtime e envio de convites pelo Auth. A API oficial do Mercado Livre permanece deliberadamente desconectada.

Nenhum reset, exclusão física de dados, alteração do sistema antigo ou publicação em produção faz parte desta execução.
