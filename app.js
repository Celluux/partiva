const STORAGE_KEY = "partiva-board-v1";
const defaultColumns = [
  { id: "entrada", name: "Entrada", color: "var(--blue)" },
  { id: "desmontagem", name: "Em desmontagem", color: "var(--orange)" },
  { id: "preparacao", name: "Preparar anúncio", color: "var(--purple)" },
  { id: "pronto", name: "Pronto para venda", color: "var(--green)" }
];
const samplePieces = [
  { id: "ptv-1042", code: "PTV-1042", title: "Parachoque dianteiro", vehicle: "Chevrolet Onix 2020", category: "Carroceria", location: "Corredor A · Estante 04", condition: "Bom", price: 680, notes: "Pequeno risco na lateral direita. Compatível com LT e Premier.", columnId: "entrada", visual: "visual-blue", icon: "◈", tag: "Novo", due: "Hoje", assignee: "DR" },
  { id: "ptv-1039", code: "PTV-1039", title: "Farol esquerdo LED", vehicle: "VW Polo 2019", category: "Elétrica", location: "Corredor B · Estante 02", condition: "Excelente", price: 890, notes: "Testado e funcionando. Lente sem trincas.", columnId: "entrada", visual: "visual-purple", icon: "✦", tag: "Novo", due: "Amanhã", assignee: "MA" },
  { id: "ptv-1035", code: "PTV-1035", title: "Retrovisor elétrico", vehicle: "Hyundai HB20 2021", category: "Carroceria", location: "Corredor A · Estante 07", condition: "Bom", price: 320, notes: "Capa com marcas de uso.", columnId: "entrada", visual: "visual-orange", icon: "◉", tag: "Novo", due: "18 out", assignee: "DR" },
  { id: "ptv-1028", code: "PTV-1028", title: "Caixa de câmbio", vehicle: "Fiat Argo 2018 1.3", category: "Mecânica", location: "Pátio · Box 03", condition: "Regular", price: 2450, notes: "Aguardando abertura e avaliação interna.", columnId: "desmontagem", visual: "visual-dark", icon: "⚙", tag: "Em análise", due: "Hoje", assignee: "MA" },
  { id: "ptv-1024", code: "PTV-1024", title: "Compressor do ar-condicionado", vehicle: "Ford Ka 2017", category: "Mecânica", location: "Corredor C · Estante 01", condition: "Bom", price: 580, notes: "Retirar polia antes de fotografar.", columnId: "desmontagem", visual: "visual-green", icon: "◌", tag: "Em análise", due: "20 out", assignee: "DR" },
  { id: "ptv-1019", code: "PTV-1019", title: "Módulo de injeção", vehicle: "Renault Sandero 2016", category: "Elétrica", location: "Armário E · Gaveta 12", condition: "Bom", price: 760, notes: "Número Bosch conferido na bancada.", columnId: "desmontagem", visual: "visual-purple", icon: "⌁", tag: "Em análise", due: "21 out", assignee: "MA" },
  { id: "ptv-1012", code: "PTV-1012", title: "Porta dianteira direita", vehicle: "Toyota Corolla 2015", category: "Carroceria", location: "Corredor A · Estante 11", condition: "Bom", price: 980, notes: "Sem acessórios. Fazer fotos externas e internas.", columnId: "preparacao", visual: "visual-blue", icon: "▱", tag: "Em preparação", due: "Hoje", assignee: "DR" },
  { id: "ptv-1008", code: "PTV-1008", title: "Banco do motorista", vehicle: "Honda Fit 2014", category: "Interior", location: "Corredor D · Estante 05", condition: "Regular", price: 460, notes: "Higienização pendente.", columnId: "preparacao", visual: "visual-orange", icon: "▰", tag: "Em preparação", due: "22 out", assignee: "MA" },
  { id: "ptv-1003", code: "PTV-1003", title: "Jogo de rodas 16”", vehicle: "VW Virtus 2020", category: "Rodas e pneus", location: "Pátio · Rack 02", condition: "Excelente", price: 1850, notes: "Fotos prontas. Falta descrição final.", columnId: "preparacao", visual: "visual-dark", icon: "◉", tag: "Em preparação", due: "23 out", assignee: "DR" },
  { id: "ptv-0998", code: "PTV-0998", title: "Lanterna traseira", vehicle: "Jeep Renegade 2019", category: "Elétrica", location: "Corredor B · Estante 09", condition: "Excelente", price: 520, notes: "Anúncio revisado pela equipe.", columnId: "pronto", visual: "visual-red", icon: "✧", tag: "Pronto", due: "Publicado", assignee: "MA" },
  { id: "ptv-0994", code: "PTV-0994", title: "Volante multifuncional", vehicle: "Nissan Kicks 2021", category: "Interior", location: "Armário E · Gaveta 02", condition: "Bom", price: 640, notes: "Compatível com versão SV.", columnId: "pronto", visual: "visual-green", icon: "◉", tag: "Pronto", due: "Publicado", assignee: "DR" },
  { id: "ptv-0987", code: "PTV-0987", title: "Kit radiador completo", vehicle: "Chevrolet Prisma 2018", category: "Mecânica", location: "Corredor C · Estante 04", condition: "Bom", price: 735, notes: "Pronto para publicação em marketplaces.", columnId: "pronto", visual: "visual-blue", icon: "◇", tag: "Pronto", due: "Publicado", assignee: "MA" }
];

let state = loadState();
let activePieceId = null;
let activeFilters = { category: "" };
const $ = (selector) => document.querySelector(selector);

function loadState() {
  try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? JSON.parse(saved) : { columns: defaultColumns, pieces: samplePieces }; } catch { return { columns: defaultColumns, pieces: samplePieces }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(value) { return value ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value) : "—"; }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char])); }
function tagClass(tag = "") { if (tag === "Pronto") return "tag-green"; if (tag === "Em análise") return "tag-orange"; if (tag === "Em preparação") return "tag-purple"; return "tag-blue"; }
function columnDot(column) { return `<span class="column-dot" style="background:${column.color}"></span>`; }
function render() {
  const query = $("#search-input").value.trim().toLowerCase();
  const board = $("#kanban-board");
  let visibleCount = 0;
  board.innerHTML = state.columns.map((column) => {
    const pieces = state.pieces.filter((piece) => piece.columnId === column.id && (!query || [piece.title, piece.vehicle, piece.code, piece.category].join(" ").toLowerCase().includes(query)) && (!activeFilters.category || piece.category === activeFilters.category));
    visibleCount += pieces.length;
    return `<article class="kanban-column"><header class="column-header"><div class="column-title">${columnDot(column)}<strong>${escapeHtml(column.name)}</strong><span class="column-count">${pieces.length}</span></div><button class="column-menu" type="button" data-column-menu="${column.id}">•••</button></header><div class="cards-stack">${pieces.length ? pieces.map(renderCard).join("") : `<div class="empty-column">Nenhuma peça nesta etapa<br><button class="text-button quick-add" data-column-id="${column.id}" type="button">Adicionar peça</button></div>`}</div><button class="add-card-button quick-add" data-column-id="${column.id}" type="button">+ Adicionar peça</button></article>`;
  }).join("");
  $("#sidebar-card-count").textContent = state.pieces.length;
  updateFilters();
  board.querySelectorAll("[data-piece-id]").forEach((card) => card.addEventListener("click", () => openDetail(card.dataset.pieceId)));
  board.querySelectorAll(".quick-add").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); openCreate(button.dataset.columnId); }));
  board.querySelectorAll("[data-column-menu]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const column = state.columns.find((item) => item.id === button.dataset.columnMenu); if (column && confirm(`Excluir a coluna “${column.name}”? As peças serão movidas para Entrada.`)) { state.pieces.filter((piece) => piece.columnId === column.id).forEach((piece) => { piece.columnId = state.columns[0].id; }); state.columns = state.columns.filter((item) => item.id !== column.id); saveState(); render(); toast("Coluna removida"); } }));
  if (!visibleCount && query) { board.innerHTML = `<div class="empty-column" style="width:100%;padding:50px">Nenhuma peça encontrada para “${escapeHtml(query)}”.<br><button class="text-button" id="clear-search" type="button">Limpar busca</button></div>`; $("#clear-search")?.addEventListener("click", () => { $("#search-input").value = ""; render(); }); }
}
function renderCard(piece) { return `<article class="piece-card" data-piece-id="${piece.id}"><div class="card-image"><div class="piece-visual ${piece.visual || "visual-purple"}"><span>${piece.icon || "◈"}</span></div></div><div class="card-labels"><span class="tag ${tagClass(piece.tag)}">${escapeHtml(piece.tag)}</span><span class="card-code">${escapeHtml(piece.code)}</span></div><h3>${escapeHtml(piece.title)}</h3><div class="card-vehicle">${escapeHtml(piece.vehicle || "Veículo não informado")}</div><div class="card-meta"><span class="meta-location">⌖ ${escapeHtml(piece.location || "Sem localização")}</span><span class="meta-price">${money(piece.price)}</span></div><div class="card-footer"><div class="avatar-stack"><span class="tiny-avatar avatar-orange">${escapeHtml(piece.assignee || "DR")}</span></div><span class="due-date ${piece.due === "Hoje" ? "warning" : ""}">${escapeHtml(piece.due || "Sem prazo")}</span></div></article>`; }
function updateFilters() { const count = activeFilters.category ? 1 : 0; $("#filter-count").classList.toggle("hidden", !count); $("#filter-count").textContent = count; $("#active-filters").innerHTML = activeFilters.category ? `<span class="filter-chip">${escapeHtml(activeFilters.category)} ×</span>` : ""; }
function openModal(id) { $("#modal-backdrop").classList.remove("hidden"); document.querySelectorAll(".modal").forEach((modal) => modal.classList.add("hidden")); $(id).classList.remove("hidden"); }
function closeModal() { $("#modal-backdrop").classList.add("hidden"); document.querySelectorAll(".modal").forEach((modal) => modal.classList.add("hidden")); }
function openCreate(columnId = "entrada") { $("#piece-form").reset(); $("#piece-reference").value = nextCode(); $("#piece-form").dataset.columnId = columnId; openModal("#create-modal"); setTimeout(() => $("#piece-title").focus(), 50); }
function nextCode() { const highest = state.pieces.reduce((max, piece) => Math.max(max, Number(piece.code?.replace("PTV-", "")) || 0), 1042); return `PTV-${String(highest + 1).padStart(4, "0")}`; }
function openDetail(id) { const piece = state.pieces.find((item) => item.id === id); if (!piece) return; activePieceId = id; const column = state.columns.find((item) => item.id === piece.columnId); $("#detail-status").textContent = (column?.name || "ETAPA").toUpperCase(); $("#detail-title").textContent = piece.title; $("#detail-code").textContent = piece.code; $("#detail-vehicle").textContent = piece.vehicle || "Veículo não informado"; $("#detail-visual").className = `piece-visual large ${piece.visual || "visual-purple"}`; $("#detail-visual span").textContent = piece.icon || "◈"; $("#detail-tags").innerHTML = `<span class="tag ${tagClass(piece.tag)}">${escapeHtml(piece.tag)}</span><span class="tag tag-blue">${escapeHtml(piece.category)}</span>`; $("#detail-location").textContent = piece.location || "Não informado"; $("#detail-condition").textContent = piece.condition || "Não informado"; $("#detail-price").textContent = money(piece.price); $("#detail-category").textContent = piece.category || "Não informado"; $("#detail-notes").textContent = piece.notes || "Sem observações registradas."; openModal("#detail-modal"); }
function toast(message) { $("#toast-message").textContent = message; $("#toast").classList.remove("hidden"); setTimeout(() => $("#toast").classList.add("hidden"), 2700); }
function selectedVisual() { return ["visual-purple", "visual-blue", "visual-orange", "visual-green", "visual-dark"][Math.floor(Math.random() * 5)]; }

$("#new-card-btn").addEventListener("click", () => openCreate());
$("#add-column-btn").addEventListener("click", () => openModal("#column-modal"));
$("#search-input").addEventListener("input", render);
$("#filter-btn").addEventListener("click", () => { const categories = [...new Set(state.pieces.map((piece) => piece.category))]; const choice = prompt(`Filtrar por categoria:\n\n${categories.map((category, index) => `${index + 1}. ${category}`).join("\n")}\n\nDigite o número ou deixe vazio para limpar.`); if (choice === null) return; const index = Number(choice) - 1; activeFilters.category = categories[index] || ""; render(); });
$("#piece-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const code = form.get("reference") || nextCode(); const title = String(form.get("title")).trim(); const piece = { id: `piece-${Date.now()}`, code, title, vehicle: String(form.get("vehicle") || "Veículo não informado").trim(), category: form.get("category"), location: String(form.get("location") || "A definir").trim(), condition: form.get("condition"), price: Number(form.get("price")) || 0, notes: String(form.get("notes") || "").trim(), columnId: event.currentTarget.dataset.columnId || "entrada", visual: selectedVisual(), icon: "◈", tag: "Novo", due: "Sem prazo", assignee: "MA" }; state.pieces.unshift(piece); saveState(); closeModal(); render(); toast(`${title} adicionada ao fluxo`); });
$("#column-form").addEventListener("submit", (event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (!name) return; state.columns.push({ id: `column-${Date.now()}`, name, color: "var(--purple)" }); saveState(); closeModal(); render(); toast("Nova coluna adicionada"); });
$("#delete-piece-btn").addEventListener("click", () => { const piece = state.pieces.find((item) => item.id === activePieceId); if (!piece || !confirm(`Excluir ${piece.title}?`)) return; state.pieces = state.pieces.filter((item) => item.id !== activePieceId); saveState(); closeModal(); render(); toast("Peça excluída"); });
$("#move-piece-btn").addEventListener("click", () => { const piece = state.pieces.find((item) => item.id === activePieceId); if (!piece) return; const current = state.columns.findIndex((column) => column.id === piece.columnId); const next = state.columns[Math.min(current + 1, state.columns.length - 1)]; if (next) { piece.columnId = next.id; piece.tag = next.id === "pronto" ? "Pronto" : next.id === "preparacao" ? "Em preparação" : next.id === "desmontagem" ? "Em análise" : "Novo"; saveState(); closeModal(); render(); toast(`Peça movida para ${next.name}`); } });
$("#invite-btn").addEventListener("click", () => toast("Link de compartilhamento copiado"));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
$("#modal-backdrop").addEventListener("click", (event) => { if (event.target === $("#modal-backdrop")) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

render();

let authClient = null;
let authMode = "login";

function setAuthMessage(message, isError = false) {
  const element = $("#auth-message");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("hidden", !message);
}

function updateAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#auth-kicker").textContent = signup ? "NOVO USUÁRIO" : "ACESSO AO WORKSPACE";
  $("#auth-title").textContent = signup ? "Crie seu acesso" : "Bem-vindo de volta";
  $("#auth-description").textContent = signup ? "Cadastre seu usuário para entrar na operação do Partiva." : "Entre para acompanhar o fluxo de peças da sua operação.";
  $("#auth-submit").innerHTML = signup ? "Criar usuário <span>→</span>" : "Entrar no Partiva <span>→</span>";
  $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("#auth-switch").innerHTML = signup ? "Já tenho uma conta <span>Voltar para login</span>" : "Ainda não tenho uma conta <span>Criar usuário</span>";
  setAuthMessage("");
}

function showAuthenticatedApp(user) {
  $("#landing-screen").classList.remove("active");
  $("#auth-screen").classList.remove("active");
  $(".app-shell").classList.remove("auth-locked");
  $(".app-shell").classList.add("is-visible");
  const profile = $(".user-profile .workspace-copy");
  if (profile && user?.email) profile.innerHTML = `<strong>${escapeHtml(user.email.split("@")[0])}</strong><span>Usuário Partiva</span>`;
}

function showAuthScreen() {
  $("#landing-screen").classList.remove("active");
  $(".app-shell").classList.add("auth-locked");
  $(".app-shell").classList.remove("is-visible");
  $("#auth-screen").classList.add("active");
}

function showLandingScreen() {
  $("#landing-screen").classList.add("active");
  $("#auth-screen").classList.remove("active");
  $(".app-shell").classList.add("auth-locked");
  $(".app-shell").classList.remove("is-visible");
}

async function initAuth() {
  const config = window.PARTIVA_CONFIG || {};
  if (!config.supabaseUrl || !config.supabasePublishableKey) { showLandingScreen(); return; }
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    authClient = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data: { session } } = await authClient.auth.getSession();
    if (session) showAuthenticatedApp(session.user); else showLandingScreen();
    authClient.auth.onAuthStateChange((_event, nextSession) => { if (nextSession) showAuthenticatedApp(nextSession.user); else showLandingScreen(); });
  } catch (error) {
    showAuthScreen();
    setAuthMessage("Não foi possível conectar ao Supabase. Verifique a configuração.", true);
    console.error(error);
  }
}

$("#landing-login-btn").addEventListener("click", () => { showAuthScreen(); updateAuthMode("login"); });
$("#landing-signup-btn").addEventListener("click", () => { showAuthScreen(); updateAuthMode("signup"); });
$("#landing-free-btn").addEventListener("click", () => { showAuthScreen(); updateAuthMode("signup"); });
$("#landing-final-btn").addEventListener("click", () => { showAuthScreen(); updateAuthMode("signup"); });
$("#auth-home-link").addEventListener("click", (event) => { event.preventDefault(); showLandingScreen(); });
$("#auth-switch").addEventListener("click", () => updateAuthMode(authMode === "login" ? "signup" : "login"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authClient) { setAuthMessage("O Supabase ainda não está configurado. O modo demonstração continua disponível.", true); return; }
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const button = $("#auth-submit");
  button.disabled = true;
  setAuthMessage("");
  const result = authMode === "signup" ? await authClient.auth.signUp({ email, password }) : await authClient.auth.signInWithPassword({ email, password });
  button.disabled = false;
  if (result.error) { setAuthMessage(result.error.message, true); return; }
  if (authMode === "signup" && !result.data.session) { setAuthMessage("Usuário criado. Confira seu e-mail para confirmar o acesso."); return; }
  if (result.data.session) showAuthenticatedApp(result.data.session.user);
});

initAuth();
