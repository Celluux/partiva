export const PHASES = {
  registration: "Cadastro",
  photos_pending: "Fotografias pendentes",
  photos_edited: "Fotografias editadas",
  listing: "Preparação do anúncio",
  publication: "Publicação",
};
export const ROLES = {
  owner: "Administrador",
  manager: "Administrador",
  admin: "Administrador",
  operator: "Operação",
  photographer: "Fotografias",
  sales: "Vendas",
  viewer: "Consulta",
};
export const SALE_LABELS = {
  on_hold: "Em repouso",
  available: "Disponível",
  reserved: "Reservada",
  sold: "Vendida",
  cancelled: "Cancelada",
};
export const LISTING_LABELS = {
  legacy_published: "Anunciado no sistema antigo · API não verificada",
  draft: "Rascunho",
  review: "Em revisão",
  ready: "Pronto para anunciar",
  published: "Publicado confirmado",
  paused: "Pausado",
  not_applicable: "Não se aplica",
};
export const CATALOG = [
  { name: "Farol", category: "Elétrica", position: true, side: true },
  { name: "Lanterna", category: "Elétrica", position: true, side: true },
  { name: "Porta", category: "Carroceria", position: true, side: true },
  { name: "Parachoque", category: "Carroceria", position: true },
  { name: "Paralama", category: "Carroceria", position: true, side: true },
  { name: "Retrovisor", category: "Carroceria", position: true, side: true },
  { name: "Amortecedor", category: "Suspensão", position: true, side: true },
  { name: "Banco", category: "Interior", position: true, side: true },
  { name: "Motor", category: "Mecânica" },
  { name: "Caixa de câmbio", category: "Mecânica" },
  { name: "Módulo de injeção", category: "Elétrica" },
  { name: "Compressor de ar", category: "Mecânica" },
  { name: "Roda", category: "Rodas e pneus", position: true },
  { name: "Pneu", category: "Rodas e pneus", position: true },
  { name: "Vidro", category: "Carroceria", position: true, side: true },
];
export const BRANDS = [
  "Chevrolet",
  "Volkswagen",
  "Fiat",
  "Ford",
  "Toyota",
  "Honda",
  "Hyundai",
  "Renault",
  "Nissan",
  "Jeep",
  "Peugeot",
  "Citroën",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Mitsubishi",
];
export const MODELS = {
  Chevrolet: ["Onix", "Prisma", "Celta", "Corsa", "Cruze", "S10", "Tracker"],
  Volkswagen: ["Gol", "Polo", "Virtus", "Fox", "Saveiro", "Golf", "T-Cross"],
  Fiat: ["Argo", "Palio", "Uno", "Siena", "Strada", "Toro", "Mobi"],
  Ford: ["Ka", "Fiesta", "Focus", "EcoSport", "Ranger"],
  Toyota: ["Corolla", "Etios", "Hilux", "Yaris"],
  Honda: ["Civic", "Fit", "City", "HR-V"],
  Hyundai: ["HB20", "Creta", "Tucson"],
  Renault: ["Sandero", "Logan", "Kwid", "Duster"],
  Nissan: ["Kicks", "March", "Versa", "Sentra"],
  Jeep: ["Renegade", "Compass", "Commander"],
};
export const CATEGORIES = [
  "Carroceria",
  "Elétrica",
  "Mecânica",
  "Interior",
  "Suspensão",
  "Rodas e pneus",
  "Outras",
];
export const TABLE_COLUMNS = {
  internal_number: "Identificador",
  part_name: "Peça",
  detran_reference: "Detran",
  complementary_code: "Complementar",
  vehicle: "Veículo",
  category: "Categoria",
  price_cents: "Preço",
  column_id: "Etapa",
  listing_status: "Anúncio",
  sale_status: "Disponibilidade",
  missing: "Pendências",
  updated_at: "Atualização",
};
export const DEFAULT_TABLE_COLUMNS = [
  "internal_number",
  "part_name",
  "detran_reference",
  "vehicle",
  "price_cents",
  "column_id",
  "sale_status",
  "missing",
];
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
export const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
export const money = (cents) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);
export function cents(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const cleaned = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned))
    throw new Error("Informe um valor válido, com até dois centavos.");
  const result = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(result) || result > 2147483647)
    throw new Error("Valor fora do limite permitido.");
  return result;
}
export function applicability(name) {
  const n = normalize(name);
  return {
    position:
      /(farol|lanterna|porta|parachoque|para-choque|amortecedor|mola|pneu|roda|paralama|para-lama|banco|eixo|freio|retrovisor|vidro|macaneta)/.test(
        n,
      ),
    side: /(farol|lanterna|porta|retrovisor|paralama|para-lama|amortecedor|macaneta|vidro|banco|freio)/.test(
      n,
    ),
  };
}
export const vehicle = (p) =>
  [p.brand, p.model, p.year_compatibility || p.year, p.engine]
    .filter(Boolean)
    .join(" ") ||
  p.vehicle ||
  "Veículo a completar";
export const suggestTitle = (p) =>
  [
    p.part_name,
    p.position,
    p.side === "Não se aplica" ? "" : p.side,
    p.brand,
    p.model,
    p.year,
    p.engine,
    p.color,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);
export function fees(price, company, piece = {}) {
  if (
    price == null ||
    (piece.fee_percent_override == null && !company.fee_configured)
  )
    return { fee: null, net: null };
  const fee =
    Math.round(
      (price * Number(piece.fee_percent_override ?? company.fee_percent)) / 100,
    ) + Number(piece.fee_fixed_cents_override ?? company.fee_fixed_cents ?? 0);
  return { fee, net: price - fee - Number(piece.other_cost_cents || 0) };
}
export function permissions(role) {
  const admin = ["owner", "manager", "admin"].includes(role);
  return {
    admin,
    read: Boolean(role),
    parts: admin || ["operator", "sales"].includes(role),
    columns: admin || role === "operator",
    photos: admin || ["operator", "photographer"].includes(role),
    sales: admin || role === "sales",
  };
}
export function missingFields(p, photos = [], company = {}) {
  const names = {
    part_name: "Nome da peça",
    detran_reference: "Número do Detran",
    category: "Categoria",
    brand: "Marca",
    model: "Modelo",
    year: "Ano",
    title: "Título do anúncio",
  };
  const missing = Object.entries(names)
    .filter(
      ([key]) =>
        (key === "detran_reference" && /^sem\s+info$/i.test(p[key] || "")) ||
        !String(
          key === "year"
            ? p.year_compatibility || p.year || ""
            : (p[key] ?? ""),
        ).trim(),
    )
    .map(([, name]) => name);
  const applicable = applicability(p.part_name);
  if (applicable.position && !p.position) missing.push("Posição");
  if (applicable.side && !p.side) missing.push("Lado");
  if (!p.price_cents || p.price_cents <= 0) missing.push("Preço válido");
  if (p.price_is_suggested)
    missing.push("Conferir preço sugerido do sistema antigo");
  if (p.fee_percent_override == null && !company.fee_configured)
    missing.push("Configuração da taxa estimada");
  const minimum = company.preferences?.minimum_photos ?? 2;
  if (
    new Set(
      photos
        .filter((photo) => !photo.archived_at && photo.selected_for_listing)
        .map((photo) => photo.original_photo_id || photo.id),
    ).size < minimum
  )
    missing.push(`Selecionar ao menos ${minimum} fotografias para anúncio`);
  return missing;
}
export function matches(p, filters, photos, company) {
  if (Boolean(p.archived_at) !== Boolean(filters.archived)) return false;
  if (
    filters.query &&
    !normalize(
      [
        p.internal_number,
        p.internal_code,
        p.part_name,
        p.title,
        p.detran_reference,
        p.complementary_code,
        vehicle(p),
        p.category,
      ].join(" "),
    ).includes(normalize(filters.query))
  )
    return false;
  if (filters.category && p.category !== filters.category) return false;
  if (filters.column && p.column_id !== filters.column) return false;
  if (
    filters.sale &&
    (filters.sale === "on_hold"
      ? !p.legacy_hold
      : p.sale_status !== filters.sale ||
        (filters.sale === "available" && p.legacy_hold))
  )
    return false;
  if (filters.listing && p.listing_status !== filters.listing) return false;
  if (filters.pending && missingFields(p, photos, company).length === 0)
    return false;
  return true;
}
export function validatePhoto(file) {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
  )
    throw new Error("Use fotografias JPG, PNG, WebP ou AVIF.");
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error("Cada fotografia deve ter até 20 MB.");
}
export function legacyPayload(piece, source) {
  return {
    id: crypto.randomUUID(),
    part_name: String(piece.title || ""),
    title: String(piece.title || ""),
    title_manual: true,
    category: String(piece.category || ""),
    price_cents: Math.round(Number(piece.price || 0) * 100),
    notes: String(piece.notes || ""),
    complementary_code: String(piece.code || ""),
    vehicle: String(piece.vehicle || ""),
    legacy_source: `${source}:${piece.id || piece.code}`,
    legacy_payload: piece,
  };
}
