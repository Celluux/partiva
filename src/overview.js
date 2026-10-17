import { $, h, date, EVENT_LABELS } from "./ui.js";
import { money, vehicle } from "./domain.js";
import { overviewData } from "./overview-data.js";
import { icon } from "./icons.js";
import mascotUrl from "../assets/partiva-mascot.png";

export const emptyFilters = () => ({
  query: "",
  category: "",
  column: "",
  sale: "",
  listing: "",
  pending: false,
  archived: false,
  phase: "",
  scope: "",
});
export function overviewRouteFilters(hash) {
  const params = new URLSearchParams(hash.split("?")[1] || "");
  const filters = emptyFilters();
  for (const key of [
    "query",
    "category",
    "column",
    "sale",
    "listing",
    "phase",
    "scope",
  ])
    filters[key] = params.get(key) || "";
  filters.pending = params.get("pending") === "true";
  filters.archived = params.get("archived") === "true";
  return filters;
}
const metric = (key, label, value, detail, ico) =>
  `<button type="button" class="overview-metric" data-overview-target="${key}" data-metric="${key}"><span class="metric-icon">${icon(ico)}</span><small>${label}</small><strong data-metric-value>${value}</strong><span>${detail}</span></button>`;
export const overviewMethods = {
  showOverviewTarget(target) {
    const table = (filters = {}) => {
      this.filters = emptyFilters();
      this.routeFiltered = false;
      return this.navigate(
        "table",
        false,
        new URLSearchParams(
          Object.entries(filters).map(([key, value]) => [key, String(value)]),
        ).toString(),
      );
    };
    if (target.startsWith("phase:"))
      return table({ scope: "operational", phase: target.slice(6) });
    if (target === "total" || target === "catalog") return table();
    if (target === "active") return table({ scope: "operational" });
    if (target === "photos")
      return table({ scope: "operational", phase: "photos_pending" });
    if (target === "pending")
      return table({ scope: "operational", pending: true });
    if (target === "ready")
      return table({ scope: "operational", listing: "ready" });
    if (target === "held") return table({ sale: "on_hold" });
    if (target === "historical") {
      this.commercialFilters ||= {};
      this.commercialFilters.listings = {
        query: "",
        status: "legacy_published",
        order: "desc",
      };
      return this.navigate("listings");
    }
    if (target === "reserved" || target === "sold") {
      if (!this.access.sales) return table({ sale: target });
      const view = target === "reserved" ? "reservations" : "sales";
      this.commercialFilters ||= {};
      this.commercialFilters[view] = {
        query: "",
        status: target,
        order: "desc",
      };
      return this.navigate(view);
    }
    if (target === "prepare") {
      this.commercialFilters ||= {};
      this.commercialFilters.listings = {
        query: "",
        status: "draft",
        order: "desc",
      };
      return this.navigate("listings");
    }
    if (target === "activity") return this.navigate("activity");
    if (target === "board") return this.navigate("board");
    if (target === "new" && this.access.parts) return this.openPiece();
  },
  renderOverview() {
    const summary = overviewData(this.data);
    const catalogIds = new Set(
      this.data.pieces.filter((p) => !p.archived_at).map((p) => p.id),
    );
    const recent = [...this.data.events]
      .filter((e) => catalogIds.has(e.part_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 4);
    const current = this.data.pieces
      .filter((p) => !p.archived_at)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
    const needsPhotos = summary.priorities.filter(
      (x) =>
        x.selectedPhotoCount <
        (this.data.company.preferences?.minimum_photos ?? 2),
    ).length;
    const priority = (target, count, title, text) =>
      `<button class="priority-row" data-overview-target="${target}"><span class="priority-count">${count}</span><span><strong>${title}</strong><small>${text}</small></span>${icon("arrow")}</button>`;
    $("#workspace-content").innerHTML =
      `<div class="overview-page"><header class="overview-header"><div><div class="eyebrow">PARTIVA · OPERAÇÃO INTERNA</div><h1>Visão geral</h1><p>Da entrada da peça ao anúncio pronto. Seu trabalho, em ordem.</p></div><div class="overview-actions"><button class="secondary-button" data-overview-target="catalog">Consultar catálogo ${icon("arrow")}</button>${this.access.parts ? `<button class="primary-button" data-overview-target="new">${icon("plus")} Cadastrar peça</button>` : ""}</div></header>
    <section class="overview-metrics" aria-label="Indicadores do fluxo operacional">${metric("total", "Peças no catálogo", summary.total, "Registros preservados", "table")}${metric("active", "Em preparação", summary.active, "No fluxo operacional ativo", "board")}${metric("photos", "Fotografias pendentes", summary.photoPending, "Na fila de fotografias", "photos")}${metric("ready", "Anúncios preparados", summary.ready, "Prontos para revisão final", "check")}</section>
    <section class="overview-panel workflow-panel" aria-labelledby="workflow-title"><div class="panel-heading"><div><div class="eyebrow">FILA DE PREPARAÇÃO</div><h2 id="workflow-title">O próximo passo de cada peça</h2><p>${summary.active} peças no fluxo ativo. Cada etapa abre os registros correspondentes.</p></div><button class="text-button" data-overview-target="board">Abrir quadro ${icon("arrow")}</button></div><ol class="workflow-steps">${summary.stages.map((step, i) => `<li><button class="workflow-step" data-overview-target="phase:${step.key}" data-stage="${step.key}" aria-label="${h(step.label)}: ${step.count} peças"><span class="step-top"><span class="step-index">0${i + 1}</span><strong class="step-count" data-stage-count>${step.count}</strong></span><strong class="step-title">${h(step.label)}</strong><span class="step-meta">${step.pendingCount ? `<span class="step-pending">${step.pendingCount} com pendências</span>` : "Sem pendências registradas"}</span><span class="step-track" style="--progress:${summary.active ? (step.count / summary.active) * 100 : 0}%" aria-hidden="true"></span></button></li>`).join("")}</ol></section>
    <div class="overview-grid"><section class="overview-panel" aria-labelledby="priorities-title"><div class="panel-heading"><div><div class="eyebrow">FOCO DA EQUIPE</div><h2 id="priorities-title">Pendências e prioridades</h2></div><button class="text-button" data-overview-target="pending">Ver peças ${icon("arrow")}</button></div><div class="priority-list">${priority("pending", summary.priorities.length, "Completar informações para o anúncio", "Revise os campos e as fotografias essenciais.")}${priority("photos", summary.photoPending, "Avançar a fila de fotografias", `${needsPhotos} peças do fluxo ainda precisam completar a seleção de imagens.`)}${priority("ready", summary.ready, "Revisar anúncios preparados", "Título, preço e imagens reunidos para conferência.")}</div><div class="overview-hero"><div><strong>Um cadastro por vez. Tudo conectado.</strong><p>Cadastre com o que já sabe e complete a peça ao longo do trabalho.</p><button class="text-button" data-overview-target="prepare">Preparar anúncios ${icon("arrow")}</button></div><img class="overview-mascot" src="${mascotUrl}" alt="Mascote mecânico do Partiva"/></div></section>
    <section class="overview-panel" aria-labelledby="recent-title"><div class="panel-heading"><div><div class="eyebrow">HISTÓRICO REAL</div><h2 id="recent-title">Últimas atividades</h2></div><button class="text-button" data-overview-target="activity">Ver todas ${icon("arrow")}</button></div><div class="overview-recent">${
      recent
        .map((e) => {
          const p = this.data.pieces.find((p) => p.id === e.part_id);
          return `<button class="recent-event" data-overview-piece="${h(e.part_id)}"><span class="recent-event-icon">${icon(e.event_type.startsWith("photo") ? "photos" : "activity")}</span><span><strong>${h(EVENT_LABELS[e.event_type] || e.event_type)}</strong><small>#${h(p?.internal_number || "—")} ${h(p?.part_name || "Peça")} · ${h(e.actor_name || "Sistema")}</small><time datetime="${h(e.created_at)}">${h(date(e.created_at))}</time></span></button>`;
        })
        .join("") ||
      '<p class="overview-empty">As ações da equipe aparecerão aqui.</p>'
    }</div></section></div>
    <section class="overview-panel" aria-labelledby="commercial-title"><div class="panel-heading"><div><div class="eyebrow">SITUAÇÃO COMERCIAL</div><h2 id="commercial-title">Histórico e disponibilidade</h2><p>Esses estados são acompanhados separadamente da preparação.</p></div><span class="integration-badge">Mercado Livre desconectado</span></div><div class="commercial-strip">${[
      [
        "historical",
        summary.historical,
        "Anúncios históricos",
        "Importados; publicação não verificada",
      ],
      [
        "reserved",
        summary.reserved,
        "Reservas ativas",
        "Peças com disponibilidade protegida",
      ],
      [
        "sold",
        summary.sold,
        "Peças vendidas",
        "Permanecem fora do fluxo de preparação",
      ],
      [
        "held",
        summary.held,
        "Peças em repouso",
        "Pausadas, com informações preservadas",
      ],
    ]
      .map(
        ([target, count, label, detail]) =>
          `<button class="commercial-chip" data-overview-target="${target}" ${target !== "held" ? `data-metric="${target}"` : ""}><strong ${target !== "held" ? "data-metric-value" : ""}>${count}</strong><span>${label}<small>${detail}</small></span>${icon("arrow")}</button>`,
      )
      .join("")}</div></section>
    <section class="overview-panel overview-catalog" aria-labelledby="catalog-title"><div class="panel-heading"><div><div class="eyebrow">CATÁLOGO CONECTADO</div><h2 id="catalog-title">Peças atualizadas recentemente</h2></div><button class="text-button" data-overview-target="catalog">Ver catálogo ${icon("arrow")}</button></div><div class="table-scroll"><table class="parts-table"><caption class="sr-only">Cinco peças atualizadas mais recentemente</caption><thead><tr><th>Peça / veículo</th><th>Identificador</th><th>Etapa</th><th>Preço informado</th><th>Acesso</th></tr></thead><tbody>${
      current
        .map((p) => {
          const photo =
            this.photos(p.id).find((x) => x.is_cover) || this.photos(p.id)[0];
          return `<tr><td><div class="overview-part">${photo ? `<img class="overview-photo" data-path="${h(photo.storage_path)}" alt="${h(p.part_name)}" loading="lazy"/>` : `<span class="overview-photo photo-absent">${icon("photos")}</span>`}<span><strong>${h(p.part_name || "Peça em rascunho")}</strong><small>${h(vehicle(p))}</small></span></div></td><td>#${h(p.internal_number)}</td><td>${h(p.legacy_hold ? "Em repouso" : p.sale_status === "sold" ? "Vendida" : p.listing_status === "legacy_published" ? "Anúncio histórico" : this.tableValue(p, "column_id"))}</td><td>${money(p.price_cents)}</td><td><button class="row-open" data-overview-piece="${p.id}">Abrir #${h(p.internal_number)}</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="5">Nenhuma peça cadastrada.</td></tr>'
    }</tbody></table></div></section></div>`;
    document
      .querySelectorAll("[data-overview-target]")
      .forEach(
        (b) =>
          (b.onclick = () => this.showOverviewTarget(b.dataset.overviewTarget)),
      );
    document
      .querySelectorAll("[data-overview-piece]")
      .forEach(
        (b) => (b.onclick = () => this.openPiece(b.dataset.overviewPiece)),
      );
    this.hydrateImages($("#workspace-content"));
  },
};
