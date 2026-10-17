import { test, expect } from "@playwright/test";

// The browser runs the actual frontend; this transport uses the isolated
// PostgreSQL/RLS fixture. These tests never create or edit remote records.
test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:5199/test/reset");
  await page.route(
    "https://twtldgdceidyurinrvsy.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: `http://127.0.0.1:5199${url.pathname}${url.search}`,
        maxRetries: route.request().method() === "GET" ? 2 : 0,
      });
      try {
        await route.fulfill({ response });
      } catch (error) {
        if (!String(error.message).includes("Route is already handled"))
          throw error;
      }
    },
  );
  await page.routeWebSocket(/supabase.co\/realtime/, (ws) => ws.close());
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function login(page, role = "admin") {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("Correct-password1");
  await page
    .getByRole("button", { name: "Entrar no Partiva", exact: true })
    .click();
  await expect(page.locator("#application")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".overview-page")).toBeVisible();
}

async function navigate(page, view) {
  const item = page.locator(`[data-nav="${view}"]`);
  if (!(await item.isVisible()))
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  await item.click();
  await expect(item).toHaveAttribute("aria-current", "page");
}

async function expectFilterRoute(page, filters) {
  await expect(page).toHaveURL(/#\/table(?:\?|$)/);
  for (const [key, value] of Object.entries(filters))
    await expect
      .poll(() => {
        const query = new URL(page.url()).hash.split("?")[1] || "";
        return new URLSearchParams(query).get(key);
      })
      .toBe(value);
  // An empty filtered catalog intentionally renders an explanatory state.
  await expect(
    page.locator(
      "#workspace-content .parts-table, #workspace-content .empty-state",
    ),
  ).toBeVisible();
}

async function createDraft(page, name = "Motor do dashboard") {
  await page
    .getByRole("button", { name: "Cadastrar peça", exact: true })
    .click();
  await page.getByLabel("Nome / tipo da peça", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await expect(page.locator("#save-status")).toHaveText("Salvo no banco");
  const number = await page
    .getByLabel("Identificador interno", { exact: true })
    .inputValue();
  await page.locator("#done-piece").click();
  await expect(page.locator("#piece-dialog")).not.toBeVisible();
  await expect(page.locator(".overview-recent")).toContainText(
    "Peça cadastrada",
  );
  return number;
}

const metricValue = (page, key) =>
  page.locator(`[data-metric="${key}"] [data-metric-value]`);
const stageCount = (page, phase) =>
  page.locator(`[data-stage="${phase}"] [data-stage-count]`);
const stages = [
  "registration",
  "photos_pending",
  "photos_edited",
  "listing",
  "publication",
];

test("overview is the initial page and all eight sections survive reload and browser back", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator('[data-nav="overview"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const view of [
    "board",
    "table",
    "listings",
    "sales",
    "reservations",
    "activity",
    "company",
    "overview",
  ]) {
    await navigate(page, view);
    await expect(page).toHaveURL(new RegExp(`#/${view}$`));
    await expect(page.locator("#workspace-content")).not.toBeEmpty();
    await page.reload();
    await expect(page.locator(`[data-nav="${view}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.goBack();
  await expect(page.locator('[data-nav="company"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goForward();
  await expect(page.locator(".overview-page")).toBeVisible();
});

test("empty indicators remain zero and all five stages open the corresponding filtered table", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator("[data-metric-value]")).toHaveCount(7);
  for (const key of [
    "total",
    "active",
    "photos",
    "ready",
    "historical",
    "reserved",
    "sold",
  ])
    await expect(metricValue(page, key)).toHaveText("0");
  await expect(page.locator(".overview-page")).not.toContainText("NaN");
  for (const phase of stages) {
    await expect(stageCount(page, phase)).toHaveText("0");
    await page.locator(`[data-stage="${phase}"]`).click();
    await expectFilterRoute(page, { scope: "operational", phase });
    await page.reload();
    await expectFilterRoute(page, { scope: "operational", phase });
    await navigate(page, "overview");
  }
});

test("a persisted draft and a real workflow move update overview and filtered catalog together", async ({
  page,
}) => {
  await login(page);
  const number = await createDraft(page);
  await expect(metricValue(page, "total")).toHaveText("1");
  await expect(metricValue(page, "active")).toHaveText("1");
  await expect(stageCount(page, "registration")).toHaveText("1");
  await page.locator(`.overview-catalog [data-overview-piece]`).click();
  await page.getByRole("tab", { name: "Anúncio e venda", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Etapa atual", exact: true })
    .selectOption({ label: "Fotografias pendentes" });
  await expect(page.locator("#toast")).toContainText("Etapa salva");
  await page.locator("#done-piece").click();
  await expect(stageCount(page, "registration")).toHaveText("0");
  await expect(stageCount(page, "photos_pending")).toHaveText("1");
  await expect(metricValue(page, "photos")).toHaveText("1");
  await expect(
    page.locator('.workflow-step[data-stage="photos_pending"]'),
  ).toContainText("1 com pendências");
  await page.locator('[data-stage="photos_pending"]').click();
  await expectFilterRoute(page, {
    scope: "operational",
    phase: "photos_pending",
  });
  await expect(page.getByRole("table")).toContainText("Motor do dashboard");
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Abrir #${number}`, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator(".overview-page")).toBeVisible();
  await expect(stageCount(page, "photos_pending")).toHaveText("1");
});

test("a registered sale leaves preparation but stays in the catalog and commercial records", async ({
  page,
}) => {
  await login(page);
  await createDraft(page, "Motor vendido no teste isolado");
  await page.locator(".overview-catalog [data-overview-piece]").click();
  await page.getByRole("tab", { name: "Anúncio e venda", exact: true }).click();
  await page
    .getByRole("button", { name: "Venda presencial", exact: true })
    .click();
  await page.getByLabel("Valor recebido (R$)", { exact: true }).fill("250,00");
  await page
    .getByRole("button", { name: "Confirmar operação", exact: true })
    .click();
  await expect(page.locator("#panel-actions")).toContainText("Vendida");
  await page.locator("#done-piece").click();
  await expect(metricValue(page, "total")).toHaveText("1");
  await expect(metricValue(page, "active")).toHaveText("0");
  await expect(metricValue(page, "sold")).toHaveText("1");
  for (const phase of stages)
    await expect(stageCount(page, phase)).toHaveText("0");
  await page.locator('[data-metric="sold"]').click();
  await expect(page).toHaveURL(/#\/sales$/);
  await expect(page.getByRole("table")).toContainText(
    "Motor vendido no teste isolado",
  );
  await expect(page.getByRole("table")).toContainText("250,00");
  await page
    .locator("#commercial-query")
    .fill("busca anterior sem correspondência");
  await page.locator("#commercial-status").selectOption("cancelled");
  await navigate(page, "overview");
  await page.locator('[data-metric="sold"]').click();
  await expect(page.locator("#commercial-query")).toHaveValue("");
  await expect(page.locator("#commercial-status")).toHaveValue("sold");
  await expect(page.getByRole("table")).toContainText(
    "Motor vendido no teste isolado",
  );
  await navigate(page, "board");
  await expect(page.locator(".piece-card")).toHaveCount(0);
  await navigate(page, "table");
  await expect(page.getByRole("table")).toContainText(
    "Motor vendido no teste isolado",
  );
});

test("the total catalog shortcut clears an unrelated search left on the operational board", async ({
  page,
}) => {
  await login(page);
  await createDraft(page, "Motor preservado na busca");
  await navigate(page, "board");
  await page
    .getByRole("searchbox", { name: "Buscar peças", exact: true })
    .fill("peça inexistente");
  await expect(page.locator(".piece-card")).toHaveCount(0);
  await navigate(page, "overview");
  await expect(metricValue(page, "total")).toHaveText("1");
  await page.locator('[data-metric="total"]').click();
  await expect(page).toHaveURL(/#\/table$/);
  await expect(
    page.getByRole("searchbox", { name: "Buscar peças", exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("table")).toContainText(
    "Motor preservado na busca",
  );
});

test("the active reservation shortcut clears earlier commercial searches and cancelled status", async ({
  page,
}) => {
  await login(page);
  await createDraft(page, "Motor reservado no teste isolado");
  await page.locator(".overview-catalog [data-overview-piece]").click();
  await page.getByRole("tab", { name: "Anúncio e venda", exact: true }).click();
  await page.getByRole("button", { name: "Reservar", exact: true }).click();
  await page
    .getByLabel("Cliente / responsável pela retirada")
    .fill("Responsável do teste");
  await page
    .getByRole("button", { name: "Confirmar operação", exact: true })
    .click();
  await expect(page.locator("#panel-actions")).toContainText("Reservada");
  await page.locator("#done-piece").click();
  await expect(metricValue(page, "reserved")).toHaveText("1");
  await page.locator('[data-metric="reserved"]').click();
  await page
    .locator("#commercial-query")
    .fill("busca anterior sem correspondência");
  await page.locator("#commercial-status").selectOption("cancelled");
  await navigate(page, "overview");
  await page.locator('[data-metric="reserved"]').click();
  await expect(page.locator("#commercial-query")).toHaveValue("");
  await expect(page.locator("#commercial-status")).toHaveValue("reserved");
  await expect(page.getByRole("table")).toContainText(
    "Motor reservado no teste isolado",
  );
  await expect(page.getByRole("table")).toContainText("Responsável do teste");
});

test("grouped legacy photo cards stay visible when filtering and deleting their presented queue", async ({
  page,
}) => {
  await login(page);
  await createDraft(page, "Motor da fila importada");
  await navigate(page, "board");
  await page
    .getByRole("button", { name: "Configurar Cadastro", exact: true })
    .click();
  await page
    .locator('#action-dialog input[name="name"]')
    .fill("Editar fotos (legado)");
  await page
    .locator('#action-dialog select[name="phase"]')
    .selectOption("photos_pending");
  await page.locator("#action-submit").click();
  await expect(page.locator("#action-dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Configurar Editar fotos (legado)",
      exact: true,
    }),
  ).toHaveCount(0);
  const pendingQueue = page.locator(".kanban-column").filter({
    has: page.getByRole("button", {
      name: "Configurar Fotografias pendentes",
      exact: true,
    }),
  });
  await expect(pendingQueue).toContainText("Motor da fila importada");
  await page
    .getByRole("button", {
      name: "Configurar Fotografias pendentes",
      exact: true,
    })
    .click();
  await expect(page.locator("#column-left")).toBeDisabled();
  await page.locator("#action-dialog [data-action-close]").last().click();

  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Coluna do quadro", exact: true })
    .selectOption({ label: "Fotografias pendentes" });
  await expect(pendingQueue.locator(".piece-card")).toHaveCount(1);
  await expect(pendingQueue).toContainText("Motor da fila importada");
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();

  await page
    .getByRole("button", { name: "+ Adicionar coluna", exact: true })
    .click();
  await page
    .locator('#action-dialog input[name="name"]')
    .fill("Cadastro complementar");
  await page
    .locator('#action-dialog select[name="phase"]')
    .selectOption("registration");
  await page.locator("#action-submit").click();
  await expect(page.locator("#action-dialog")).not.toBeVisible();
  await page
    .getByRole("button", {
      name: "Configurar Fotografias pendentes",
      exact: true,
    })
    .click();
  await page
    .locator("#column-destination")
    .selectOption({ label: "Cadastro complementar" });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Excluir esta coluna", exact: true })
    .click();
  await expect(page.locator("#action-dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Configurar Fotografias pendentes",
      exact: true,
    }),
  ).toHaveCount(0);
  const destination = page.locator(".kanban-column").filter({
    has: page.getByRole("button", {
      name: "Configurar Cadastro complementar",
      exact: true,
    }),
  });
  await expect(destination.locator(".piece-card")).toHaveCount(1);
  await expect(destination).toContainText("Motor da fila importada");
  await navigate(page, "overview");
  await expect(metricValue(page, "total")).toHaveText("1");
  await expect(stageCount(page, "registration")).toHaveText("1");
  await expect(stageCount(page, "photos_pending")).toHaveText("0");
});

test("dashboard shortcuts apply their intended status and scope without inventing an integration", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator(".integration-badge")).toHaveText(
    "Mercado Livre desconectado",
  );
  for (const [target, filters] of [
    ["active", { scope: "operational" }],
    ["photos", { scope: "operational", phase: "photos_pending" }],
    ["ready", { scope: "operational", listing: "ready" }],
    ["held", { sale: "on_hold" }],
    ["pending", { scope: "operational", pending: "true" }],
  ]) {
    await page.locator(`[data-overview-target="${target}"]`).first().click();
    await expectFilterRoute(page, filters);
    await navigate(page, "overview");
  }
  await page.locator('[data-metric="historical"]').click();
  await expect(page).toHaveURL(/#\/listings$/);
  await expect(page.locator("#commercial-status")).toHaveValue(
    "legacy_published",
  );
  await navigate(page, "overview");
  await page.locator('[data-overview-target="prepare"]').click();
  await expect(page.locator("#commercial-status")).toHaveValue("draft");
  await navigate(page, "overview");
  await page.locator('[data-overview-target="catalog"]').first().click();
  await expect(page).toHaveURL(/#\/table$/);
  await navigate(page, "overview");
  await page.locator('[data-overview-target="activity"]').click();
  await expect(page).toHaveURL(/#\/activity$/);
});

test("overview adapts to phone, tablet and desktop without document overflow", async ({
  page,
}) => {
  await login(page);
  await createDraft(page, "Motor de responsividade");
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".overview-page")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(page.locator(".workflow-step")).toHaveCount(5);
    await page.locator('[data-stage="publication"]').click();
    await expectFilterRoute(page, {
      scope: "operational",
      phase: "publication",
    });
    await navigate(page, "overview");
    await page.screenshot({
      path: `artifacts/private/overview-validation/fixture-${width}.png`,
      fullPage: true,
    });
  }
});

test("read-only employees see truthful totals and consult availability through permitted routes", async ({
  page,
}) => {
  await login(page, "viewer");
  await expect(
    page.getByRole("button", { name: "Cadastrar peça", exact: true }),
  ).toHaveCount(0);
  await expect(metricValue(page, "total")).toHaveText("0");
  await page.locator('[data-metric="reserved"]').click();
  await expectFilterRoute(page, { sale: "reserved" });
  await navigate(page, "overview");
  await page.locator('[data-metric="sold"]').click();
  await expectFilterRoute(page, { sale: "sold" });
  await navigate(page, "overview");
  await page.locator('[data-overview-target="catalog"]').first().click();
  await expect(
    page.getByRole("button", { name: "+ Nova peça", exact: true }),
  ).toHaveCount(0);
});

test("workflow and indicator buttons support keyboard activation and clear route focus", async ({
  page,
}) => {
  await login(page);
  const stage = page.getByRole("button", {
    name: "Cadastro: 0 peças",
    exact: true,
  });
  await stage.focus();
  await expect(stage).toBeFocused();
  await page.keyboard.press("Enter");
  await expectFilterRoute(page, {
    scope: "operational",
    phase: "registration",
  });
  await expect(page.locator("#main-content")).toBeFocused();
  await navigate(page, "overview");
  await page.locator('[data-metric="total"]').focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/#\/table$/);
});
