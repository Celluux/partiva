import { $, h, date, options, EVENT_LABELS } from "./ui.js";
import { money, vehicle, LISTING_LABELS } from "./domain.js";

export const VIEWS = [
  "overview",
  "board",
  "table",
  "listings",
  "sales",
  "reservations",
  "activity",
  "company",
];
export function routeView(hash) {
  const view = hash.replace(/^#\//, "").split(/[?&]/)[0];
  return VIEWS.includes(view) ? view : "overview";
}
const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const navigationMethods = {
  renderCommercial() {
    this.commercialFilters ||= {};
    const f = (this.commercialFilters[this.view] ||= {
      query: "",
      status: "",
      order: "desc",
    });
    const listings = this.view === "listings",
      reservations = this.view === "reservations";
    if (!listings && !this.access.sales) {
      $("#workspace-content").innerHTML =
        `<section class="workspace-panel"><h1>${reservations ? "Reservas" : "Vendas"}</h1><p class="notice">Seu perfil permite consultar a disponibilidade das peças. Os registros comerciais detalhados são restritos à equipe de vendas e aos administradores.</p><button id="commercial-pieces" class="secondary-button">Consultar peças em tabela</button></section>`;
      $("#commercial-pieces").onclick = () => this.navigate("table");
      return;
    }
    const statuses = listings
      ? Object.entries(LISTING_LABELS)
      : reservations
        ? [
            ["reserved", "Ativas"],
            ["cancelled", "Encerradas / canceladas"],
          ]
        : [
            ["sold", "Confirmadas"],
            ["cancelled", "Canceladas"],
          ];
    const pieces = new Map(this.data.pieces.map((p) => [p.id, p]));
    let rows = listings
      ? this.data.pieces
          .filter((p) => !p.archived_at)
          .map((p) => ({ p, status: p.listing_status, at: p.updated_at }))
      : (this.data.sales || [])
          .filter((s) =>
            reservations
              ? s.status === "reserved" ||
                (s.status === "cancelled" && s.reservation)
              : s.status === "sold" ||
                (s.status === "cancelled" && !s.reservation),
          )
          .map((s) => ({
            p: pieces.get(s.part_id),
            s,
            status: s.status,
            at: s.created_at,
          }))
          .filter((r) => r.p && !r.p.archived_at);
    rows = rows
      .filter(
        (r) =>
          (!f.status || r.status === f.status) &&
          normalize(
            [
              r.p.internal_number,
              r.p.detran_reference,
              r.p.part_name,
              r.p.title,
              vehicle(r.p),
              r.s?.note,
              r.s?.reservation?.customer,
            ].join(" "),
          ).includes(normalize(f.query)),
      )
      .sort((a, b) => (f.order === "asc" ? 1 : -1) * a.at.localeCompare(b.at));
    const title = listings ? "Anúncios" : reservations ? "Reservas" : "Vendas";
    $("#workspace-content").innerHTML =
      `<section class="workspace-panel"><div class="workspace-heading"><h1>${title}</h1><p>${rows.length} registro(s)</p></div><p class="notice">${listings ? "Mercado Livre desconectado. Os anúncios históricos preservam o estado antigo; preparar um anúncio não publica uma oferta." : reservations ? "Reservas bloqueiam a disponibilidade. Confirme a venda ou cancele a reserva para liberar a peça." : "Vendas efetivamente registradas. Valores históricos não informados permanecem sem valor."}</p>${!listings && this.access.sales ? `<button id="commercial-new" class="primary-button" type="button">${reservations ? "Criar reserva" : "Registrar venda presencial"}</button>` : ""}<div class="filter-panel"><label class="field"><span>Buscar ${title.toLowerCase()}</span><input id="commercial-query" value="${h(f.query)}" type="search" placeholder="Identificador, Detran, peça ou veículo"/></label><label class="field"><span>Situação</span><select id="commercial-status">${options(statuses, f.status, "Todas")}</select></label><label class="field"><span>Ordem</span><select id="commercial-order">${options(
        [
          ["desc", "Mais recentes"],
          ["asc", "Mais antigos"],
        ],
        f.order,
      )}</select></label></div><div class="table-scroll"><table class="parts-table"><thead><tr><th>Peça</th><th>Fotografias</th><th>${listings ? "Título / situação" : "Situação / responsável"}</th><th>Valor</th><th>${listings ? "Pendências" : "Data / observações"}</th><th>Ações</th></tr></thead><tbody>${
        rows
          .map(({ p, s, status, at }) => {
            const photo =
              this.photos(p.id).find((x) => x.is_cover) || this.photos(p.id)[0];
            return `<tr><td class="wrap">#${h(p.internal_number)} — ${h(p.part_name || "Rascunho")}<br>${h(vehicle(p))}<br>Detran: ${h(p.detran_reference || "—")}</td><td>${photo ? `<img data-path="${h(photo.storage_path)}" alt="${h(p.part_name)}" width="72" height="54" loading="lazy" style="object-fit:cover"/>` : "Sem imagens"}<br>${this.photos(p.id).length} foto(s)</td><td class="wrap">${listings ? `${h(p.title || "Título pendente")}<br>${h(LISTING_LABELS[status])}` : `${h({ sold: "Vendida", reserved: "Reservada", cancelled: "Encerrada / cancelada" }[status])}<br>${h(s.reservation?.customer || "")}<br>${h(s.channel === "legacy" ? "Sistema antigo" : this.data.members.find((m) => m.user_id === s.created_by)?.display_name || "Funcionário")}`}</td><td>${money(listings ? p.price_cents : s.amount_cents)}</td><td class="wrap">${listings ? h(this.missing(p).join(", ") || "Pronto para preparação") : `${s.channel === "legacy" ? "Data histórica não informada" : h(date(at))}<br>${h(s.note || "—")}`}</td><td><button class="row-open" data-commercial-open="${p.id}">Consultar / editar #${h(p.internal_number)}</button>${reservations && status === "reserved" && this.access.sales ? `<button data-reservation-edit="${s.id}" class="secondary-button">Editar reserva</button><button data-commercial-command="sell_local" data-id="${p.id}" class="secondary-button">Confirmar venda</button><button data-commercial-command="release" data-id="${p.id}" class="secondary-button">Cancelar reserva</button>` : ""}</td></tr>`;
          })
          .join("") ||
        '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>'
      }</tbody></table></div></section>`;
    $("#commercial-query").oninput = (e) => {
      f.query = e.target.value;
      clearTimeout(this.commercialSearch);
      this.commercialSearch = setTimeout(() => {
        const pos = $("#commercial-query").selectionStart;
        this.renderCommercial();
        $("#commercial-query").focus();
        $("#commercial-query").setSelectionRange(pos, pos);
      }, 200);
    };
    for (const key of ["status", "order"])
      $(`#commercial-${key}`).onchange = (e) => {
        f[key] = e.target.value;
        this.renderCommercial();
      };
    document
      .querySelectorAll("[data-commercial-open]")
      .forEach(
        (b) => (b.onclick = () => this.openPiece(b.dataset.commercialOpen)),
      );
    document.querySelectorAll("[data-commercial-command]").forEach(
      (b) =>
        (b.onclick = () => {
          this.openPiece(b.dataset.id);
          this.saleDialog(b.dataset.commercialCommand);
        }),
    );
    document
      .querySelectorAll("[data-reservation-edit]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.editReservation(
              this.data.sales.find((s) => s.id === b.dataset.reservationEdit),
            )),
      );
    $("#commercial-new")?.addEventListener("click", () =>
      this.chooseCommercialPiece(reservations),
    );
    this.hydrateImages();
  },
  chooseCommercialPiece(reserve) {
    const available = this.data.pieces.filter(
      (p) => !p.archived_at && !p.legacy_hold && p.sale_status === "available",
    );
    this.action(
      reserve ? "Criar reserva" : "Registrar venda presencial",
      `<label class="field"><span>Peça disponível</span><select name="piece" required>${options(available.map((p) => [p.id, `#${p.internal_number} ${p.part_name || "Rascunho"} — ${vehicle(p)}`]))}</select></label>`,
      async (form) => {
        const id = form.get("piece");
        // Open after the selection dialog closes, so it cannot close the next form.
        setTimeout(() => {
          this.openPiece(id);
          this.saleDialog(reserve ? "reserve" : "sell_local");
        }, 0);
      },
      "Continuar",
    );
  },
  editReservation(s) {
    const p = this.data.pieces.find((p) => p.id === s.part_id);
    this.action(
      "Editar reserva",
      `<label class="field"><span>Cliente / responsável pela retirada</span><input name="customer" maxlength="200" value="${h(s.reservation?.customer || "")}"/></label><label class="field"><span>Observações</span><textarea name="note" maxlength="1000">${h(s.note || "")}</textarea></label>`,
      async (form) => {
        await this.repo.rpc("sale_action", {
          pid: p.id,
          command: "edit_reservation",
          payload: {
            request_id: crypto.randomUUID(),
            version: p.version,
            customer: form.get("customer"),
            note: form.get("note"),
          },
        });
        await this.refresh();
        this.notify("Reserva atualizada");
      },
    );
  },
  renderActivity() {
    this.activityFilter ||= { query: "", type: "", user: "", from: "", to: "" };
    const f = this.activityFilter;
    const all = [...this.data.events, ...(this.data.companyEvents || [])].sort(
      (a, b) => b.created_at.localeCompare(a.created_at),
    );
    const actors = [
      ...new Set(
        all.map((e) => e.actor_name || e.created_by || e.actor_id || "Sistema"),
      ),
    ];
    const rows = all.filter(
      (e) =>
        (!f.type || e.event_type === f.type) &&
        (!f.user ||
          (e.actor_name || e.created_by || e.actor_id || "Sistema") ===
            f.user) &&
        (!f.from || e.created_at.slice(0, 10) >= f.from) &&
        (!f.to || e.created_at.slice(0, 10) <= f.to) &&
        normalize(
          [
            e.event_type,
            EVENT_LABELS[e.event_type],
            e.actor_name,
            this.data.pieces.find((p) => p.id === e.part_id)?.internal_number,
            this.data.pieces.find((p) => p.id === e.part_id)?.part_name,
            JSON.stringify(e.metadata),
          ].join(" "),
        ).includes(normalize(f.query)),
    );
    $("#workspace-content").innerHTML =
      `<section class="workspace-panel"><h1>Atividade da operação</h1><p>${rows.length} ação(ões) registrada(s)</p><div class="filter-panel"><label class="field"><span>Buscar atividade</span><input data-activity="query" value="${h(f.query)}" type="search"/></label><label class="field"><span>Ação</span><select data-activity="type">${options(
        [...new Set(all.map((e) => e.event_type))].map((t) => [
          t,
          EVENT_LABELS[t] || t,
        ]),
        f.type,
        "Todas",
      )}</select></label><label class="field"><span>Usuário</span><select data-activity="user">${options(actors, f.user, "Todos")}</select></label>${["from", "to"].map((key, i) => `<label class="field"><span>${i ? "Até" : "Desde"}</span><input data-activity="${key}" type="date" value="${h(f[key])}"/></label>`).join("")}</div>${rows.map((e) => `<article>${this.timeline([e])}${e.part_id ? `<button class="row-open" data-event-piece="${h(e.part_id)}">Consultar peça #${h(this.data.pieces.find((p) => p.id === e.part_id)?.internal_number || "—")}</button>` : '<button class="row-open" data-event-company>Consultar Minha Empresa</button>'}</article>`).join("") || '<p class="empty-state">Nenhuma ação encontrada.</p>'}</section>`;
    document.querySelectorAll("[data-activity]").forEach(
      (el) =>
        (el.onchange = () => {
          f[el.dataset.activity] = el.value;
          this.renderActivity();
        }),
    );
    document
      .querySelectorAll("[data-event-piece]")
      .forEach((b) => (b.onclick = () => this.openPiece(b.dataset.eventPiece)));
    document
      .querySelectorAll("[data-event-company]")
      .forEach((b) => (b.onclick = () => this.navigate("company")));
  },
};
