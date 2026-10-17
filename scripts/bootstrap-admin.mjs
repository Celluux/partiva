import { runSupabase } from "./supabase-auth.mjs";
import { writeFile, mkdir } from "node:fs/promises";
const email = process.env.PARTIVA_ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !/^[^ @]+@[^ @]+\.[^ @]+$/.test(email))
  throw new Error(
    "Defina PARTIVA_ADMIN_EMAIL com a conta Auth autorizada, já existente no PARTIVAA.",
  );
const literal = "'" + email.replace(/'/g, "''") + "'";
const sql = `begin; do $$ declare uid uuid; w uuid='00000000-0000-0000-0000-000000000001'; begin
select id into uid from auth.users where lower(email)=${literal};
if uid is null then raise exception 'Conta Auth autorizada não encontrada'; end if;
perform 1 from public.workspaces where id=w for update;
if exists(select 1 from public.workspace_members where workspace_id=w and active and role in ('owner','admin','manager')) then raise exception 'Já existe administrador. Use Minha Empresa para gerenciar novos acessos.'; end if;
insert into public.workspace_members(workspace_id,user_id,role,email,display_name) values(w,uid,'admin',${literal},'Administrador') on conflict(workspace_id,user_id) do update set role='admin',active=true;
end $$; commit;`;
await mkdir("artifacts/private", { recursive: true });
await writeFile("artifacts/private/bootstrap-admin.sql", sql);
const result = runSupabase(
  [
    "db",
    "query",
    "--linked",
    "--project-ref",
    "twtldgdceidyurinrvsy",
    "--file",
    "artifacts/private/bootstrap-admin.sql",
  ],
  {},
);
process.exitCode = result.status ?? 1;
