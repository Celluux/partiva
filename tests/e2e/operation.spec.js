import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:5199/test/reset");
  await page.route(
    "https://jelqadbfyfmouulhsvvs.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: `http://127.0.0.1:5199${url.pathname}${url.search}`,
        maxRetries: route.request().method() === "GET" ? 2 : 0,
      });
      await route.fulfill({ response });
    },
  );
  await page.routeWebSocket(/supabase.co\/realtime/, (ws) => ws.close());
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});
async function login(page, role = "admin") {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("Correct-password1");
  await page
    .getByRole("button", { name: "Entrar no Partiva", exact: true })
    .click();
  await expect(page.locator("#application")).toBeVisible();
}
async function draft(page, name = "Motor") {
  await page.getByRole("button", { name: "+ Nova peça", exact: true }).click();
  await page.getByLabel("Nome / tipo da peça", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#save-status")).toHaveText("Salvo no banco");
}
test("creates and edits partial drafts, persists and synchronizes the table", async ({
  page,
}) => {
  await login(page);
  await draft(page);
  const id = await page
    .getByLabel("Identificador interno", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "3. Anúncio e preço", exact: true })
    .click();
  await expect(
    page.getByLabel("Identificador interno", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page
    .getByLabel("Preço de anúncio (R$)", { exact: true })
    .fill("123,45");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#save-status")).toHaveText("Salvo no banco");
  await page.locator("#done-piece").click();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("123,45");
  await page.reload();
  await expect(page.locator("#application")).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(`Abrir peça ${id} Motor`) })
    .click();
  await page
    .getByRole("button", { name: "3. Anúncio e preço", exact: true })
    .click();
  await expect(
    page.getByLabel("Preço de anúncio (R$)", { exact: true }),
  ).toHaveValue("123,45");
});
test("shows conditional fields, suggests a title and warns about repeated Detran", async ({
  page,
}) => {
  await login(page);
  await draft(page, "Farol");
  await page
    .getByRole("button", { name: "2. Veículo e aplicação", exact: true })
    .click();
  await expect(page.getByLabel("Lado", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "1. Identificação", exact: true })
    .click();
  await page.getByLabel("Número do Detran", { exact: true }).fill("DETRAN-42");
  await page
    .getByRole("button", { name: "2. Veículo e aplicação", exact: true })
    .click();
  await page.getByLabel("Marca", { exact: true }).fill("Fiat");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#save-status")).toHaveText("Salvo no banco");
  await page.locator("#done-piece").click();
  await draft(page, "Motor");
  await expect(page.locator("#side-field")).toBeHidden();
  await page.getByLabel("Número do Detran", { exact: true }).fill("DETRAN-42");
  await expect(page.locator("#detran-warning")).toBeVisible();
  await page
    .getByRole("button", { name: "3. Anúncio e preço", exact: true })
    .click();
  await expect(
    page.getByLabel("Título do anúncio", { exact: true }),
  ).toHaveValue("Motor");
});
test("preserves original photos, edited versions, order, cover and history", async ({
  page,
}) => {
  await login(page);
  await draft(page);
  await page.getByRole("tab", { name: /Fotografias/ }).click();
  await expect(page.locator(".photo-placeholder")).toHaveCount(2);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVXsAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("#photo-files").setInputFiles([
    { name: "original1.png", mimeType: "image/png", buffer: image },
    { name: "original2.png", mimeType: "image/png", buffer: image },
  ]);
  await expect(page.locator(".photo-tile")).toHaveCount(2);
  await page.locator("[data-edited-photo]").first().setInputFiles({
    name: "edited.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.locator(".photo-tile")).toHaveCount(3);
  await expect(page.locator(".photo-tile").last()).toContainText(
    "Versão editada",
  );
  await page.locator("[data-photo-cover]").last().click();
  await expect(page.locator(".photo-tile").last()).toContainText("Capa");
  await page.getByRole("tab", { name: "Histórico", exact: true }).click();
  await expect(page.locator("#panel-history")).toContainText(
    "Fotografia adicionada",
  );
});
test("moves cards backwards and safely deletes their first column", async ({
  page,
}) => {
  await login(page);
  await draft(page);
  await page.getByRole("tab", { name: "Anúncio e venda" }).click();
  await page
    .getByLabel("Etapa atual")
    .selectOption({ label: "Fotografias pendentes" });
  await expect(page.locator("#toast")).toContainText("Etapa salva");
  await page.getByLabel("Etapa atual").selectOption({ label: "Cadastro" });
  await expect(page.locator("#piece-destination option:checked")).toHaveText(
    "Cadastro",
  );
  await page.locator("#done-piece").click();
  await page
    .getByRole("button", { name: "Configurar Cadastro", exact: true })
    .click();
  await page
    .locator("#column-destination")
    .selectOption({ label: "Fotografias pendentes" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir esta coluna" }).click();
  await expect(
    page.getByRole("button", { name: "Configurar Cadastro", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Abrir peça .* Motor/ }),
  ).toBeVisible();
  await expect(
    page.locator(".kanban-column").filter({
      has: page
        .locator(".column-header strong")
        .filter({ hasText: /^Fotografias pendentes$/ }),
    }),
  ).toContainText("Motor");
});
test("edits company settings and preserves distinct sales and operational states", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Minha Empresa", exact: true })
    .click();
  await page
    .getByLabel("Nome fantasia", { exact: true })
    .fill("Desmonte Interno");
  await page
    .getByLabel("Taxa percentual estimada do Mercado Livre (%)")
    .fill("14");
  await page.getByLabel("Taxa estimada conferida pela empresa").check();
  await page
    .getByRole("button", { name: "Salvar empresa e configurações" })
    .click();
  await expect(page.locator("#company-name")).toHaveText("Desmonte Interno");
  await page
    .getByRole("button", { name: "Quadro operacional", exact: true })
    .click();
  await draft(page);
  await page.getByRole("tab", { name: "Anúncio e venda" }).click();
  await page.getByRole("button", { name: "Reservar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar operação", exact: true })
    .click();
  await expect(page.locator("#panel-actions")).toContainText("Reservada");
  await expect(page.locator("#piece-destination option:checked")).toHaveText(
    "Cadastro",
  );
  await page
    .getByRole("button", { name: "Venda presencial", exact: true })
    .click();
  await page.getByLabel("Valor recebido (R$)").fill("200,00");
  await page
    .getByRole("button", { name: "Confirmar operação", exact: true })
    .click();
  await expect(page.locator("#panel-actions")).toContainText("Vendida");
  await expect(
    page.getByRole("button", { name: "Venda presencial", exact: true }),
  ).toHaveCount(0);
});
test("enforces read-only employee UI and keeps no public organization signup", async ({
  page,
}) => {
  await login(page, "viewer");
  await expect(
    page.getByRole("button", { name: "+ Nova peça", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Minha Empresa", exact: true })
    .click();
  await expect(page.getByLabel("Razão social", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Convidar funcionário" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Criar conta grátis", { exact: true }),
  ).toHaveCount(0);
});
test("supports mobile navigation and keyboard dismissal without losing drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await draft(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#piece-dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Peças em tabela", exact: true })
    .click();
  await expect(page.getByRole("table")).toContainText("Motor");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
test("recovers unsaved input after a failed network save", async ({ page }) => {
  await login(page);
  await page.route("**/rest/v1/rpc/save_part", (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "+ Nova peça", exact: true }).click();
  await page
    .getByLabel("Nome / tipo da peça", { exact: true })
    .fill("Motor recuperável");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#toast")).toContainText(/fetch|Failed|conexão/i);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("partiva-recovery:")),
    ),
  ).toBe(true);
  await page.unroute("**/rest/v1/rpc/save_part");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.locator("#application")).toBeVisible();
  await page
    .getByRole("button", { name: "Recuperar rascunho", exact: true })
    .click();
  await page.getByRole("button", { name: /Motor recuperável —/ }).click();
  await expect(
    page.getByLabel("Nome / tipo da peça", { exact: true }),
  ).toHaveValue("Motor recuperável");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#save-status")).toHaveText("Salvo no banco");
});
test("persists table choices and applies combined filters", async ({
  page,
}) => {
  await login(page);
  await draft(page, "Motor");
  await page.locator("#done-piece").click();
  await draft(page, "Farol");
  await page.locator("#done-piece").click();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await page
    .getByRole("button", { name: "Colunas da tabela", exact: true })
    .click();
  await page.getByLabel("Complementar", { exact: true }).check();
  await page.locator("#action-submit").click();
  await expect(
    page.getByRole("columnheader", { name: "Complementar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.locator("[data-filter=category]").selectOption("Elétrica");
  await page.locator("[data-filter=sale]").selectOption("available");
  await expect(page.getByRole("table")).toContainText("Farol");
  await expect(page.getByRole("table")).not.toContainText("Motor");
  await page.reload();
  await expect(page.locator("#application")).toBeVisible();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Complementar", exact: true }),
  ).toBeVisible();
});
test("moves cards by dragging and updates a second employee session", async ({
  page,
  browser,
}) => {
  await login(page);
  await draft(page, "Motor");
  await page.locator("#done-piece").click();
  const context = await browser.newContext();
  const second = await context.newPage();
  await second.route(
    "https://jelqadbfyfmouulhsvvs.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: `http://127.0.0.1:5199${url.pathname}${url.search}`,
        maxRetries: route.request().method() === "GET" ? 2 : 0,
      });
      await route.fulfill({ response });
    },
  );
  await second.routeWebSocket(/supabase.co\/realtime/, (ws) => ws.close());
  try {
    await login(second, "operator");
    const card = page.locator("[data-drag-piece]").first();
    const destination = page
      .locator(".kanban-column")
      .filter({
        has: page
          .locator(".column-header strong")
          .filter({ hasText: /^Fotografias pendentes$/ }),
      });
    await card.dragTo(destination);
    await expect(destination).toContainText("Motor");
    await second
      .getByRole("button", { name: "Atualizar", exact: true })
      .click();
    await expect(
      second
        .locator(".kanban-column")
        .filter({
          has: second
            .locator(".column-header strong")
            .filter({ hasText: /^Fotografias pendentes$/ }),
        }),
    ).toContainText("Motor");
  } finally {
    await second.unrouteAll({ behavior: "wait" });
    await context.close();
  }
});
