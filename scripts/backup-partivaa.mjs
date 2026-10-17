import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  PROJECT,
  serviceAccess,
  checked,
  sqlRead,
} from "./lib/partivaa-service.mjs";
const directory =
  process.argv[2] ||
  "artifacts/private/desmonte-migration/backup-before-import";
await mkdir(directory, { recursive: true });
try {
  await readFile(`${directory}/BACKUP-COMPLETE.json`);
  throw new Error("Backup completo já existe; não sobrescrever.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const tables = [
  "public.workspaces",
  "public.workspace_members",
  "public.board_columns",
  "partiva_private.identifiers",
  "public.parts",
  "public.part_photos",
  "public.part_events",
  "public.part_sales",
  "public.company_events",
  "public.user_preferences",
  "public.app_configuration",
  "public.legacy_drafts",
];
const expr = tables
  .map(
    (t) => `'${t}',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from ${t} t)`,
  )
  .join(",");
const snapshot = sqlRead(
  `begin read only;select jsonb_build_object(${expr},'storage.buckets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from storage.buckets t),'storage.objects',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from storage.objects t),'migrations',(select jsonb_agg(to_jsonb(t)) from supabase_migrations.schema_migrations t),'sequences',(select jsonb_agg(to_jsonb(t)) from pg_sequences t where schemaname in ('public','partiva_private')),'columns',(select jsonb_agg(to_jsonb(t)) from information_schema.columns t where table_schema in ('public','partiva_private')),'policies',(select jsonb_agg(to_jsonb(t)) from pg_policies t where schemaname in ('public','storage')),'functions',(select jsonb_agg(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','partiva_private') and p.prokind='f'),'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where connamespace in ('public'::regnamespace,'partiva_private'::regnamespace))) as snapshot;`,
)[0].snapshot;
await writeFile(
  `${directory}/database.json`,
  JSON.stringify(snapshot, null, 2),
);
const root = serviceAccess(),
  files = [];
for (const object of snapshot["storage.objects"]) {
  const blob = checked(
    await root.storage.from(object.bucket_id).download(object.name),
  );
  const bytes = Buffer.from(await blob.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex"),
    path = `${directory}/files/${object.bucket_id}/${object.name}`;
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await writeFile(path, bytes);
  files.push({
    bucket: object.bucket_id,
    name: object.name,
    size: bytes.length,
    sha256: digest,
    path,
  });
}
await mkdir(`${directory}/migrations`, { recursive: true });
for (const m of snapshot.migrations || []) {
  const { readdir } = await import("node:fs/promises");
  const f = (await readdir("supabase/migrations")).find((f) =>
    f.startsWith(m.version),
  );
  if (!f) throw new Error("Migração de recuperação ausente " + m.version);
  await copyFile(`supabase/migrations/${f}`, `${directory}/migrations/${f}`);
}
let restore = `-- RECOVERY ONLY. Review with an administrator; never used by the import.\n-- Requires baseline schema/migrations and the original Auth accounts. Do not run on a live database blindly.\nbegin;\ndo $recovery$ begin if current_setting('partiva.recovery_authorized',true) is distinct from 'yes' or exists(select 1 from public.parts) then raise exception 'Recovery requires explicit authorization and an empty isolated target'; end if; end $recovery$;\ndelete from public.board_columns;\nalter table public.parts disable trigger protect_part_identity;\n`;
for (const table of tables) {
  const rows = snapshot[table];
  if (!rows.length) continue;
  const names = Object.keys(rows[0]),
    cols = names.map((n) => '"' + n + '"').join(",");
  let tag = "$partiva_recovery$";
  const json = JSON.stringify(rows);
  if (json.includes(tag))
    throw new Error("Delimitador de recuperação inválido");
  restore += `insert into ${table} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::${table},${tag}${json}${tag}::jsonb) ${
    table === "public.workspaces"
      ? "on conflict (id) do update set " +
        names
          .filter((n) => n !== "id")
          .map((n) => '\"' + n + '\"=excluded.\"' + n + '\"')
          .join(",")
      : "on conflict do nothing"
  };\n`;
}
restore += `alter table public.parts enable trigger protect_part_identity;\nselect setval(pg_get_serial_sequence('partiva_private.identifiers','number'),greatest((select coalesce(max(number),1) from partiva_private.identifiers),${Number(snapshot.sequences?.find((s) => s.sequencename === "identifiers_number_seq")?.last_value || 1)}),true);\ncommit;\n`;
await writeFile(`${directory}/restore-missing-records.sql`, restore);
await writeFile(
  `${directory}/RECUPERACAO.md`,
  "# Recuperação\n\nEste backup preserva todos os dados operacionais anteriores à importação, o registro permanente de identificadores, esquema de referência, migrações e arquivos do Storage com hashes. Não contém tokens nem senhas Auth. As contas Auth existentes continuam geridas pelo Supabase; seus IDs são preservados nos vínculos.\n\nPara recuperação em ambiente separado, preparar as contas Auth com os mesmos IDs, aplicar as migrações arquivadas e revisar restore-missing-records.sql. O SQL exige uma cópia isolada com zero peças e a configuração explícita partiva.recovery_authorized=yes; remove apenas as colunas de exemplo dessa cópia vazia antes de restaurar. Não executar no projeto oficial. Uma reversão completa deve ser feita em uma cópia de recuperação, usando database.json e os arquivos, nunca por reset do projeto oficial. Validar contagens e hashes antes de liberar. O importador nunca executa este SQL.\n",
);
const complete = {
  project: PROJECT,
  created_at: new Date().toISOString(),
  tables: Object.fromEntries(tables.map((t) => [t, snapshot[t].length])),
  files,
  database_sha256: createHash("sha256")
    .update(await readFile(`${directory}/database.json`))
    .digest("hex"),
};
await writeFile(
  `${directory}/BACKUP-COMPLETE.json`,
  JSON.stringify(complete, null, 2),
);
console.log(
  "Backup recuperável concluído:",
  snapshot["public.parts"].length,
  "peças,",
  files.length,
  "arquivos; banco, identidades, migrações e recuperação preservados.",
);
