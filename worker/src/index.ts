import { createClient } from "@supabase/supabase-js";
type Secrets = { SUPABASE_SECRET_KEY?: string };
function json(body: unknown, status = 200, origin = "") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
async function limitedJson(request: Request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new Error("Use JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Dados obrigatórios.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new Error("Solicitação muito grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
  async fetch(
    request: Request,
    env: CloudflareEnv & Secrets,
  ): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const allowed = origin === env.ALLOWED_ORIGIN ? origin : "";
    const path = new URL(request.url).pathname.replace(/^\/api(?=\/)/, "");
    let projectUrl: URL;
    try {
      projectUrl = new URL(env.SUPABASE_URL);
      if (!projectUrl.hostname.endsWith(".supabase.co"))
        throw new Error("host");
    } catch {
      return json(
        { error: "SUPABASE_URL inválida para esta instalação." },
        503,
        allowed,
      );
    }
    if (origin && !allowed)
      return json({ error: "Origem não autorizada." }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: allowed
          ? {
              "Access-Control-Allow-Origin": allowed,
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Authorization, Content-Type",
              Vary: "Origin",
            }
          : {},
      });
    if (path === "/health" && request.method === "GET")
      return json(
        {
          projectRef: projectUrl.hostname.split(".")[0],
          invitesConfigured: Boolean(
            env.SUPABASE_SECRET_KEY && env.SUPABASE_PUBLISHABLE_KEY,
          ),
          mercadoLivre: {
            connected: false,
            reason: "Integração oficial ainda não configurada",
          },
        },
        200,
        allowed,
      );
    if (path !== "/employees/invite" || request.method !== "POST")
      return json({ error: "Rota não encontrada." }, 404, allowed);
    if (!allowed) return json({ error: "Origem obrigatória." }, 403);
    const authorization = request.headers.get("Authorization") || "";
    if (!/^Bearer [\w.\-]+$/.test(authorization))
      return json({ error: "Autenticação obrigatória." }, 401, allowed);
    if (!env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY)
      return json(
        { error: "Backend de convites ainda não configurado." },
        503,
        allowed,
      );
    try {
      const client = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authorization } },
        },
      );
      const { data: userData, error: userError } = await client.auth.getUser(
        authorization.slice(7),
      );
      if (userError || !userData.user)
        return json({ error: "Sessão inválida ou expirada." }, 401, allowed);
      const { data: members, error: memberError } = await client
        .from("workspace_members")
        .select("workspace_id,role,active")
        .eq("user_id", userData.user.id)
        .eq("active", true);
      if (
        memberError ||
        members?.length !== 1 ||
        !["owner", "admin", "manager"].includes(members[0].role)
      )
        return json(
          { error: "Somente administradores podem convidar funcionários." },
          403,
          allowed,
        );
      const input = await limitedJson(request);
      if (
        typeof input.email !== "string" ||
        input.email.length > 250 ||
        !/^[^ @]+@[^ @]+\.[^ @]+$/.test(input.email) ||
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 100 ||
        !["admin", "operator", "photographer", "sales", "viewer"].includes(
          input.role,
        )
      )
        return json(
          { error: "Informe nome, e-mail e permissão válidos." },
          400,
          allowed,
        );
      const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // External identity is confirmed by Supabase Auth, never trusted from user metadata.
      const { data: invite, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(
          input.email.trim().toLowerCase(),
          { redirectTo: env.ALLOWED_ORIGIN + "/?recovery=1" },
        );
      if (inviteError || !invite.user)
        return json(
          {
            error:
              "O Supabase não concluiu o convite. Confira se o e-mail já possui acesso e a configuração de envio.",
          },
          409,
          allowed,
        );
      const { error: bindError } = await admin.rpc("bind_invited_employee", {
        admin_id: userData.user.id,
        invited_id: invite.user.id,
        employee_email: input.email.trim().toLowerCase(),
        employee_name: input.name.trim(),
        employee_role: input.role,
      });
      if (bindError)
        return json(
          {
            error:
              "Conta convidada, mas o vínculo com a empresa não foi concluído. Um administrador deve conferir o acesso no banco.",
          },
          503,
          allowed,
        );
      return json({ ok: true }, 200, allowed);
    } catch (error) {
      return json(
        {
          error:
            error instanceof SyntaxError
              ? "JSON inválido."
              : "Não foi possível processar o convite com segurança.",
        },
        400,
        allowed,
      );
    }
  },
};
