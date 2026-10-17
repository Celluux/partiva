// Test fixture only: production browser code + real PostgreSQL/RLS via PGlite.
// Auth emails/tokens and Storage transport are isolated fixtures, not Supabase verification.
import http from "node:http";
import { randomUUID, createHmac } from "node:crypto";
import { database, asUser, rpc, USERS } from "../helpers/database.js";
let db = await database();
const sessions = new Map(),
  files = new Map(),
  secret = randomUUID();
const allowedTables = new Set([
  "legacy_drafts",
  "workspace_members",
  "workspaces",
  "board_columns",
  "parts",
  "part_photos",
  "part_events",
  "user_preferences",
  "part_sales",
  "company_events",
]);
const signatures = {
  save_part: ["payload", "expected_version"],
  column_action: ["command", "payload"],
  part_action: ["pid", "command", "expected_version"],
  photo_action: ["pid", "command", "payload"],
  sale_action: ["pid", "command", "payload"],
  company_save: ["payload", "expected_version"],
  member_save: ["uid", "new_role", "enabled", "label"],
  preferences_save: ["payload"],
};
const user = (role) => ({
  id: USERS[role],
  aud: "authenticated",
  role: "authenticated",
  email: `${role}@example.test`,
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
});
const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const jwt = (role) =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USERS[role], role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iss: "fixture" })}.test-signature`;
const sign = (value) =>
  createHmac("sha256", secret).update(value).digest("hex");
http
  .createServer(async (req, res) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      `http://127.0.0.1:${Number(process.env.PARTIVA_E2E_PORT || 5173)}`,
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization,apikey,content-type,x-client-info,x-upsert",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    const send = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      if (path === "/health") return send({ invitesConfigured: false });
      if (path === "/test/reset") {
        await db.close();
        db = await database();
        sessions.clear();
        files.clear();
        return send({ ok: true });
      }
      if (path === "/auth/v1/token") {
        const input = JSON.parse(bytes.toString()),
          role = input.email?.split("@")[0];
        if (!(role in USERS) || input.password !== "Correct-password1")
          return send(
            { error: "invalid_credentials", msg: "Credenciais inválidas" },
            400,
          );
        const access_token = jwt(role);
        sessions.set(access_token, role);
        return send({
          access_token,
          refresh_token: randomUUID(),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: user(role),
        });
      }
      const token = (req.headers.authorization || "").replace("Bearer ", ""),
        role = sessions.get(token);
      if (path === "/auth/v1/user")
        return role
          ? send(user(role))
          : send({ message: "Sessão inválida" }, 401);
      if (path === "/auth/v1/logout") {
        sessions.delete(token);
        res.writeHead(204);
        return res.end();
      }
      if (path === "/employees/invite")
        return send(
          { error: "Backend de convites ainda não configurado." },
          503,
        );
      if (path.startsWith("/storage/v1/object/sign/") && req.method === "GET") {
        const object = decodeURIComponent(
            path.slice("/storage/v1/object/sign/".length),
          ),
          expiry = url.searchParams.get("expires"),
          signature = url.searchParams.get("token");
        if (
          Number(expiry) < Date.now() ||
          signature !== sign(`${object}:${expiry}`)
        )
          return send({ error: "Assinatura inválida" }, 403);
        const file = files.get(object);
        if (!file) return send({ error: "Arquivo inexistente" }, 404);
        res.writeHead(200, { "Content-Type": file.type });
        return res.end(file.bytes);
      }
      if (!role) return send({ message: "Sessão obrigatória" }, 401);
      if (path.startsWith("/rest/v1/rpc/")) {
        const name = path.split("/").pop(),
          args = JSON.parse(bytes.toString());
        if (!signatures[name])
          return send({ message: "RPC desconhecida" }, 404);
        return send(
          await rpc(
            db,
            role,
            name,
            signatures[name].map((k) => args[k] ?? null),
          ),
        );
      }
      if (path.startsWith("/rest/v1/")) {
        const table = path.split("/").pop();
        if (!allowedTables.has(table) || req.method !== "GET")
          return send({ message: "Acesso negado" }, 403);
        const values = [],
          conditions = [];
        for (const [key, value] of url.searchParams) {
          if (["select", "order", "offset", "limit"].includes(key)) continue;
          if (!/^[a-z_]+$/.test(key)) throw new Error("Filtro inválido");
          if (value.startsWith("eq.")) {
            values.push(value.slice(3));
            conditions.push(`${key}=$${values.length}`);
          }
        }
        const result = await asUser(db, role, (tx) =>
          tx.query(
            `select * from public.${table}${conditions.length ? " where " + conditions.join(" and ") : ""}`,
            values,
          ),
        );
        return send(result.rows);
      }
      if (
        path.startsWith("/storage/v1/object/sign/") &&
        req.method === "POST"
      ) {
        const object = decodeURIComponent(
          path.slice("/storage/v1/object/sign/".length),
        );
        const [bucket, ...segments] = object.split("/");
        const name = segments.join("/");
        const allowed = await asUser(db, role, (tx) =>
          tx.query(
            "select id from storage.objects where bucket_id=$1 and name=$2",
            [bucket, name],
          ),
        );
        if (!allowed.rows.length) return send({ message: "Sem acesso" }, 403);
        const expiry = Date.now() + 1800000;
        return send({
          signedURL: `/object/sign/${object}?expires=${expiry}&token=${sign(`${object}:${expiry}`)}`,
        });
      }
      if (path.startsWith("/storage/v1/object/") && req.method === "POST") {
        const [bucket, ...segments] = decodeURIComponent(
            path.slice("/storage/v1/object/".length),
          ).split("/"),
          name = segments.join("/");
        await asUser(db, role, (tx) =>
          tx.query(
            "insert into storage.objects(bucket_id,name) values($1,$2)",
            [bucket, name],
          ),
        );
        files.set(`${bucket}/${name}`, {
          bytes,
          type: req.headers["content-type"],
        });
        return send({ Key: `${bucket}/${name}` });
      }
      return send({ error: "Rota de teste não encontrada" }, 404);
    } catch (error) {
      send({ message: error.message, code: error.code || "TEST_ERROR" }, 400);
    }
  })
  .listen(5199, "127.0.0.1", () =>
    console.log("Isolated PostgreSQL browser-test fixture ready."),
  );
