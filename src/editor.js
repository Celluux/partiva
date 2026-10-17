import { legacyDetails, legacyHistory } from "./legacy-view.js";
import {
  CATALOG,
  BRANDS,
  MODELS,
  CATEGORIES,
  SALE_LABELS,
  LISTING_LABELS,
  normalize,
  suggestTitle,
  applicability,
  fees,
  cents,
  money,
  validatePhoto,
} from "./domain.js";
import { $, h, date, options, field } from "./ui.js";
export const editorMethods = {
  recoveryKey(id) {
    return `partiva-recovery:${this.data.user.id}:${id}`;
  },
  offerRecovery() {
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith(`partiva-recovery:${this.data.user.id}:`),
    );
    if (!keys.length) return;
    $("#app-message").innerHTML =
      `Há ${keys.length} preenchimento(s) local(is) para conferir. <button class="link-button" id="recover-drafts" type="button">Recuperar rascunho</button>`;
    $("#recover-drafts").onclick = () =>
      this.action(
        "Recuperar preenchimento",
        keys
          .map((key) => {
            try {
              const item = JSON.parse(localStorage.getItem(key));
              return `<p><button class="link-button" data-recover="${h(key)}" type="button">${h(item.payload.part_name || "Peça em rascunho")} — ${h(date(item.updated_at))}</button></p>`;
            } catch {
              return "";
            }
          })
          .join(""),
        null,
      )
        .querySelectorAll("[data-recover]")
        .forEach(
          (b) =>
            (b.onclick = () => {
              const item = JSON.parse(localStorage.getItem(b.dataset.recover));
              $("#action-dialog").close();
              this.openPiece(item.payload.id, null, item);
            }),
        );
  },
  openPiece(id, columnId, recovery) {
    let p = this.data.pieces.find((p) => p.id === id);
    if (!p)
      p = {
        id: id || crypto.randomUUID(),
        part_name: "",
        title: "",
        brand: this.data.company.preferences.default_brand || "",
        model: this.data.company.preferences.default_model || "",
        column_id: columnId || this.data.columns[0]?.id,
        listing_status: "draft",
        sale_status: "available",
      };
    const base = p;
    if (recovery) p = { ...p, ...recovery.payload };
    this.editor = {
      id: p.id,
      version: base.version ?? null,
      dirty: Boolean(recovery),
      revision: 0,
      part: base,
    };
    const disabled = !this.access.parts || Boolean(p.archived_at);
    const dialog = $("#piece-dialog");
    dialog.innerHTML = `<header class="dialog-header"><div><div class="eyebrow">${p.internal_number ? `PEÇA #${h(p.internal_number)}` : "NOVO CADASTRO"}</div><h2 id="piece-dialog-title">${h(p.part_name || "Peça em rascunho")}</h2><p>Identificador permanente, gerado no primeiro salvamento.</p></div><button id="close-piece" type="button" aria-label="Fechar cadastro">×</button></header><nav class="dialog-tabs" role="tablist" aria-label="Informações da peça">${[
      ["data", "Cadastro"],
      ["photos", `Fotografias (${this.photos(p.id).length})`],
      ["actions", "Anúncio e venda"],
      ["history", "Histórico"],
    ]
      .map(
        ([key, label]) =>
          `<button type="button" role="tab" aria-selected="${key === "data"}" aria-controls="panel-${key}" data-tab="${key}" id="tab-${key}" tabindex="${key === "data" ? 0 : -1}">${label}</button>`,
      )
      .join(
        "",
      )}</nav><div class="dialog-body"><p class="notice warning" id="editor-remote" hidden></p><div id="editor-error" class="notice error form-error" role="alert"></div>${legacyDetails(p)}<section id="panel-data" role="tabpanel" aria-labelledby="tab-data"><form id="piece-form"><fieldset class="form-section" ${disabled ? "disabled" : ""}><legend>1. Identificação da peça</legend><div class="form-grid">${field("internal_number", "Identificador interno", p.internal_number || "Gerado no primeiro salvamento", 'readonly aria-readonly="true"')}${field("detran_reference", "Número do Detran", p.detran_reference, 'maxlength="250"')}${field("complementary_code", "Código complementar", p.complementary_code, 'maxlength="250"')}${field("part_name", "Nome / tipo da peça", p.part_name, 'list="part-types" maxlength="250" autocomplete="off"')}<datalist id="part-types">${CATALOG.map((x) => `<option value="${h(x.name)}">`).join("")}</datalist><label class="field"><span>Categoria</span><input name="category" list="categories" value="${h(p.category || "")}" maxlength="250"/><datalist id="categories">${CATEGORIES.map((x) => `<option value="${h(x)}">`).join("")}</datalist></label>${field("color", "Cor", p.color, 'list="colors" maxlength="250"')}<datalist id="colors">${["Branco", "Preto", "Prata", "Cinza", "Vermelho", "Azul", "Verde", "Bege", "Não se aplica"].map((x) => `<option value="${x}">`).join("")}</datalist></div><p id="detran-warning" class="notice warning" hidden></p></fieldset><fieldset class="form-section" ${disabled ? "disabled" : ""}><legend>2. Veículo e aplicação</legend><div class="form-grid">${field("brand", "Marca", p.brand, 'list="brands" maxlength="250"')}<datalist id="brands">${BRANDS.map((x) => `<option value="${h(x)}">`).join("")}</datalist>${field("model", "Modelo", p.model, 'list="models" maxlength="250"')}<datalist id="models"></datalist>${field("year", "Ano", p.year, 'type="number" min="1900" max="2200" step="1"')}${field("year_compatibility", "Ano / compatibilidade em texto", p.year_compatibility, 'maxlength="250" placeholder="Ex.: 2004 a 2008"')}${field("engine", "Motorização", p.engine, 'list="engines" maxlength="250"')}<datalist id="engines">${["1.0", "1.0 Turbo", "1.3", "1.4", "1.6", "1.8", "2.0", "2.0 Turbo", "2.4", "2.8", "3.0"].map((x) => `<option value="${x}">`).join("")}</datalist><label class="field" id="position-field"><span>Posição</span><select name="position">${options(["Dianteira", "Traseira", "Central", "Superior", "Inferior"], p.position)}</select></label><label class="field" id="side-field"><span>Lado</span><select name="side">${options(["Esquerdo", "Direito", "Ambos", "Não se aplica"], p.side)}</select></label></div></fieldset><fieldset class="form-section" ${disabled ? "disabled" : ""}><legend>3. Anúncio e preço</legend><div class="form-grid"><label class="field full-width"><span>Título do anúncio</span><input name="title" maxlength="250" value="${h(p.title || suggestTitle(p))}"/><small>Sugestão automática editável.</small></label><label class="check-field full-width"><input name="title_manual" type="checkbox" ${p.title_manual ? "checked" : ""}/> Manter meu título manual</label>${field("price", "Preço de anúncio (R$)", p.price_cents == null ? "" : (p.price_cents / 100).toFixed(2).replace(".", ","), 'inputmode="decimal" placeholder="0,00"')}${field("fee_percent_override", "Taxa individual estimada (%)", p.fee_percent_override, 'type="number" min="0" max="100" step="0.01" placeholder="Usar configuração da empresa"')}${field("fee_fixed_override", "Taxa fixa individual (R$)", p.fee_fixed_cents_override == null ? "" : (p.fee_fixed_cents_override / 100).toFixed(2).replace(".", ","), 'inputmode="decimal"')}${field("other_cost", "Outros custos da peça (R$)", ((p.other_cost_cents || 0) / 100).toFixed(2).replace(".", ","), 'inputmode="decimal"')}<label class="check-field full-width"><input type="checkbox" name="price_is_suggested" ${p.price_is_suggested ? "checked" : ""}/> Preço é uma sugestão e ainda precisa de conferência</label><label class="field span-two"><span>Observações e próximos cuidados</span><textarea name="notes" rows="3" maxlength="5000">${h(p.notes || "")}</textarea></label></div><div class="finance-summary" id="finance-preview"></div></fieldset><button type="submit" hidden>Salvar cadastro</button></form><p class="muted">Salve com informações parciais e complete depois. Campos essenciais serão exigidos antes da preparação do anúncio.</p></section><section id="panel-photos" role="tabpanel" aria-labelledby="tab-photos" hidden></section><section id="panel-actions" role="tabpanel" aria-labelledby="tab-actions" hidden></section><section id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden></section></div><footer class="dialog-footer"><span class="save-status" id="save-status" role="status">${p.internal_number ? "Salvo no banco" : "Rascunho ainda não salvo"}</span><div class="action-bar"><button class="secondary-button" id="reload-piece" type="button">Recarregar</button>${this.access.parts && !p.archived_at ? '<button class="primary-button" id="save-piece" type="button">Salvar rascunho</button>' : ""}<button class="secondary-button" id="done-piece" type="button">Fechar</button></div></footer>`;
    $("#close-piece").onclick = () => void this.closePiece();
    $("#done-piece").onclick = () => void this.closePiece();
    $("#save-piece")?.addEventListener("click", () =>
      this.run(() => this.savePiece(true), "Cadastro salvo"),
    );
    $("#reload-piece").onclick = () =>
      this.run(async () => {
        if (
          this.editor.dirty &&
          !confirm("Descartar o preenchimento local e recarregar o banco?")
        )
          return;
        clearTimeout(this.autosave);
        await this.refresh();
        this.openPiece(this.editor.id);
      });
    $("#piece-form").onsubmit = (e) => {
      e.preventDefault();
      void this.run(() => this.savePiece(true));
    };
    $("#piece-form").oninput = (e) => this.onEdit(e);
    $("#piece-form").onchange = (e) => this.onEdit(e);
    const tabs = [...dialog.querySelectorAll("[data-tab]")];
    tabs.forEach((tab, index) => {
      tab.onclick = () => this.selectTab(tab.dataset.tab);
      tab.onkeydown = (e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? tabs.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                  tabs.length;
          tabs[next].click();
          tabs[next].focus();
        }
      };
    });
    const form = $("#piece-form");
    for (const [name, label] of [
      ["position", "Posição"],
      ["side", "Lado"],
      ["title", "Título do anúncio"],
    ])
      form.elements[name].setAttribute("aria-label", label);
    const sections = [...form.querySelectorAll("fieldset")];
    sections.forEach((section, index) => {
      section.dataset.formStep = index;
    });
    form.insertAdjacentHTML(
      "afterbegin",
      `<nav class="editor-steps action-bar" aria-label="Etapas do cadastro">${["Identificação", "Veículo e aplicação", "Anúncio e preço"].map((label, index) => `<button type="button" class="secondary-button" data-form-step="${index}">${index + 1}. ${label}</button>`).join("")}</nav>`,
    );
    form.insertAdjacentHTML(
      "beforeend",
      '<div class="action-bar"><button type="button" class="secondary-button" id="previous-form-step">Voltar</button><button type="button" class="primary-button" id="next-form-step">Continuar</button></div>',
    );
    form
      .querySelectorAll("[data-form-step]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            this.setFormStep(Number(button.dataset.formStep))),
      );
    $("#previous-form-step").onclick = () =>
      this.setFormStep(this.editor.step - 1);
    $("#next-form-step").onclick = () => this.setFormStep(this.editor.step + 1);
    if (recovery?.raw) {
      for (const [key, value] of Object.entries(recovery.raw)) {
        const input = form.elements[key];
        if (!input || key === "internal_number") continue;
        if (input.type === "checkbox") input.checked = value === "on";
        else input.value = value;
      }
    }
    this.setFormStep(0);
    this.updateDynamic();
    if (!dialog.open) dialog.showModal();
    if (recovery)
      $("#save-status").textContent =
        "Preenchimento recuperado. Confira e salve no banco.";
  },
  setFormStep(step) {
    if (!this.editor) return;
    this.editor.step = Math.max(0, Math.min(2, step));
    document.querySelectorAll("#piece-form fieldset").forEach((section) => {
      section.hidden = Number(section.dataset.formStep) !== this.editor.step;
    });
    document
      .querySelectorAll("[data-form-step]")
      .forEach((button) =>
        button.setAttribute(
          "aria-current",
          Number(button.dataset.formStep) === this.editor.step
            ? "step"
            : "false",
        ),
      );
    $("#previous-form-step").disabled = this.editor.step === 0;
    $("#next-form-step").hidden = this.editor.step === 2;
  },
  selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const active = b.dataset.tab === name;
      b.setAttribute("aria-selected", String(active));
      b.tabIndex = active ? 0 : -1;
    });
    for (const key of ["data", "photos", "actions", "history"])
      $(`#panel-${key}`).hidden = key !== name;
    if (name === "photos") this.renderPhotos();
    if (name === "actions") this.renderPieceActions();
    if (name === "history") this.renderHistory();
  },
  rawForm() {
    const f = new FormData($("#piece-form"));
    const payload = { id: this.editor.id };
    for (const key of [
      "part_name",
      "detran_reference",
      "complementary_code",
      "category",
      "brand",
      "model",
      "engine",
      "position",
      "side",
      "color",
      "title",
      "notes",
    ])
      payload[key] = String(f.get(key) || "").trim();
    payload.year = f.get("year") ? Number(f.get("year")) : null;
    payload.year_compatibility = String(
      f.get("year_compatibility") || "",
    ).trim();
    payload.fee_percent_override = String(
      f.get("fee_percent_override") || "",
    ).trim()
      ? Number(f.get("fee_percent_override"))
      : null;
    payload.fee_fixed_cents_override = cents(f.get("fee_fixed_override"));
    payload.other_cost_cents = cents(f.get("other_cost")) || 0;
    payload.price_is_suggested = f.get("price_is_suggested") === "on";
    payload.title_manual = f.get("title_manual") === "on";
    payload.price_cents = cents(f.get("price"));
    if (!this.editor.version) payload.column_id = this.editor.part.column_id;
    return payload;
  },
  updateDynamic() {
    const f = $("#piece-form");
    if (!f) return;
    const a = applicability(f.elements.part_name.value);
    $("#position-field").hidden = !a.position;
    $("#side-field").hidden = !a.side;
    $("#models").innerHTML = (MODELS[f.elements.brand.value] || [])
      .map((x) => `<option value="${h(x)}">`)
      .join("");
    const ref = normalize(f.elements.detran_reference.value);
    const duplicates = ref
      ? this.data.pieces.filter(
          (p) =>
            p.id !== this.editor.id &&
            !p.archived_at &&
            normalize(p.detran_reference) === ref,
        )
      : [];
    $("#detran-warning").hidden = !duplicates.length;
    $("#detran-warning").textContent =
      `Detran já informado em ${duplicates.length} outra(s) peça(s). A repetição é permitida.`;
    try {
      const current = this.access.parts ? this.rawForm() : this.editor.part;
      const v = fees(cents(f.elements.price.value), this.data.company, current);
      $("#finance-preview").innerHTML =
        `<div><span>Taxa estimada (${h(current.fee_percent_override ?? this.data.company.fee_percent)}% + ${money(current.fee_fixed_cents_override ?? this.data.company.fee_fixed_cents)})</span><strong>${money(v.fee)}</strong></div><div><span>Valor líquido estimado</span><strong>${money(v.net)}</strong></div><div><span>Configuração</span><strong>${current.fee_percent_override != null ? "Taxa individual da peça" : this.data.company.fee_configured ? "Conferida pela empresa" : "Pendente"}</strong></div>`;
    } catch {
      $("#finance-preview").textContent =
        "Informe um preço válido para calcular a estimativa.";
    }
  },
  onEdit(event) {
    if (!this.access.parts) return;
    const f = $("#piece-form");
    if (event.target.name === "title") f.elements.title_manual.checked = true;
    if (event.target.name === "part_name" && !f.elements.category.value) {
      const item = CATALOG.find(
        (x) => normalize(x.name) === normalize(f.elements.part_name.value),
      );
      if (item) f.elements.category.value = item.category;
    }
    if (!f.elements.title_manual.checked) {
      const p = {};
      for (const key of [
        "part_name",
        "position",
        "side",
        "brand",
        "model",
        "year",
        "engine",
        "color",
      ])
        p[key] = f.elements[key].value;
      f.elements.title.value = suggestTitle(p);
    }
    this.editor.dirty = true;
    this.editor.revision++;
    $("#save-status").textContent = "Alterações pendentes…";
    this.updateDynamic();
    try {
      localStorage.setItem(
        this.recoveryKey(this.editor.id),
        JSON.stringify({
          payload: {
            id: this.editor.id,
            part_name: f.elements.part_name.value,
          },
          raw: Object.fromEntries(new FormData(f)),
          updated_at: new Date().toISOString(),
        }),
      );
    } catch {}
    clearTimeout(this.autosave);
    this.autosave = setTimeout(
      () =>
        this.savePiece().catch((e) => {
          $("#editor-error").textContent = e.message;
          $("#save-status").textContent =
            "Não salvo no banco. Preenchimento preservado nesta tela.";
        }),
      1500,
    );
  },
  async savePiece(force = false) {
    clearTimeout(this.autosave);
    if (this.saving) {
      await this.saving;
      if (this.editor?.dirty) return this.savePiece(force);
      return;
    }
    if (!this.editor || !this.access.parts || (!this.editor.dirty && !force))
      return;
    const editor = this.editor,
      revision = editor.revision,
      payload = this.rawForm();
    const invalid = $("#piece-form").querySelector(":invalid");
    if (invalid?.closest("fieldset"))
      this.setFormStep(Number(invalid.closest("fieldset").dataset.formStep));
    if (!$("#piece-form").reportValidity())
      throw new Error("Revise os campos destacados.");
    $("#save-status").textContent = "Salvando no banco…";
    $("#editor-error").textContent = "";
    this.saving = (async () => {
      const result = await this.repo.rpc("save_part", {
        payload,
        expected_version: editor.version,
      });
      if (this.editor !== editor) return;
      editor.version = result.part.version;
      editor.part = result.part;
      editor.dirty = editor.revision !== revision;
      $("#piece-form").elements.internal_number.value =
        result.part.internal_number;
      $("#piece-dialog-title").textContent =
        result.part.part_name || "Peça em rascunho";
      $("#save-status").textContent = editor.dirty
        ? "Novas alterações pendentes"
        : "Salvo no banco";
      if (!editor.dirty) localStorage.removeItem(this.recoveryKey(editor.id));
      const i = this.data.pieces.findIndex((p) => p.id === editor.id);
      if (i < 0) this.data.pieces.unshift(result.part);
      else this.data.pieces[i] = result.part;
      if (result.duplicates)
        this.notify(
          `Detran já cadastrado em ${result.duplicates} outra(s) peça(s).`,
        );
      this.render();
    })().finally(() => {
      this.saving = null;
    });
    await this.saving;
    if (editor.dirty) await this.savePiece();
  },
  async closePiece() {
    if (this.uploading) {
      this.notify("Aguarde o envio das fotografias terminar.", true);
      return;
    }
    if (this.editor?.dirty) {
      try {
        await this.savePiece();
      } catch (e) {
        $("#editor-error").textContent = e.message;
        return;
      }
    }
    clearTimeout(this.autosave);
    this.editor = null;
    $("#piece-dialog").close();
  },
  async syncEditor() {
    await this.refresh();
    if (this.editor) {
      const p = this.data.pieces.find((p) => p.id === this.editor.id);
      if (p) {
        this.editor.version = p.version;
        this.editor.part = p;
      }
      $("#editor-remote").hidden = true;
    }
  },
  renderPhotos() {
    if (this.uploading) return;
    const root = $("#panel-photos");
    if (!root || !this.editor) return;
    const photos = this.photos(this.editor.id);
    root.innerHTML = `<p class="muted">Originais são preservados. Remover da galeria não apaga o arquivo original. Versões editadas ficam vinculadas à origem.</p>${this.access.photos && !this.editor.part.archived_at ? '<label class="field"><span>Adicionar fotografias originais</span><input class="upload-input" id="photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple/></label>' : ""}<div id="upload-progress" class="upload-progress" aria-live="polite"></div><div class="photo-grid">${photos.map((p, i) => `<article class="photo-tile"><button type="button" data-preview-photo="${p.id}" aria-label="Ampliar fotografia ${i + 1}"><img data-path="${h(p.storage_path)}" alt="Fotografia ${i + 1} da peça"/></button><span class="photo-badge">${p.kind === "edited" ? "Versão editada" : "Original"}${p.legacy_photo_metadata?.draft_pending ? " · Rascunho antigo" : ""}${p.is_cover ? " · Capa" : ""}${p.original_photo_id ? ` · original ${h(p.original_photo_id.slice(0, 8))}` : ""}</span><label class="check-field"><input type="checkbox" data-photo-select="${p.id}" ${p.selected_for_listing ? "checked" : ""} ${!this.access.photos ? "disabled" : ""}/> Usar no anúncio</label>${this.access.photos && !this.editor.part.archived_at ? `<div class="action-bar"><button data-photo-cover="${p.id}" type="button" ${p.is_cover ? "disabled" : ""}>Capa</button><button data-photo-shift="${p.id}" data-shift="-1" type="button" aria-label="Mover fotografia para esquerda" ${i === 0 ? "disabled" : ""}>←</button><button data-photo-shift="${p.id}" data-shift="1" type="button" aria-label="Mover fotografia para direita" ${i === photos.length - 1 ? "disabled" : ""}>→</button><button data-photo-archive="${p.id}" type="button">Remover</button></div>${p.kind === "original" ? `<label class="field"><span class="photo-badge">Anexar versão editada</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-edited-photo="${p.id}"/></label>` : ""}` : ""}</article>`).join("")}${Array.from({ length: Math.max(0, 2 - photos.filter((p) => p.kind === "original").length) }, (_, i) => `<div class="photo-placeholder"><strong>Fotografia ${i + photos.filter((p) => p.kind === "original").length + 1}</strong><span>Adicione o original</span></div>`).join("")}</div>`;
    $("#tab-photos").textContent = `Fotografias (${photos.length})`;
    const pendingPrefix = `partiva-upload:${this.data.user.id}:${this.editor.id}:`;
    if (
      this.access.photos &&
      Object.keys(localStorage).some((key) => key.startsWith(pendingPrefix))
    ) {
      root.insertAdjacentHTML(
        "afterbegin",
        '<p class="notice warning">Há envio(s) concluído(s) que ainda precisam ser vinculados ao cadastro. <button class="link-button" id="recover-uploads" type="button">Concluir vínculo das fotografias</button></p>',
      );
      $("#recover-uploads").onclick = () =>
        this.run(async () => {
          for (const key of Object.keys(localStorage).filter((key) =>
            key.startsWith(pendingPrefix),
          )) {
            const payload = JSON.parse(localStorage.getItem(key));
            await this.repo.rpc("photo_action", {
              pid: this.editor.id,
              command: "register",
              payload,
            });
            localStorage.removeItem(key);
          }
          await this.syncEditor();
          this.renderPhotos();
        }, "Vínculos das fotografias concluídos");
    }
    $("#photo-files")?.addEventListener(
      "change",
      (e) => void this.uploadPhotos([...e.target.files]),
    );
    root
      .querySelectorAll("[data-edited-photo]")
      .forEach(
        (input) =>
          (input.onchange = () =>
            void this.uploadPhotos(
              [...input.files],
              input.dataset.editedPhoto,
            )),
      );
    root.querySelectorAll("[data-photo-select]").forEach(
      (input) =>
        (input.onchange = () =>
          this.photoCommand("select", {
            id: input.dataset.photoSelect,
            selected: input.checked,
          })),
    );
    root
      .querySelectorAll("[data-photo-cover]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            this.photoCommand("cover", { id: b.dataset.photoCover })),
      );
    root.querySelectorAll("[data-photo-archive]").forEach(
      (b) =>
        (b.onclick = () => {
          if (confirm("Remover da galeria, preservando o arquivo original?"))
            this.photoCommand("archive", { id: b.dataset.photoArchive });
        }),
    );
    root.querySelectorAll("[data-photo-shift]").forEach(
      (b) =>
        (b.onclick = () => {
          const ids = photos.map((p) => p.id),
            i = ids.indexOf(b.dataset.photoShift),
            j = i + Number(b.dataset.shift);
          [ids[i], ids[j]] = [ids[j], ids[i]];
          this.photoCommand("reorder", { ids });
        }),
    );
    root.querySelectorAll("[data-preview-photo]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = photos.find((p) => p.id === b.dataset.previewPhoto),
            modal = this.action(
              "Fotografia da peça",
              `<img data-path="${h(p.storage_path)}" alt="Fotografia ampliada" style="width:100%;max-height:70vh;object-fit:contain"/>`,
              null,
            );
          this.hydrateImages(modal);
        }),
    );
    this.hydrateImages(root);
  },
  photoCommand(command, payload) {
    return this.run(async () => {
      if (this.editor.dirty) await this.savePiece();
      await this.repo.rpc("photo_action", {
        pid: this.editor.id,
        command,
        payload,
      });
      await this.syncEditor();
      this.renderPhotos();
    }, "Fotografias atualizadas");
  },
  async uploadPhotos(files, originalId) {
    if (!files.length || this.uploading) return;
    this.uploading = true;
    $("#panel-photos")
      .querySelectorAll("input,button")
      .forEach((input) => {
        input.disabled = true;
      });
    const progress = $("#upload-progress");
    progress.innerHTML = "";
    try {
      if (this.access.parts && (!this.editor.version || this.editor.dirty))
        await this.savePiece(true);
      if (!this.editor.version)
        throw new Error("Salve o cadastro antes de enviar fotografias.");
      for (const file of files) {
        validatePhoto(file);
        const box = document.createElement("div"),
          label = document.createElement("span"),
          meter = document.createElement("progress");
        label.textContent = file.name;
        meter.max = 100;
        meter.value = 0;
        box.append(label, meter);
        progress.append(box);
        const id = crypto.randomUUID(),
          ext = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/avif": "avif",
          }[file.type],
          path = `${this.data.company.id}/${this.editor.id}/${id}.${ext}`;
        const preview = document.createElement("img");
        preview.src = URL.createObjectURL(file);
        preview.alt = `Prévia de ${file.name}`;
        preview.style.cssText = "width:80px;height:60px;object-fit:contain";
        box.prepend(preview);
        try {
          await this.repo.upload("part-photos", path, file, (v) => {
            meter.value = v;
          });
          const payload = {
            id,
            storage_path: path,
            original_photo_id: originalId || null,
            mime_type: file.type,
            size_bytes: file.size,
          };
          const pendingKey = `partiva-upload:${this.data.user.id}:${this.editor.id}:${id}`;
          try {
            localStorage.setItem(pendingKey, JSON.stringify(payload));
          } catch {}
          await this.repo.rpc("photo_action", {
            pid: this.editor.id,
            command: "register",
            payload: {
              id,
              storage_path: path,
              original_photo_id: originalId || null,
              mime_type: file.type,
              size_bytes: file.size,
            },
          });
          localStorage.removeItem(pendingKey);
          meter.value = 100;
          label.textContent = `${file.name} — salvo`;
          this.lastStorageSuccess = true;
        } finally {
          URL.revokeObjectURL(preview.src);
        }
      }
      await this.syncEditor();
      this.notify("Fotografias salvas");
    } catch (e) {
      this.notify(e.message, true);
      $("#editor-error").textContent = e.message;
    } finally {
      this.uploading = false;
      this.renderPhotos();
    }
  },
  renderPieceActions() {
    const p = this.editor.part,
      pending = this.missing(p),
      root = $("#panel-actions");
    root.innerHTML = `<h3>Andamento operacional</h3><label class="field"><span>Etapa atual</span><select id="piece-destination" ${!this.access.parts || p.archived_at ? "disabled" : ""}>${options(
      this.data.columns.map((c) => [c.id, c.name]),
      p.column_id,
    )}</select></label><div class="finance-summary"><div><span>Anúncio</span><strong>${h(LISTING_LABELS[p.listing_status])}</strong></div><div><span>Disponibilidade</span><strong>${h(SALE_LABELS[p.sale_status])}</strong></div></div><h3>Pendências para anúncio</h3>${pending.length ? `<ul class="pending-list">${pending.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : '<p class="notice success">Informações e fotografias essenciais completas.</p>'}<p class="notice">Mercado Livre: integração não conectada. Marcar como pronto registra apenas a revisão interna.</p><div class="action-bar">${this.access.parts && !p.archived_at ? `<button id="mark-ready" class="primary-button" type="button" ${pending.length ? "disabled" : ""}>Marcar anúncio pronto</button>` : ""}${this.access.sales && !p.archived_at && !p.legacy_hold ? (p.sale_status === "available" ? '<button class="secondary-button" data-sale-action="reserve" type="button">Reservar</button>' : "") + (p.sale_status !== "sold" ? '<button class="secondary-button" data-sale-action="sell_local" type="button">Venda presencial</button><button class="secondary-button" data-sale-action="sell_online" type="button">Registrar venda online confirmada</button>' : "") + (p.sale_status === "reserved" ? '<button class="secondary-button" data-sale-action="release" type="button">Cancelar reserva</button>' : "") + (p.sale_status === "sold" ? '<button class="secondary-button" data-sale-action="cancel" type="button">Cancelar venda</button>' : "") : ""}${p.legacy_hold && this.access.admin ? '<button id="release-legacy-hold" class="secondary-button" type="button">Retirar do repouso</button>' : ""}${this.access.parts ? `<button id="archive-piece" class="danger-button" type="button">${p.archived_at ? "Restaurar peça" : "Excluir da operação"}</button>` : ""}</div>`;
    $("#release-legacy-hold")?.addEventListener("click", () =>
      this.run(async () => {
        if (!confirm("Liberar a disponibilidade desta peça em repouso?"))
          return;
        await this.repo.rpc("release_legacy_hold", {
          pid: p.id,
          expected_version: p.version,
        });
        await this.syncEditor();
        this.renderPieceActions();
      }, "Disponibilidade liberada"),
    );
    $("#piece-destination").onchange = (e) =>
      this.run(async () => {
        if (this.editor.dirty) await this.savePiece();
        await this.move(p.id, e.target.value);
        await this.syncEditor();
        this.renderPieceActions();
      }, "Etapa salva");
    $("#mark-ready")?.addEventListener("click", () =>
      this.run(async () => {
        if (this.editor.dirty) await this.savePiece();
        await this.repo.rpc("part_action", {
          pid: p.id,
          command: "ready",
          expected_version: this.editor.version,
        });
        await this.syncEditor();
        this.renderPieceActions();
      }, "Anúncio preparado"),
    );
    $("#archive-piece")?.addEventListener("click", () =>
      this.run(async () => {
        if (
          !confirm(
            p.archived_at
              ? "Restaurar esta peça?"
              : "Excluir da operação? Identificador, arquivos e histórico serão preservados.",
          )
        )
          return;
        if (this.editor.dirty) await this.savePiece();
        await this.repo.rpc("part_action", {
          pid: p.id,
          command: p.archived_at ? "restore" : "archive",
          expected_version: this.editor.version,
        });
        this.editor = null;
        $("#piece-dialog").close();
        await this.refresh();
      }, "Operação concluída"),
    );
    root
      .querySelectorAll("[data-sale-action]")
      .forEach(
        (b) => (b.onclick = () => this.saleDialog(b.dataset.saleAction)),
      );
  },
  saleDialog(command) {
    const p = this.editor.part,
      selling = command.startsWith("sell_"),
      request_id = crypto.randomUUID();
    this.action(
      {
        reserve: "Reservar peça",
        release: "Cancelar reserva",
        sell_local: "Registrar venda presencial",
        sell_online: "Registrar venda online confirmada",
        cancel: "Cancelar venda",
      }[command],
      `<p><strong>#${h(p.internal_number)} — ${h(p.part_name)}</strong></p>${selling ? field("amount", "Valor recebido (R$)", p.price_cents == null ? "" : (p.price_cents / 100).toFixed(2).replace(".", ","), 'inputmode="decimal" required') : ""}${command === "sell_online" ? `${field("external_order_id", "Número do pedido externo", "", 'required maxlength="250"')}<label class="check-field"><input name="confirmed" type="checkbox" required/> Confirmei que esta venda online ocorreu de verdade.</label><p class="muted">Registro manual, sem consulta à API do marketplace.</p>` : ""}<label class="field"><span>${["release", "cancel"].includes(command) ? "Motivo do cancelamento" : "Observações"}</span><textarea name="note" maxlength="1000" ${["release", "cancel"].includes(command) ? 'required minlength="3"' : ""}></textarea></label>`,
      async (form) => {
        if (this.editor.dirty) await this.savePiece();
        await this.repo.rpc("sale_action", {
          pid: p.id,
          command,
          payload: {
            request_id,
            version: this.editor.version,
            amount_cents: selling ? cents(form.get("amount")) : null,
            external_order_id: form.get("external_order_id"),
            confirmed: form.get("confirmed") === "on",
            note: form.get("note"),
            customer: form.get("customer"),
          },
        });
        await this.syncEditor();
        this.renderPieceActions();
        this.notify("Operação de venda salva");
      },
      "Confirmar operação",
    );
    if (command === "reserve")
      $("#action-error").insertAdjacentHTML(
        "beforebegin",
        field(
          "customer",
          "Cliente / responsável pela retirada",
          "",
          'maxlength="200"',
        ),
      );
  },
  renderHistory() {
    $("#panel-history").innerHTML =
      legacyHistory(this.editor.part, this.data.legacyDrafts || []) +
      this.timeline(
        this.data.events
          .filter((e) => e.part_id === this.editor.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
  },
};
