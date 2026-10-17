import { legacyDraftList } from "./legacy-view.js";
import { ROLES, cents, validatePhoto, legacyPayload } from "./domain.js";
import { $, h, field, options } from "./ui.js";
export const companyMethods = {
  renderCompany() {
    const w = this.data.company,
      admin = this.access.admin,
      a = w.address || {},
      prefs = w.preferences || {};
    $("#workspace-content").innerHTML =
      `<div class="workspace-panel company-layout"><div><h1>Minha Empresa</h1><p class="muted">Uma empresa, com acessos individuais para a equipe.</p>${!admin ? '<p class="notice">Alterações e gestão de acessos são exclusivas dos administradores.</p>' : ""}</div><section class="settings-card"><h2>Dados cadastrais</h2><form id="company-form"><fieldset class="form-section" ${!admin ? "disabled" : ""}><div class="form-grid">${field("legal_name", "Razão social", w.legal_name, 'maxlength="250"')}${field("trade_name", "Nome fantasia", w.trade_name, 'maxlength="250"')}${field("tax_id", "CNPJ", w.tax_id, 'inputmode="numeric" maxlength="18"')}${field("phone", "Telefone", w.phone, 'type="tel" maxlength="40"')}${field("email", "E-mail", w.email, 'type="email" maxlength="250"')}${field("street", "Endereço", a.street, 'maxlength="250"')}${field("number", "Número", a.number, 'maxlength="30"')}${field("complement", "Complemento", a.complement, 'maxlength="100"')}${field("district", "Bairro", a.district, 'maxlength="100"')}${field("city", "Cidade", a.city, 'maxlength="100"')}${field("state", "UF", a.state, 'maxlength="2"')}${field("zip", "CEP", a.zip, 'maxlength="10"')}<label class="field full-width"><span>Logotipo da empresa</span><input type="file" id="company-logo-file" accept="image/jpeg,image/png,image/webp,image/avif"/><small>Armazenamento privado. A identidade da instalação é preservada.</small></label></div></fieldset><h2>Configurações comerciais</h2><fieldset class="form-section" ${!admin ? "disabled" : ""}><div class="form-grid">${field("fee_percent", "Taxa percentual estimada do Mercado Livre (%)", w.fee_percent, 'type="number" min="0" max="100" step="0.01" required')}${field("fee_fixed", "Parcela fixa estimada (R$)", (w.fee_fixed_cents / 100).toFixed(2).replace(".", ","), 'inputmode="decimal" required')}<label class="check-field full-width"><input type="checkbox" name="fee_configured" ${w.fee_configured ? "checked" : ""}/> Taxa estimada conferida pela empresa</label></div><p class="muted">Estimativa interna ajustável. Valores reais dependem das condições do marketplace.</p></fieldset><h2>Preferências operacionais</h2><fieldset class="form-section" ${!admin ? "disabled" : ""}><div class="form-grid">${field("minimum_photos", "Mínimo de fotografias no anúncio", prefs.minimum_photos || 2, 'type="number" min="2" max="30" required')}${field("default_brand", "Marca sugerida em novos cadastros", prefs.default_brand, 'maxlength="250"')}${field("default_model", "Modelo sugerido em novos cadastros", prefs.default_model, 'maxlength="250"')}</div></fieldset><p class="notice error form-error" id="company-error" role="alert"></p>${admin ? '<div class="company-form-actions action-bar"><button type="submit" class="primary-button" id="company-save">Salvar empresa e configurações</button><button type="button" class="secondary-button" id="company-discard">Descartar preenchimento</button></div>' : ""}</form></section>${legacyDraftList(this.data.legacyDrafts || [], this.data.pieces)}${admin ? this.employeeMarkup() : ""}<section class="settings-card"><h2>Integrações</h2><div class="integration-row"><span>Supabase — banco e autenticação</span><strong>Conectado à instalação configurada</strong></div><div class="integration-row"><span>Fotografias — Storage privado</span><strong>${this.lastStorageSuccess ? "Envio confirmado nesta sessão" : "Envio ainda não verificado nesta sessão"}</strong></div><div class="integration-row"><span>Mercado Livre — API oficial</span><strong>Não conectado</strong></div><div class="integration-row"><span>Convites — backend seguro</span><strong id="worker-status">Verificando…</strong></div><p class="muted">Nenhum anúncio é publicado automaticamente. Nenhuma venda online é inferida pela etapa operacional.</p></section>${admin ? '<section class="settings-card"><h2>Preservação de dados anteriores</h2><p class="muted">Importação controlada das peças locais deste navegador. A origem será preservada.</p><button class="secondary-button" id="legacy-import" type="button">Conferir e importar dados locais</button></section>' : ""}</div>`;
    if (admin)
      $("#workspace-content .company-layout").insertAdjacentHTML(
        "beforeend",
        `<section class="settings-card"><h2>Histórico da empresa e dos acessos</h2>${this.timeline([...(this.data.companyEvents || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100))}</section>`,
      );
    $("#company-form").oninput = () => {
      this.companyDirty = true;
    };
    $("#company-discard")?.addEventListener("click", () => {
      this.companyDirty = false;
      this.renderCompany();
    });
    $("#company-form").onsubmit = async (e) => {
      e.preventDefault();
      if (!admin) return;
      $("#company-save").disabled = true;
      $("#company-error").textContent = "";
      try {
        const f = new FormData(e.currentTarget);
        let logo_path = w.logo_path;
        const file = $("#company-logo-file").files[0];
        if (file) {
          validatePhoto(file);
          const ext = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/avif": "avif",
          }[file.type];
          logo_path = `${w.id}/logo/${crypto.randomUUID()}.${ext}`;
          await this.repo.upload("company-assets", logo_path, file);
          this.lastStorageSuccess = true;
        }
        const payload = {};
        for (const key of ["legal_name", "trade_name", "phone", "email"])
          payload[key] = String(f.get(key) || "").trim();
        payload.tax_id = String(f.get("tax_id") || "").replace(/\D/g, "");
        payload.address = Object.fromEntries(
          [
            "street",
            "number",
            "complement",
            "district",
            "city",
            "state",
            "zip",
          ].map((key) => [key, String(f.get(key) || "").trim()]),
        );
        payload.logo_path = logo_path;
        payload.fee_percent = Number(f.get("fee_percent"));
        payload.fee_fixed_cents = cents(f.get("fee_fixed"));
        payload.fee_configured = f.get("fee_configured") === "on";
        payload.preferences = {
          ...prefs,
          minimum_photos: Number(f.get("minimum_photos")),
          default_brand: String(f.get("default_brand") || "").trim(),
          default_model: String(f.get("default_model") || "").trim(),
        };
        await this.repo.rpc("company_save", {
          payload,
          expected_version: w.version,
        });
        this.companyDirty = false;
        await this.refresh();
        this.notify("Empresa e configurações salvas");
      } catch (error) {
        $("#company-error").textContent = error.message;
      } finally {
        const button = $("#company-save");
        if (button) button.disabled = false;
      }
    };
    $("#invite-employee")?.addEventListener("click", () =>
      this.inviteEmployee(),
    );
    document
      .querySelectorAll(".employee-row input,.employee-row select")
      .forEach((input) => {
        input.oninput = () => {
          this.memberDirty = true;
        };
        input.onchange = () => {
          this.memberDirty = true;
        };
      });
    document.querySelectorAll("[data-save-member]").forEach(
      (b) =>
        (b.onclick = () =>
          this.run(async () => {
            const row = b.closest(".employee-row");
            await this.repo.rpc("member_save", {
              uid: b.dataset.saveMember,
              new_role: row.querySelector("select").value,
              enabled: row.querySelector("input[type=checkbox]").checked,
              label: row.querySelector("input[type=text]").value,
            });
            this.memberDirty = false;
            await this.refresh();
          }, "Acesso atualizado")),
    );
    document
      .querySelectorAll("[data-open-legacy-piece]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openPiece(button.dataset.openLegacyPiece),
        ),
      );
    $("#legacy-import")?.addEventListener("click", () => this.importLegacy());
    void fetch(`${this.repo.config.api.replace(/\/$/, "")}/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = await response.json();
        if ($("#worker-status"))
          $("#worker-status").textContent = body.invitesConfigured
            ? "Configurado; convites exigem administrador"
            : "Credenciais do backend pendentes";
      })
      .catch(() => {
        if ($("#worker-status"))
          $("#worker-status").textContent = "Backend indisponível";
      });
  },
  employeeMarkup() {
    return `<section class="settings-card"><div class="section-title-row"><h2>Funcionários e permissões</h2><button class="secondary-button" id="invite-employee" type="button">Convidar funcionário</button></div><p class="muted">Administrador: empresa e acessos. Operação: peças, fotos e colunas. Fotografias: galeria. Vendas: cadastro, reservas e vendas. Consulta: leitura.</p>${this.data.members
      .map(
        (m) =>
          `<div class="employee-row"><div><label class="field"><span>Funcionário</span><input type="text" maxlength="100" value="${h(m.display_name)}" aria-label="Nome do funcionário"/></label><p><small>${h(m.email || m.user_id)}</small></p></div><label class="field"><span>Perfil</span><select>${options(
            Object.entries(ROLES).filter(
              ([key]) => !["owner", "manager"].includes(key),
            ),
            ["owner", "manager"].includes(m.role) ? "admin" : m.role,
          )}</select></label><label class="check-field"><input type="checkbox" ${m.active ? "checked" : ""}/> Ativo</label><button class="secondary-button" data-save-member="${m.user_id}" type="button">Salvar acesso</button></div>`,
      )
      .join("")}</section>`;
  },
  inviteEmployee() {
    this.action(
      "Convidar funcionário",
      `${field("email", "E-mail do funcionário", "", 'type="email" required maxlength="250"')}${field("name", "Nome", "", 'required maxlength="100"')}<label class="field"><span>Permissão</span><select name="role" required>${options(
        Object.entries(ROLES).filter(
          ([key]) => !["owner", "manager"].includes(key),
        ),
        "operator",
      )}</select></label><p class="muted">O convite será enviado pelo Supabase Auth. A chave administrativa fica exclusivamente no backend.</p>`,
      async (f) => {
        await this.repo.invite({
          email: f.get("email"),
          name: f.get("name"),
          role: f.get("role"),
        });
        await this.refresh();
        this.notify("Convite enviado pelo Supabase Auth");
      },
      "Enviar convite",
    );
  },
  importLegacy() {
    let old;
    try {
      old = JSON.parse(localStorage.getItem("partiva-board-v1") || "null");
    } catch {
      this.notify("Conteúdo local ilegível. Nenhum dado foi alterado.", true);
      return;
    }
    if (!old?.pieces?.length) {
      this.notify("Nenhuma peça da versão anterior neste navegador.");
      return;
    }
    this.action(
      "Conferir importação de dados locais",
      `<p>Encontradas <strong>${old.pieces.length} peças</strong>. Confira se são dados reais ou exemplos. A origem permanecerá intacta.</p><ul class="pending-list">${old.pieces.map((p) => `<li>${h(p.code)} — ${h(p.title)}</li>`).join("")}</ul><label class="check-field"><input type="checkbox" required/> Conferi e quero importar estes registros.</label>`,
      async () => {
        const destinations = new Map();
        for (const column of old.columns || []) {
          const existing = this.data.columns.find(
            (item) =>
              item.name.trim().toLowerCase() ===
              column.name.trim().toLowerCase(),
          );
          if (existing) {
            destinations.set(column.id, existing.id);
            continue;
          }
          await this.repo.rpc("column_action", {
            command: "create",
            payload: {
              name: column.name,
              color: /^#[a-f0-9]{6}$/i.test(column.color)
                ? column.color
                : "#0e6b6e",
              phase: "registration",
            },
          });
          await this.refresh();
          destinations.set(
            column.id,
            this.data.columns.find((item) => item.name === column.name).id,
          );
        }
        for (const piece of old.pieces)
          await this.repo.rpc("save_part", {
            payload: {
              ...legacyPayload(piece, "partiva-board-v1"),
              column_id:
                destinations.get(piece.columnId) || this.data.columns[0]?.id,
            },
            expected_version: null,
          });
        await this.refresh();
        this.notify("Importação concluída sem apagar a origem");
      },
      "Importar registros conferidos",
    );
  },
};
