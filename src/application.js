import {
  PHASES,
  ROLES,
  CATEGORIES,
  TABLE_COLUMNS,
  DEFAULT_TABLE_COLUMNS,
  SALE_LABELS,
  LISTING_LABELS,
  money,
  vehicle,
  permissions,
  missingFields,
  matches,
} from "./domain.js";
import { $, h, date, options, EVENT_LABELS } from "./ui.js";
import { editorMethods } from "./editor.js";
import { companyMethods } from "./company.js";
import { navigationMethods, routeView } from "./navigation.js";
import {
  overviewMethods,
  overviewRouteFilters,
  emptyFilters,
} from "./overview.js";
import {
  isOperationalPiece,
  operationalPhase,
  operationalColumn,
  isLegacyPhotoColumn,
  presentedColumn,
  reorderOperationalColumns,
  OPERATIONAL_STAGES,
} from "./overview-data.js";
import { icon } from "./icons.js";
import mascotUrl from "../assets/partiva-mascot.png";
export class Application {
  constructor(repo, onAccessError) {
    this.repo = repo;
    this.onAccessError = onAccessError;
    this.view = routeView(location.hash);
    this.onRoute = () => {
      if (location.hash === "#main-content") return;
      this.navigate(routeView(location.hash), true);
    };
    window.addEventListener("hashchange", this.onRoute);
    this.filters = overviewRouteFilters(location.hash);
    this.routeFiltered = this.view === "table" && location.hash.includes("?");
    this.sort = { key: "internal_number", direction: -1 };
    this.urls = new Map();
    this.stopped = false;
    this.editor = null;
    this.onBeforeUnload = (e) => {
      if (
        this.editor?.dirty ||
        this.uploading ||
        this.companyDirty ||
        this.memberDirty
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }
  async start() {
    await this.refresh();
    if (this.stopped) return;
    this.unsubscribe = this.repo.subscribe(
      this.data.company.id,
      () => {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(
          () => this.refresh().catch((e) => this.notify(e.message, true)),
          350,
        );
      },
      (status) => {
        $("#connection-status").textContent =
          status === "SUBSCRIBED"
            ? "Sincronização ativa"
            : "Atualização periódica";
      },
    );
    this.poll = setInterval(
      () =>
        this.refresh().catch(() => {
          $("#connection-status").textContent = "Conexão indisponível";
        }),
      30000,
    );
    this.urlRefresh = setInterval(
      () => {
        this.urls.clear();
        this.render();
      },
      25 * 60 * 1000,
    );
    document.querySelectorAll("[data-nav]").forEach((b) => {
      const label = b.textContent.trim();
      b.innerHTML = `<span class="nav-icon">${icon(b.dataset.nav)}</span><span class="nav-label">${h(label)}</span>`;
      b.onclick = () => this.navigate(b.dataset.nav);
    });
    $("#refresh-data").onclick = () =>
      this.run(() => this.refresh(), "Dados atualizados");
    $("#pending-button").onclick = () => {
      this.showOverviewTarget("pending");
    };
    $("#help-button").onclick = () =>
      this.action(
        "Como usar o Partiva",
        "<p>Cadastre a peça com as informações disponíveis. O rascunho é salvo no banco e pode ser completado depois.</p><p>Abra uma peça para editar, enviar fotos ou mudar sua etapa. As pendências impedem avançar para preparação e publicação.</p><p>Na tabela, combine filtros e escolha as colunas. Administradores gerenciam acessos e configurações em Minha Empresa.</p><p>O Mercado Livre permanece desconectado. Preparar o anúncio não publica uma oferta.</p>",
        null,
      );
    $("#mobile-menu").onclick = () => {
      const open = $("#application").classList.toggle("menu-open");
      $("#mobile-menu").setAttribute("aria-expanded", String(open));
    };
    $("#piece-dialog").addEventListener(
      "cancel",
      (this.onCancel = (e) => {
        e.preventDefault();
        void this.closePiece();
      }),
    );
    this.offerRecovery();
  }
  stop() {
    clearTimeout(this.commercialSearch);
    this.stopped = true;
    this.unsubscribe?.();
    clearInterval(this.poll);
    clearInterval(this.urlRefresh);
    clearTimeout(this.refreshTimer);
    clearTimeout(this.autosave);
    clearTimeout(this.searchTimer);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    window.removeEventListener("hashchange", this.onRoute);
    $("#piece-dialog").removeEventListener("cancel", this.onCancel);
    this.editor = null;
    $("#piece-dialog").close();
    $("#action-dialog").close();
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const next = await this.repo.load();
      if (this.stopped) return;
      const first = !this.data;
      this.data = next;
      this.access = permissions(next.membership.role);
      if (first)
        this.tableColumns = (
          next.preferences.table_columns || DEFAULT_TABLE_COLUMNS
        ).filter((key) => key in TABLE_COLUMNS);
      $("#company-name").textContent =
        next.company.trade_name || next.company.name;
      $("#user-name").textContent =
        next.membership.display_name || next.user.email;
      $("#user-role").textContent =
        ROLES[next.membership.role] || next.membership.role;
      if (next.company.logo_path)
        void this.url("company-assets", next.company.logo_path)
          .then((url) => {
            if (!this.stopped) {
              $("#company-logo").src = url;
              $("#company-logo").hidden = false;
            }
          })
          .catch(() => {});
      if (this.editor) {
        const fresh = next.pieces.find((p) => p.id === this.editor.id);
        if (fresh && fresh.version !== this.editor.version && !this.saving) {
          $("#editor-remote").textContent =
            "Este registro mudou. Seu preenchimento foi preservado. Recarregue antes de salvar sobre outra versão.";
          $("#editor-remote").hidden = false;
        }
      }
      if (!this.companyDirty && !this.memberDirty) this.render();
    })()
      .catch((error) => {
        if (
          error.message.includes("acesso ativo") ||
          error.code === "PGRST301"
        ) {
          this.stop();
          this.onAccessError(error.message);
        }
        throw error;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }
  async run(fn, success) {
    try {
      await fn();
      if (success) this.notify(success);
    } catch (e) {
      this.notify(e.message, true);
    }
  }
  notify(text, error = false) {
    $("#toast-message").textContent = text;
    $("#toast").classList.remove("hidden");
    $("#toast").classList.toggle("error-text", error);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(
      () => $("#toast").classList.add("hidden"),
      6500,
    );
  }
  navigate(view, fromHistory = false, query = "") {
    if (
      (this.companyDirty || this.memberDirty) &&
      !confirm("Descartar as alterações da empresa ainda não salvas?")
    ) {
      if (fromHistory) history.replaceState(null, "", `#/${this.view}`);
      return;
    }
    this.companyDirty = false;
    this.memberDirty = false;
    clearTimeout(this.commercialSearch);
    clearTimeout(this.searchTimer);
    const targetHash = fromHistory
      ? location.hash
      : `#/${view}${query ? `?${query}` : ""}`;
    if (view === "table" && (targetHash.includes("?") || this.routeFiltered)) {
      this.filters = overviewRouteFilters(targetHash);
      this.routeFiltered = targetHash.includes("?");
    } else if (view === "board" && this.routeFiltered) {
      this.filters = emptyFilters();
      this.routeFiltered = false;
    }
    this.view = view;
    if (!fromHistory && location.hash !== targetHash)
      history.pushState(null, "", targetHash);
    $("#application").classList.remove("menu-open");
    $("#mobile-menu").setAttribute("aria-expanded", "false");
    this.render();
    $("#main-content").focus();
  }
  photos(pid) {
    return this.data.photos
      .filter((p) => p.part_id === pid && !p.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }
  missing(p) {
    return missingFields(p, this.photos(p.id), this.data.company);
  }
  async url(bucket, path) {
    const key = `${bucket}/${path}`;
    if (!this.urls.has(key))
      this.urls.set(
        key,
        this.repo.signed(bucket, path).catch((e) => {
          this.urls.delete(key);
          throw e;
        }),
      );
    return this.urls.get(key);
  }
  hydrateImages(root = document) {
    root.querySelectorAll("img[data-path]").forEach(
      (img) =>
        void this.url(img.dataset.bucket || "part-photos", img.dataset.path)
          .then((url) => {
            if (img.isConnected) {
              img.src = url;
              img.removeAttribute("data-path");
            }
          })
          .catch(() => {
            img.alt = "Fotografia indisponível; atualize para tentar novamente";
          }),
    );
  }
  render() {
    if (!this.data || this.stopped) return;
    document.querySelectorAll("[data-nav]").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === this.view);
      b.setAttribute(
        "aria-current",
        b.dataset.nav === this.view ? "page" : "false",
      );
    });
    $("#page-title").textContent = {
      overview: "Visão geral",
      board: "Quadro operacional",
      table: "Peças em tabela",
      listings: "Anúncios",
      sales: "Vendas",
      reservations: "Reservas",
      activity: "Atividade",
      company: "Minha Empresa",
    }[this.view];
    $("#workspace-content").setAttribute("aria-busy", "false");
    if (this.view === "overview") return this.renderOverview();
    if (this.view === "company") return this.renderCompany();
    if (this.view === "activity") return this.renderActivity();
    if (["listings", "sales", "reservations"].includes(this.view))
      return this.renderCommercial();
    this.renderOperation();
  }
  filtered() {
    return this.data.pieces
      .filter((p) =>
        this.view === "board"
          ? isOperationalPiece(p)
          : (this.filters.scope !== "operational" || isOperationalPiece(p)) &&
            (!this.filters.phase ||
              operationalPhase(p, this.data.columns) === this.filters.phase),
      )
      .filter((p) =>
        matches(
          this.view === "board"
            ? { ...p, column_id: presentedColumn(p, this.data.columns) }
            : p,
          this.filters,
          this.photos(p.id),
          this.data.company,
        ),
      )
      .sort((a, b) => {
        const value = (p) =>
          this.sort.key === "vehicle"
            ? vehicle(p)
            : this.sort.key === "missing"
              ? this.missing(p).length
              : this.sort.key === "column_id"
                ? this.data.columns.find((c) => c.id === p.column_id)?.name ||
                  ""
                : p[this.sort.key];
        const av = value(a),
          bv = value(b);
        return (
          this.sort.direction *
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", {
                numeric: true,
              }))
        );
      });
  }
  renderOperation() {
    const activeSearch = document.activeElement?.id === "search-input";
    const searchPosition = activeSearch
      ? document.activeElement.selectionStart
      : null;
    const pieces = this.filtered();
    $("#workspace-content").innerHTML =
      `<section class="board-header"><div class="board-title-row"><div><div class="eyebrow">OPERAÇÃO DE PEÇAS</div><h1>${h($("#page-title").textContent)}</h1><p class="board-description">${pieces.length} peça(s) nesta consulta. Informações compartilhadas com a equipe.</p></div>${this.access.parts ? '<button class="primary-button" id="new-piece" type="button">+ Nova peça</button>' : ""}</div><div class="board-toolbar"><div class="toolbar-left"><label class="search-box"><input id="search-input" type="search" aria-label="Buscar peças" placeholder="Peça, veículo, Detran ou identificador" value="${h(this.filters.query)}"/></label><button class="filter-button" id="toggle-filters" type="button" aria-expanded="${Boolean(this.showFilters)}">Filtros</button>${Object.values(this.filters).some(Boolean) ? '<button class="text-button" id="clear-filters" type="button">Limpar filtros</button>' : ""}</div><div class="toolbar-right"><button class="view-button ${this.view === "board" ? "active" : ""}" id="view-board" type="button">Quadro</button><button class="view-button ${this.view !== "board" ? "active" : ""}" id="view-table" type="button">Tabela</button>${this.view !== "board" ? '<button class="secondary-button" id="table-settings" type="button">Colunas da tabela</button>' : ""}</div></div>${this.showFilters ? this.filterMarkup() : ""}</section>${this.view === "listings" ? '<div class="workspace-panel"><p class="view-note">Mercado Livre: <strong>integração não conectada</strong>. Prepare e revise anúncios. Publicação real dependerá da API oficial.</p></div>' : ""}${this.view === "sales" ? '<div class="workspace-panel"><p class="view-note">Reservas e vendas são independentes das etapas operacionais. Registros online exigem pedido e confirmação manual; não há sincronização com marketplaces.</p></div>' : ""}${this.view === "board" ? this.boardMarkup(pieces) : `<div class="workspace-panel">${this.tableMarkup(pieces)}</div>`}`;
    if (this.view === "board" || this.filters.scope || this.filters.phase) {
      const label =
        this.view === "board"
          ? "Fluxo ativo de preparação. Históricos, vendas e repouso estão nas áreas correspondentes."
          : [
              this.filters.scope === "operational"
                ? "Somente o fluxo ativo"
                : "",
              OPERATIONAL_STAGES.find((s) => s.key === this.filters.phase)
                ?.label,
            ]
              .filter(Boolean)
              .join(" · ");
      $("#workspace-content .board-header").insertAdjacentHTML(
        "beforeend",
        `<p class="operation-scope">${h(label)}</p>`,
      );
    }
    $("#new-piece")?.addEventListener("click", () => this.openPiece());
    $("#search-input").oninput = (e) => {
      this.filters.query = e.target.value;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        const start = $("#search-input").selectionStart;
        this.syncFilterRoute();
        this.renderOperation();
        $("#search-input").focus();
        $("#search-input").setSelectionRange(start, start);
      }, 200);
    };
    $("#toggle-filters").onclick = () => {
      this.showFilters = !this.showFilters;
      this.renderOperation();
    };
    $("#clear-filters")?.addEventListener("click", () => {
      this.filters = emptyFilters();
      this.routeFiltered = false;
      history.replaceState(null, "", `#/${this.view}`);
      this.renderOperation();
    });
    $("#view-board").onclick = () => this.navigate("board");
    $("#view-table").onclick = () => this.navigate("table");
    $("#table-settings")?.addEventListener("click", () => this.tableSettings());
    document.querySelectorAll("[data-filter]").forEach(
      (el) =>
        (el.onchange = () => {
          this.filters[el.dataset.filter] =
            el.type === "checkbox" ? el.checked : el.value;
          this.syncFilterRoute();
          this.renderOperation();
        }),
    );
    document
      .querySelectorAll("[data-open-piece]")
      .forEach(
        (el) => (el.onclick = () => this.openPiece(el.dataset.openPiece)),
      );
    document.querySelectorAll("[data-sort]").forEach(
      (el) =>
        (el.onclick = () => {
          this.sort = {
            key: el.dataset.sort,
            direction:
              this.sort.key === el.dataset.sort ? -this.sort.direction : 1,
          };
          this.renderOperation();
        }),
    );
    document
      .querySelectorAll("[data-column-edit]")
      .forEach(
        (el) => (el.onclick = () => this.editColumn(el.dataset.columnEdit)),
      );
    $("#add-column")?.addEventListener("click", () => this.editColumn());
    document
      .querySelectorAll("[data-quick-add]")
      .forEach(
        (el) => (el.onclick = () => this.openPiece(null, el.dataset.quickAdd)),
      );
    this.bindDrag();
    this.hydrateImages($("#workspace-content"));
    if (activeSearch) {
      $("#search-input").focus({ preventScroll: true });
      $("#search-input").setSelectionRange(searchPosition, searchPosition);
    }
  }
  filterMarkup() {
    const board = this.view === "board";
    const saleOptions = Object.entries(SALE_LABELS).filter(
      ([key]) => !board || ["available", "reserved"].includes(key),
    );
    const listingOptions = Object.entries(LISTING_LABELS).filter(
      ([key]) =>
        !board || ["draft", "review", "ready", "not_applicable"].includes(key),
    );
    return `<div class="filter-panel"><label class="field"><span>Categoria</span><select data-filter="category">${options([...new Set([...CATEGORIES, ...this.data.pieces.map((p) => p.category).filter(Boolean)])], this.filters.category, "Todas")}</select></label>${
      !board
        ? `<label class="field"><span>Etapa do fluxo</span><select data-filter="phase">${options(
            OPERATIONAL_STAGES.map((s) => [s.key, s.label]),
            this.filters.phase,
            "Todas",
          )}</select></label>`
        : ""
    }<label class="field"><span>Coluna do quadro</span><select data-filter="column">${options(
      this.data.columns
        .filter((c) => !board || operationalColumn(c))
        .map((c) => [c.id, c.name]),
      this.filters.column,
      "Todas",
    )}</select></label><label class="field"><span>Disponibilidade</span><select data-filter="sale">${options(saleOptions, this.filters.sale, "Todas")}</select></label><label class="field"><span>Anúncio</span><select data-filter="listing">${options(listingOptions, this.filters.listing, "Todos")}</select></label><label class="check-field"><input type="checkbox" data-filter="pending" ${this.filters.pending ? "checked" : ""}/> Com pendências</label>${!board ? `<label class="check-field"><input type="checkbox" data-filter="archived" ${this.filters.archived ? "checked" : ""}/> Excluídas da operação</label>` : ""}</div>`;
  }
  syncFilterRoute() {
    if (this.view !== "table") return;
    const query = new URLSearchParams(
      Object.entries(this.filters)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    this.routeFiltered = Boolean(query);
    history.replaceState(null, "", `#/table${query ? `?${query}` : ""}`);
  }
  boardMarkup(pieces) {
    const columns = this.data.columns.filter(operationalColumn);
    const shownColumn = (p) => presentedColumn(p, this.data.columns);
    return `<section class="kanban-scroll" aria-label="Quadro de peças"><div class="kanban-board">${columns
      .map(
        (c) =>
          `<article class="kanban-column" data-drop-column="${c.id}"><header class="column-header"><div class="column-title"><span class="column-dot" style="background:${/^#[\da-f]{6}$/i.test(c.color) ? c.color : "#0e6b6e"}"></span><strong>${h(c.name === "Publicação" ? "Pronto para publicação" : c.name)}</strong><span class="column-count">${pieces.filter((p) => shownColumn(p) === c.id).length}</span></div>${this.access.columns ? `<button class="column-menu" data-column-edit="${c.id}" type="button" aria-label="Configurar ${h(c.name)}">•••</button>` : ""}</header><div class="cards-stack">${
            pieces
              .filter((p) => shownColumn(p) === c.id)
              .map((p) => this.cardMarkup(p))
              .join("") ||
            '<div class="empty-column"><strong>Nenhuma peça nesta etapa</strong></div>'
          }</div>${this.access.parts ? `<button class="add-card-button" data-quick-add="${c.id}" type="button">+ Adicionar peça</button>` : ""}</article>`,
      )
      .join(
        "",
      )}</div>${this.access.columns ? '<button class="add-column-button" id="add-column" type="button">+ Adicionar coluna</button>' : ""}</section>`;
  }
  cardMarkup(p) {
    const photos = this.photos(p.id),
      cover = photos.find((x) => x.is_cover) || photos[0];
    return `<button class="piece-card" type="button" data-open-piece="${p.id}" data-drag-piece="${p.id}" draggable="${this.access.parts && !p.archived_at}" aria-label="Abrir peça ${h(p.internal_number)} ${h(p.part_name)}"><div class="card-image">${cover ? `<img data-path="${h(cover.storage_path)}" alt="${h(p.part_name || "Fotografia da peça")}" loading="lazy"/>` : '<span class="card-empty-photo">Fotografias pendentes</span>'}</div><div class="card-labels"><span class="card-code">#${h(p.internal_number)}</span>${p.complementary_code ? `<span class="card-code">${h(p.complementary_code)}</span>` : ""}<span class="status-pill ${h(p.sale_status)}">${h(p.legacy_hold ? "Em repouso" : SALE_LABELS[p.sale_status])}</span></div><h3>${h(p.part_name || "Peça em rascunho")}</h3><div class="card-vehicle">${h(vehicle(p))}</div><div class="card-meta"><span>${h(p.category || "Categoria a definir")}</span><span class="card-price">${money(p.price_cents)}</span></div><div class="card-pending">${this.missing(p).length} pendência(s) para anúncio</div></button>`;
  }
  tableMarkup(pieces) {
    if (!pieces.length)
      return `<div class="empty-state"><img src="${mascotUrl}" alt=""/><p>Nenhuma peça encontrada. Ajuste os filtros ou cadastre uma peça.</p></div>`;
    return `<div class="table-scroll"><table class="parts-table"><caption class="sr-only">Peças cadastradas na empresa</caption><thead><tr>${this.tableColumns.map((key) => `<th scope="col" aria-sort="${this.sort.key === key ? (this.sort.direction === 1 ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${key}">${h(TABLE_COLUMNS[key])}${this.sort.key === key ? (this.sort.direction === 1 ? " ↑" : " ↓") : ""}</button></th>`).join("")}<th scope="col">Ação</th></tr></thead><tbody>${pieces.map((p) => `<tr>${this.tableColumns.map((key) => `<td class="${["part_name", "vehicle"].includes(key) ? "wrap" : ""}">${h(this.tableValue(p, key))}</td>`).join("")}<td><button class="row-open" data-open-piece="${p.id}" type="button">Abrir #${h(p.internal_number)}</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  tableValue(p, key) {
    if (key === "vehicle") return vehicle(p);
    if (key === "price_cents") return money(p.price_cents);
    if (key === "column_id") {
      const column = this.data.columns.find((c) => c.id === p.column_id);
      return isLegacyPhotoColumn(column)
        ? "Fotografias pendentes"
        : column?.name === "Publicação"
          ? "Pronto para publicação"
          : column?.name || "Etapa a revisar";
    }
    if (key === "missing") return `${this.missing(p).length} pendência(s)`;
    if (key === "sale_status")
      return p.legacy_hold ? "Em repouso" : SALE_LABELS[p[key]];
    if (key === "listing_status") return LISTING_LABELS[p[key]];
    if (key === "updated_at") return date(p[key]);
    return p[key] ?? "—";
  }
  bindDrag() {
    document.querySelectorAll("[data-drag-piece]").forEach(
      (el) =>
        (el.ondragstart = (e) => {
          if (!this.access.parts) return;
          e.dataTransfer.setData(
            "application/x-partiva-piece",
            el.dataset.dragPiece,
          );
          e.dataTransfer.effectAllowed = "move";
        }),
    );
    document.querySelectorAll("[data-drop-column]").forEach((el) => {
      el.ondragover = (e) => {
        if (this.access.parts) {
          e.preventDefault();
          el.classList.add("drag-over");
        }
      };
      el.ondragleave = () => el.classList.remove("drag-over");
      el.ondrop = (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const id = e.dataTransfer.getData("application/x-partiva-piece");
        if (id)
          void this.run(
            () => this.move(id, el.dataset.dropColumn),
            "Etapa salva",
          );
      };
    });
  }
  async move(pid, destination) {
    const p = this.data.pieces.find((p) => p.id === pid);
    if (!p || p.column_id === destination) return;
    await this.repo.rpc("save_part", {
      payload: { id: pid, column_id: destination },
      expected_version: p.version,
    });
    await this.refresh();
  }
  action(title, body, onSubmit, submit = "Salvar") {
    const dialog = $("#action-dialog");
    if (dialog.open) dialog.close();
    dialog.innerHTML = `<form id="action-form"><header class="dialog-header"><h2 id="action-title">${h(title)}</h2><button data-action-close type="button" aria-label="Fechar">×</button></header><div class="dialog-body">${body}<p class="notice error form-error" id="action-error" role="alert"></p></div><footer class="dialog-footer"><button data-action-close class="secondary-button" type="button">Fechar</button>${onSubmit ? `<button class="primary-button" id="action-submit" type="submit">${h(submit)}</button>` : ""}</footer></form>`;
    dialog
      .querySelectorAll("[data-action-close]")
      .forEach((b) => (b.onclick = () => dialog.close()));
    if (onSubmit)
      $("#action-form").onsubmit = async (e) => {
        e.preventDefault();
        $("#action-submit").disabled = true;
        $("#action-error").textContent = "";
        try {
          await onSubmit(new FormData(e.currentTarget));
          dialog.close();
        } catch (error) {
          $("#action-error").textContent = error.message;
        } finally {
          const b = $("#action-submit");
          if (b) b.disabled = false;
        }
      };
    dialog.showModal();
    return dialog;
  }
  editColumn(id) {
    const visibleColumns = this.data.columns.filter(operationalColumn);
    const c = this.data.columns.find((c) => c.id === id),
      index = visibleColumns.findIndex((c) => c.id === id);
    this.action(
      c ? "Configurar coluna" : "Nova coluna",
      `<label class="field"><span>Nome</span><input name="name" maxlength="80" required value="${h(c?.name || "")}"/></label><div class="filter-panel"><label class="field"><span>Cor</span><input name="color" type="color" value="${h(c?.color || "#0e6b6e")}"/></label><label class="field"><span>Regra da etapa</span><select name="phase" required>${options(Object.entries(PHASES), c?.phase || "registration")}</select></label></div><p class="muted">Preparação e publicação exigem informações e fotografias completas.</p>${c ? `<div class="column-controls"><button class="secondary-button" id="column-left" type="button" ${index === 0 ? "disabled" : ""}>Mover para esquerda</button><button class="secondary-button" id="column-right" type="button" ${index === visibleColumns.length - 1 ? "disabled" : ""}>Mover para direita</button></div><label class="field"><span>Destino das peças ao excluir</span><select id="column-destination">${options(visibleColumns.filter((c) => c.id !== id).map((c) => [c.id, c.name]))}</select></label><p class="muted">As peças serão transferidas juntas. Nenhuma será apagada.</p><button class="danger-button" id="column-delete" type="button" ${visibleColumns.length < 2 ? "disabled" : ""}>Excluir esta coluna</button>` : ""}`,
      async (form) => {
        await this.repo.rpc("column_action", {
          command: c ? "update" : "create",
          payload: {
            id,
            version: c?.version,
            name: form.get("name"),
            color: form.get("color"),
            phase: form.get("phase"),
          },
        });
        await this.refresh();
        this.notify("Coluna salva");
      },
    );
    if (c) {
      for (const [sel, delta] of [
        ["#column-left", -1],
        ["#column-right", 1],
      ])
        $(sel).onclick = () =>
          this.run(async () => {
            const ids = reorderOperationalColumns(this.data.columns, id, delta);
            await this.repo.rpc("column_action", {
              command: "reorder",
              payload: { ids },
            });
            $("#action-dialog").close();
            await this.refresh();
          }, "Ordem salva");
      $("#column-delete").onclick = () =>
        this.run(async () => {
          const destination = $("#column-destination").value;
          if (
            visibleColumns.length < 2 ||
            !visibleColumns.some(
              (column) => column.id === destination && column.id !== id,
            )
          )
            throw new Error("Escolha outra coluna operacional como destino.");
          if (!confirm(`Excluir a coluna ${c.name} e transferir suas peças?`))
            return;
          // Imported photo records can share a visible queue while preserving
          // their original column. Transfer those records first, using the
          // same guarded/versioned move operation as a normal card movement.
          // On a conflict the column remains; no record is deleted or hidden.
          try {
            const aliases = this.data.pieces.filter(
              (p) =>
                isOperationalPiece(p) &&
                p.column_id !== id &&
                presentedColumn(p, this.data.columns) === id,
            );
            for (const piece of aliases)
              await this.repo.rpc("save_part", {
                payload: { id: piece.id, column_id: destination },
                expected_version: piece.version,
              });
            await this.repo.rpc("column_action", {
              command: "delete",
              payload: { id, version: c.version, destination },
            });
          } finally {
            await this.refresh();
          }
          $("#action-dialog").close();
          await this.refresh();
        }, "Coluna removida com as peças preservadas");
    }
  }
  tableSettings() {
    this.action(
      "Colunas da tabela",
      `<div class="table-settings">${Object.entries(TABLE_COLUMNS)
        .map(
          ([key, label]) =>
            `<label class="check-field"><input type="checkbox" name="columns" value="${key}" ${this.tableColumns.includes(key) ? "checked" : ""}/> ${h(label)}</label>`,
        )
        .join("")}</div>`,
      async (form) => {
        const selected = form.getAll("columns");
        if (!selected.length) throw new Error("Selecione ao menos uma coluna.");
        await this.repo.rpc("preferences_save", {
          payload: { ...this.data.preferences, table_columns: selected },
        });
        this.tableColumns = selected;
        this.data.preferences.table_columns = selected;
        this.render();
      },
    );
  }
  timeline(events) {
    return events.length
      ? `<ol class="timeline">${events.map((e) => `<li><strong>${h(EVENT_LABELS[e.event_type] || e.event_type)}</strong><small>${h(e.actor_name || e.created_by || e.actor_id || "Sistema")}</small><time datetime="${h(e.created_at)}">${h(date(e.created_at))}</time>${e.metadata?.from || e.metadata?.to ? `<span>${h(e.metadata.from || "")} → ${h(e.metadata.to || "")}</span>` : ""}${e.metadata?.note ? `<span>${h(e.metadata.note)}</span>` : ""}</li>`).join("")}</ol>`
      : '<p class="empty-state">Nenhuma ação registrada.</p>';
  }
  renderActivity() {
    $("#workspace-content").innerHTML =
      `<div class="workspace-panel"><h1>Atividade da operação</h1><p class="muted">Ações reais com funcionário e data.</p>${this.timeline([...this.data.events].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200))}</div>`;
  }
}
Object.assign(
  Application.prototype,
  editorMethods,
  companyMethods,
  navigationMethods,
  overviewMethods,
);
