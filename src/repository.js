import { createClient } from "@supabase/supabase-js";
import { validatePhoto } from "./domain.js";
export const DEV_REF = "twtldgdceidyurinrvsy";
export function getConfig() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    window.PARTIVA_CONFIG?.supabaseUrl ||
    `https://${DEV_REF}.supabase.co`;
  if (new URL(url).hostname !== `${DEV_REF}.supabase.co`)
    throw new Error("Este aplicativo está restrito ao projeto PARTIVAA.");
  return {
    url,
    key:
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      window.PARTIVA_CONFIG?.supabasePublishableKey ||
      "",
    api: import.meta.env.VITE_API_URL || "/api",
  };
}
export function requireResult(result) {
  if (result.error) {
    const error = new Error(
      result.error.message || "Não foi possível concluir a operação.",
    );
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}
export class Repository {
  constructor(config) {
    this.config = config;
    this.client = createClient(config.url, config.key, {
      db: { retry: false },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: `partiva-auth-${DEV_REF}`,
      },
    });
  }
  async all(table, filter) {
    const rows = [];
    for (let page = 0; ; page++) {
      let query = this.client
        .from(table)
        .select("*")
        .order(
          table === "workspace_members"
            ? "user_id"
            : table === "app_configuration"
              ? "singleton"
              : table === "user_preferences"
                ? "user_id"
                : "id",
        )
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (filter) query = filter(query);
      const data = requireResult(await query);
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  }
  async load() {
    const user = requireResult(await this.client.auth.getUser()).user;
    const members = await this.all("workspace_members");
    const membership = members.find((m) => m.user_id === user.id && m.active);
    if (!membership)
      throw new Error(
        "Seu usuário não possui acesso ativo à empresa. Procure um administrador.",
      );
    const workspaceId = membership.workspace_id;
    const [
      companies,
      columns,
      pieces,
      photos,
      events,
      preferences,
      companyEvents,
      legacyDrafts,
      sales,
    ] = await Promise.all([
      this.all("workspaces", (q) => q.eq("id", workspaceId)),
      this.all("board_columns", (q) => q.eq("workspace_id", workspaceId)),
      this.all("parts", (q) => q.eq("workspace_id", workspaceId)),
      this.all("part_photos"),
      this.all("part_events", (q) => q.eq("workspace_id", workspaceId)),
      this.all("user_preferences", (q) => q.eq("user_id", user.id)),
      ["owner", "admin", "manager"].includes(membership.role)
        ? this.all("company_events", (q) => q.eq("workspace_id", workspaceId))
        : Promise.resolve([]),
      this.all("legacy_drafts", (q) => q.eq("workspace_id", workspaceId)),
      this.all("part_sales", (q) => q.eq("workspace_id", workspaceId)),
    ]);
    if (companies.length !== 1)
      throw new Error(
        "Empresa indisponível. Verifique a configuração de desenvolvimento.",
      );
    return {
      user,
      membership,
      members,
      company: companies[0],
      columns: columns.sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      ),
      pieces,
      photos,
      events,
      companyEvents,
      legacyDrafts,
      sales,
      preferences: preferences[0]?.settings || {},
    };
  }
  rpc(name, params) {
    return this.client.rpc(name, params).then(requireResult);
  }
  async signed(bucket, path) {
    if (!path) return "";
    return requireResult(
      await this.client.storage.from(bucket).createSignedUrl(path, 1800),
    ).signedUrl;
  }
  async upload(bucket, path, file, onProgress = () => {}) {
    validatePhoto(file);
    const session = requireResult(await this.client.auth.getSession()).session;
    if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${this.config.url}/storage/v1/object/${bucket}/${path}`,
      );
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
      xhr.setRequestHeader("apikey", this.config.key);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.timeout = 120000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onerror = () =>
        reject(
          new Error(
            "Falha de conexão ao enviar a fotografia. Tente novamente.",
          ),
        );
      xhr.ontimeout = () =>
        reject(new Error("O envio demorou demais. Tente novamente."));
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(path)
          : reject(
              new Error(
                "Não foi possível enviar a fotografia. Verifique sessão, permissões e conexão.",
              ),
            );
      xhr.send(file);
    });
  }
  subscribe(workspaceId, onChange, onStatus) {
    const channel = this.client.channel(
      `partiva-${workspaceId}-${crypto.randomUUID()}`,
    );
    for (const table of [
      "parts",
      "board_columns",
      "workspaces",
      "workspace_members",
      "part_events",
      "part_sales",
    ])
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter:
            table === "workspaces"
              ? `id=eq.${workspaceId}`
              : `workspace_id=eq.${workspaceId}`,
        },
        onChange,
      );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "part_photos" },
      onChange,
    );
    channel.subscribe(onStatus);
    return () => this.client.removeChannel(channel);
  }
  async invite(payload) {
    const session = requireResult(await this.client.auth.getSession()).session;
    const response = await fetch(
      `${this.config.api.replace(/\/$/, "")}/employees/invite`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify(payload),
      },
    );
    const body = await response
      .json()
      .catch(() => ({ error: "Backend de convites indisponível." }));
    if (!response.ok || body.ok !== true)
      throw new Error(body.error || "Falha ao convidar funcionário.");
    return body;
  }
}
