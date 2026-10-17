import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export let COMPANY = "";
export const USERS = {
  admin: "11111111-1111-4111-8111-111111111111",
  operator: "22222222-2222-4222-8222-222222222222",
  viewer: "33333333-3333-4333-8333-333333333333",
  outsider: "44444444-4444-4444-8444-444444444444",
  sales: "55555555-5555-4555-8555-555555555555",
  photographer: "66666666-6666-4666-8666-666666666666",
};
export async function database(beforeUpgrade) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text, unique(bucket_id,name));
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;
  `);
  const foundation = (
    await readFile(
      new URL(
        "../../supabase/migrations/20261016000000_partiva_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).replace("create extension if not exists pgcrypto;", "");
  await db.exec(foundation);
  COMPANY = (
    await db.query(
      "select id from public.workspaces order by created_at, id limit 1",
    )
  ).rows[0].id;
  if (beforeUpgrade) await beforeUpgrade(db);
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20261017031153_partiva_operational.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  const migrationDirectory = new URL(
    "../../supabase/migrations/",
    import.meta.url,
  );
  for (const file of (await readdir(migrationDirectory)).sort()) {
    if (
      file.endsWith(".sql") &&
      file > "20261017031153_partiva_operational.sql"
    )
      await db.exec(await readFile(new URL(file, migrationDirectory), "utf8"));
  }
  for (const [role, id] of Object.entries(USERS))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${role}@example.test`,
    ]);
  for (const role of ["admin", "operator", "viewer", "sales", "photographer"])
    await db.query(
      "insert into public.workspace_members(workspace_id,user_id,role,email,display_name) values($1,$2,$3,$4,$5)",
      [COMPANY, USERS[role], role, `${role}@example.test`, role],
    );
  return db;
}
export async function asUser(db, role, callback) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated;`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      USERS[role] || role,
    ]);
    return callback(tx);
  });
}
export async function rpc(db, role, name, args) {
  return asUser(
    db,
    role,
    async (tx) =>
      (
        await tx.query(
          `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
          args,
        )
      ).rows[0].result,
  );
}
