import { escapeHtml } from "./domain.js";
export const h = escapeHtml;
export const $ = (s) => document.querySelector(s);
export const date = (v) => new Date(v).toLocaleString("pt-BR");
export const options = (items, value = "", empty = "Selecione") =>
  `<option value="">${h(empty)}</option>${items
    .map((item) => {
      const [key, label] = Array.isArray(item) ? item : [item, item];
      return `<option value="${h(key)}" ${String(value) === String(key) ? "selected" : ""}>${h(label)}</option>`;
    })
    .join("")}`;
export const field = (key, label, value = "", extra = "") =>
  `<label class="field"><span>${h(label)}</span><input name="${key}" value="${h(value ?? "")}" ${extra}/></label>`;
export const EVENT_LABELS = {
  company_updated: "Dados e configurações da empresa alterados",
  employee_updated: "Permissões do funcionário atualizadas",
  employee_invited: "Funcionário convidado",
  column_create: "Coluna criada",
  column_update: "Coluna alterada",
  column_delete: "Coluna excluída com transferência de peças",
  column_reorder: "Colunas reordenadas",
  created: "Peça cadastrada",
  edited: "Cadastro editado",
  moved: "Etapa alterada",
  archive: "Peça excluída da operação",
  restore: "Peça restaurada",
  ready: "Anúncio preparado",
  photo_register: "Fotografia adicionada",
  photo_archive: "Fotografia removida da galeria",
  photo_cover: "Capa alterada",
  photo_reorder: "Fotografias reordenadas",
  photo_select: "Seleção para anúncio alterada",
  reserve: "Reserva registrada",
  release: "Reserva cancelada",
  sell_local: "Venda presencial registrada",
  sell_online: "Venda online confirmada manualmente",
  cancel: "Venda cancelada",
};
