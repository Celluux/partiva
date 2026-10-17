# Navegação do Partiva — 17/10/2026

Implementação local, conectada exclusivamente ao Supabase PARTIVAA (`twtldgdceidyurinrvsy`). Nenhuma publicação em produção foi executada.

## Páginas

| Página | Funcionamento |
| --- | --- |
| Quadro operacional | Kanban com registros reais, edição compartilhada, arrastar cards, seleção de destino e configuração segura das colunas. |
| Peças em tabela | Mesmas peças do Kanban; busca, filtros combinados, ordenação, colunas escolhidas pelo usuário e modal com fotografias. |
| Anúncios | Consulta própria com busca, situação, ordem, miniaturas, títulos, valores, pendências e edição da peça vinculada. Os 57 anúncios históricos mantêm indicação de API não verificada. |
| Vendas | Consulta do registro de vendas, valores efetivos e cancelamentos; venda presencial com validação transacional. A venda histórica permanece vendida, sem inventar valor ou data. |
| Reservas | Consulta, criação, cliente/responsável pela retirada, funcionário autor, edição, confirmação em venda e cancelamento. O banco protege a reserva contra alteração ou conclusão por outro vendedor sem permissão administrativa. |
| Atividade | Eventos reais de peças e eventos administrativos autorizados; filtros por texto, ação, usuário e intervalo de datas; acesso à peça ou empresa. |
| Minha Empresa | Cadastro, logo privado, contatos, endereço, funcionários/permissões, taxas, preferências, estado das integrações e rascunhos legados preservados. Alterações administrativas continuam protegidas pelo banco. |

Rotas `#/board`, `#/table`, `#/listings`, `#/sales`, `#/reservations`, `#/activity` e `#/company`. A recarga e os botões de voltar/avançar preservam a página. Os filtros comerciais são independentes dos filtros do estoque. O perfil de consulta recebe explicação de acesso restrito em Vendas/Reservas, conforme a política existente do banco, e pode consultar a disponibilidade na tabela.

## Verificações concluídas

- 66 testes automatizados de domínio, PostgreSQL, permissões, identificadores, migrações, preservação, fotografias, reservas, vendas e segurança da CLI.
- 12 testes de navegador com banco PostgreSQL isolado: sete rotas, recarga/retorno, cadastro/edição, campos condicionais, fotografias e versões, movimentação/transferência segura de colunas, empresa, consulta, celular/teclado, recuperação após falha, filtros e sincronização entre sessões.
- Navegador com Supabase real, sem interceptação: administrador e consulta; sete páginas e recarga; tabela com 201 peças; filtro dos 57 anúncios históricos; venda importada; restrições administrativas e comerciais.
- Reserva, edição, venda presencial, rejeição de venda duplicada e cancelamento no Supabase real usando somente uma peça técnica anteriormente autorizada. A peça foi arquivada novamente; contas técnicas desativadas, sessões encerradas e contas bloqueadas.
- Comparação antes/depois: 201 peças migradas e vínculos das 48 fotografias preservados.
- Verificação de código, TypeScript e build aprovados.

## Banco e proteção dos dados

A migração aditiva `20261017165453_reservation_management.sql` foi aplicada depois do backup completo. Acrescenta metadados de reserva e a operação protegida de edição, sem substituir históricos, arquivos ou valores de venda.

Backup privado: `artifacts/private/navigation-backup-20261017/` — 204 peças no total, incluindo três registros técnicos arquivados; 51 arquivos, incluindo três fotografias técnicas. Contém dados, identificadores permanentes, arquivos, hashes, migrações e instruções de recuperação para ambiente isolado. Nunca executar recuperação sobre o projeto oficial.

Evidência da validação real: `artifacts/private/navigation-live-validation.json`. Os artefatos privados estão fora do versionamento. Artefatos temporários do Playwright ficam na pasta temporária do Windows para evitar bloqueios de arquivos pelo OneDrive.

## Dependências externas

- A API do Mercado Livre permanece desconectada; preparar anúncio não publica. Nenhuma sincronização é simulada.
- O envio de convites depende do backend seguro e da entrega de e-mail do Supabase. Não foram enviados convites a pessoas reais nesta revisão.
- Os três rascunhos legados ambíguos permanecem preservados para decisão humana, sem união automática de peças.
- Esta validação cobre os fluxos descritos; não equivale a uma garantia de ausência de defeitos ou a uma publicação em produção.
