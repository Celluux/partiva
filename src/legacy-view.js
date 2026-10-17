import { h, date } from "./ui.js";
const labels = {
  pending: "Cadastro",
  incomplete: "Aguardando informações e fotos",
  "editing-photos": "Editar fotos",
  ready: "Pronta para anunciar",
  published: "Anunciada no sistema antigo",
  sold: "Vendida no sistema antigo",
  standby: "Em repouso",
  archived: "Arquivada",
};
export const historicalStage = (value) =>
  labels[value] || value || "Não informado";
export function legacyDetails(p) {
  if (!p.legacy_source?.startsWith("desmonte:")) return "";
  return `<section class="notice"><strong>Cadastro preservado do sistema antigo</strong><p>Código antigo: ${h(p.complementary_code || "Não informado")} · Etapa histórica: ${h(historicalStage(p.legacy_origin_stage))}.</p>${p.listing_status === "legacy_published" ? "<p>Anúncio informado no sistema antigo. Sem confirmação ou sincronização com a API do Mercado Livre.</p>" : ""}${p.sale_status === "sold" ? "<p>Peça vendida e indisponível. O histórico não comprova o valor recebido nem a data efetiva da venda.</p>" : ""}${p.legacy_hold ? "<p>Disponibilidade em repouso, preservada do sistema antigo.</p>" : ""}${p.legacy_is_draft ? "<p>Rascunho antigo com conteúdo, preservado para completar o cadastro.</p>" : ""}${p.legacy_issues?.length ? `<details><summary>${p.legacy_issues.length} coincidência(s) ou cuidado(s) para revisão</summary><ul>${p.legacy_issues.map((issue) => `<li>${h(issue)}</li>`).join("")}</ul></details>` : ""}</section>`;
}
function originalDetails(piece) {
  const fields = {
    code: "Código antigo",
    detran: "Detran original",
    type: "Peça",
    brand: "Marca",
    model: "Modelo",
    year: "Ano / compatibilidade",
    position: "Posição",
    side: "Lado",
    color: "Cor",
    title: "Título",
    price: "Preço original (R$)",
    feePercent: "Taxa estimada (%)",
    fixedFee: "Taxa fixa (R$)",
    otherCost: "Outros custos (R$)",
    description: "Descrição",
    observations: "Observações",
    mlUrl: "Link de anúncio informado",
  };
  return `<dl>${Object.entries(fields)
    .filter(([k]) => piece[k] !== "" && piece[k] != null)
    .map(
      ([k, label]) =>
        `<dt><strong>${h(label)}</strong></dt><dd class="wrap">${h(piece[k])}</dd>`,
    )
    .join("")}</dl>`;
}
export function legacyHistory(p, drafts = []) {
  if (!p.legacy_source?.startsWith("desmonte:")) return "";
  const old = p.legacy_payload?.piece || {};
  return `<section class="settings-card"><h3>Histórico preservado do sistema antigo</h3><p class="muted">Registros históricos da origem; não são ações realizadas pela integração ou pelo funcionário importador.</p>${old.createdAt ? `<p>Cadastrada na origem: ${h(date(old.createdAt))}</p>` : ""}${(old.history || []).map((e) => `<p>${h(e.action || "Registro histórico")} · ${h(e.at ? date(e.at) : "Data não informada")}</p>`).join("")}${drafts
    .filter((d) => d.part_id === p.id)
    .map(
      (d) =>
        `<details><summary>Rascunho preservado · ${h(d.original_payload.savedAt ? date(d.original_payload.savedAt) : "Sem data")}</summary>${originalDetails(d.original_payload.piece)}</details>`,
    )
    .join(
      "",
    )}<details><summary>Consultar informações originais</summary>${originalDetails(old)}</details></section>`;
}
export function legacyDraftList(drafts, pieces) {
  if (!drafts.length) return "";
  const resolution = {
    same_id: "Vinculado ao cadastro existente",
    new_piece: "Preservado como peça adicional",
    pending: "Correspondência pendente de revisão",
    empty: "Rascunho vazio preservado",
  };
  return `<section class="settings-card"><h2>Rascunhos do sistema antigo</h2><p class="muted">Nenhum conteúdo foi descartado. Coincidências sem prova suficiente permanecem pendentes, sem criar outra peça nem substituir o cadastro salvo.</p>${drafts
    .map((d) => {
      const p = d.original_payload?.piece || {};
      const candidates = pieces.filter((p) =>
        (d.candidate_sources || []).includes(p.legacy_source),
      );
      return `<details><summary>${h(p.title || p.type || "Rascunho sem preenchimento")} — ${h(resolution[d.resolution])}</summary>${originalDetails(p)}${d.part_id ? `<button class="secondary-button" type="button" data-open-legacy-piece="${h(d.part_id)}">Consultar peça vinculada</button>` : ""}${candidates.length ? `<p>Cadastros para comparar:</p>${candidates.map((p) => `<button class="secondary-button" type="button" data-open-legacy-piece="${p.id}">#${h(p.internal_number)} · ${h(p.complementary_code || p.part_name)}</button>`).join("")}` : ""}</details>`;
    })
    .join("")}</section>`;
}
