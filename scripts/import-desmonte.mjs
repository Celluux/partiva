import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  mapPiece,
  meaningfulDraft,
  sourceKey,
} from "./lib/desmonte-import.mjs";
import { serviceAccess, checked, PROJECT } from "./lib/partivaa-service.mjs";
const directory = "artifacts/private/desmonte-migration";
await mkdir(directory, { recursive: true });
const read = async (path) =>
  JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
const backup = await read(
  `${directory}/backup-before-import/BACKUP-COMPLETE.json`,
);
if (backup.project !== PROJECT) throw new Error("Backup de outro projeto.");
const decoded = await read(
    "artifacts/private/import-analysis/decoded-state.json",
  ),
  files = await read("artifacts/private/import-analysis/photo-manifest.json");
const state = decoded.find((r) => r.key === "main").value.data,
  sourcePieces = state.pieces,
  draftRecords = decoded.filter((r) => r.store_id === 2);
const role = (p) =>
  state.boards.flatMap((b) => b.columns).find((c) => c.id === p.columnId)
    ?.role || "pending";
const photosOf = (id, key = "main") =>
  files.filter((f) => f.piece_id === id && f.record_key === key);
const pieces = sourcePieces.map((p) => ({
  part: mapPiece(p, {
    role: role(p),
    photos: photosOf(p.id),
    drafts: draftRecords
      .filter((d) => d.value.piece.id === p.id)
      .map((d) => ({ ...d.value, photos: photosOf(p.id, d.key) })),
  }).payload,
  meta: { role: role(p), is_draft: false, issues: [] },
}));
const drafts = [];
for (const record of draftRecords) {
  const p = record.value.piece;
  let match = sourcePieces.find((x) => x.id === p.id),
    resolution = "same_id";
  const candidates = sourcePieces.filter(
    (x) =>
      (x.title && x.title.toLowerCase() === String(p.title).toLowerCase()) ||
      (p.code && x.code?.toLowerCase() === p.code.toLowerCase()) ||
      (p.detran && !/^sem\s+info$/i.test(p.detran) && x.detran === p.detran),
  );
  if (!match) {
    if (!meaningfulDraft(p)) resolution = "empty";
    else if (candidates.length) resolution = "pending";
    else {
      resolution = "new_piece";
      match = p;
      pieces.push({
        part: mapPiece(p, {
          role: role(p),
          photos: photosOf(p.id, record.key),
          drafts: [record.value],
        }).payload,
        meta: {
          role: role(p),
          is_draft: true,
          issues: [
            "Cadastro preservado de rascunho antigo; concluir antes de anunciar",
          ],
        },
      });
    }
  }
  drafts.push({
    source_key: `desmonte:pecaflux-local:draft:${record.key}`,
    part_source: match ? sourceKey(match) : null,
    resolution,
    candidate_sources: candidates.map(sourceKey),
    original_payload: {
      ...record.value,
      photos: photosOf(p.id, record.key).map(({ source_copy, ...f }) => f),
    },
  });
}
// Repeated codes/Detran flag separate records; no physical pieces are ever merged.
for (const p of pieces) {
  const x = p.part.legacy_payload.piece;
  const same = sourcePieces.filter(
    (y) =>
      y.id !== x.id &&
      ((x.code && y.code?.toLowerCase() === x.code.toLowerCase()) ||
        (x.detran && !/^sem\s+info$/i.test(x.detran) && y.detran === x.detran)),
  );
  p.meta.issues.push(
    ...same.map(
      (y) =>
        `Coincidência com registro antigo ${y.id}; mantidos separados para revisão`,
    ),
  );
}
const plan = {
  project: PROJECT,
  source_key: "desmonte:pecaflux-local",
  backup_sha256: backup.database_sha256,
  pieces,
  drafts,
  photos: files,
  settings: state.settings,
  boards: state.boards,
};
const serialized = JSON.stringify(plan),
  manifestHash = createHash("sha256").update(serialized).digest("hex");
await writeFile(
  `${directory}/import-plan.json`,
  JSON.stringify({ ...plan, manifest_hash: manifestHash }, null, 2),
);
console.log(
  `Plano: ${pieces.length} peças (${sourcePieces.length} salvas), ${drafts.length} rascunhos, ${files.length} fotos. Rascunhos pendentes: ${drafts.filter((d) => d.resolution === "pending").length}.`,
);
if (!process.argv.includes("--apply")) {
  console.log("Sem --apply: nenhuma gravação remota.");
  process.exit(0);
}
const root = serviceAccess();
const baseline = await read(`${directory}/backup-before-import/database.json`);
const authorized = baseline["public.workspace_members"].filter(
  (m) => m.active && ["owner", "admin", "manager"].includes(m.role),
);
const actor =
  process.env.PARTIVA_IMPORT_ADMIN_USER_ID ||
  (authorized.length === 1 ? authorized[0].user_id : null);
if (!actor) throw new Error("Administrador autorizado não encontrado.");
const attempt = new Date().toISOString().replace(/[:.]/g, "-");
const log = {
  project: PROJECT,
  manifest_hash: manifestHash,
  started_at: new Date().toISOString(),
  pieces: [],
  drafts: [],
  photos: [],
  errors: [],
};
const journal = async () => {
  const content = JSON.stringify(log, null, 2);
  await writeFile(`${directory}/execution-${attempt}.json`, content);
  await writeFile(`${directory}/execution-latest.json`, content);
};
const rpc = async (command, payload) =>
  checked(await root.rpc("import_desmonte", { command, payload, actor }));
const photoKey = (f) =>
  `desmonte:pecaflux-local:photo:${f.record_key}:${f.piece_id}:${f.slot}:${f.sha256}`;
const photoUuid = (key) => {
  const b = Buffer.from(
    createHash("sha256").update(key).digest().subarray(0, 16),
  );
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
try {
  await rpc("batch", {
    source_key: plan.source_key,
    manifest_hash: manifestHash,
    manifest: {
      backup_sha256: backup.database_sha256,
      counts: {
        pieces: pieces.length,
        drafts: drafts.length,
        photos: files.length,
      },
      settings: state.settings,
      boards: state.boards,
    },
  });
  const targets = new Map();
  for (const [index, p] of pieces.entries()) {
    const result = await rpc("piece", p);
    targets.set(p.part.legacy_source, result.part);
    log.pieces.push({
      source: p.part.legacy_source,
      id: result.part.id,
      number: result.part.internal_number,
      reused: result.reused,
    });
    await journal();
    if ((index + 1) % 25 === 0 || index + 1 === pieces.length)
      console.log(`Peças: ${index + 1}/${pieces.length}`);
  }
  for (const d of drafts) {
    const result = await rpc("draft", d);
    log.drafts.push({
      source: d.source_key,
      resolution: d.resolution,
      ...result,
    });
    await journal();
  }
  for (const [index, f] of files.entries()) {
    const bytes = await readFile(f.source_copy);
    if (
      bytes.length !== f.size ||
      createHash("sha256").update(bytes).digest("hex") !== f.sha256
    )
      throw new Error("Arquivo de origem não confere " + f.filename);
    const target = targets.get(`desmonte:pecaflux-local:${f.piece_id}`);
    if (!target)
      throw new Error("Vínculo de fotografia sem peça " + f.piece_id);
    const key = photoKey(f),
      id = photoUuid(key),
      path = `${target.workspace_id}/${target.id}/${id}.jpg`;
    const current = checked(
      await root
        .from("part_photos")
        .select("id,storage_path,legacy_photo_metadata")
        .eq("legacy_photo_key", key),
    );
    if (current.length) {
      if (current[0].legacy_photo_metadata.sha256 !== f.sha256)
        throw new Error("Conflito no conteúdo da foto");
      log.photos.push({ source: key, id: current[0].id, reused: true });
      await journal();
      continue;
    }
    const check = await root.storage.from("part-photos").download(path);
    if (check.error) {
      const upload = await root.storage
        .from("part-photos")
        .upload(path, bytes, { contentType: f.mime_type, upsert: false });
      checked(upload);
    }
    // Confirm bytes on the actual private service before linking. Interrupted uploads are safe to resume.
    const downloaded = Buffer.from(
      await checked(
        await root.storage.from("part-photos").download(path),
      ).arrayBuffer(),
    );
    if (createHash("sha256").update(downloaded).digest("hex") !== f.sha256)
      throw new Error("Conteúdo remoto diferente: " + f.filename);
    const { source_copy, ...metadata } = f;
    metadata.draft_pending = f.record_key !== "main";
    metadata.classification = "source_original_no_edit_relationship_recorded";
    const result = await rpc("photo", {
      source_key: key,
      part_source: `desmonte:pecaflux-local:${f.piece_id}`,
      photo: {
        id,
        storage_path: path,
        mime_type: f.mime_type,
        size_bytes: f.size,
      },
      metadata,
    });
    log.photos.push({ source: key, path, ...result });
    await journal();
    console.log(`Fotografias: ${index + 1}/${files.length}`);
  }
  log.finished_at = new Date().toISOString();
  await journal();
  const stable = await root
    .from("parts")
    .select("id,internal_number,legacy_source")
    .like("legacy_source", "desmonte:pecaflux-local:%");
  checked(stable);
  if (
    stable.data.length !== pieces.length ||
    new Set(stable.data.map((p) => p.internal_number)).size !== pieces.length
  )
    throw new Error("Contagem ou identificadores divergentes.");
  console.log("Testando repetição da mesma importação, sem alterações...");
  for (const p of pieces)
    if (!(await rpc("piece", p)).reused)
      throw new Error("Repetição criou peça");
  for (const d of drafts)
    if (!(await rpc("draft", d)).reused)
      throw new Error("Repetição criou rascunho");
  const photos = checked(
    await root
      .from("part_photos")
      .select("id,legacy_photo_key")
      .like("legacy_photo_key", "desmonte:pecaflux-local:%"),
  );
  if (photos.length !== files.length)
    throw new Error("Contagem de fotos divergente");
  // Every photo re-register call is also verified to reuse its original row.
  for (const f of files) {
    const result = await rpc("photo", {
      source_key: photoKey(f),
      metadata: { sha256: f.sha256 },
    });
    if (!result.reused) throw new Error("Repetição criou fotografia");
  }
  log.replay = {
    pieces: pieces.length,
    drafts: drafts.length,
    photos: files.length,
    duplicates_created: 0,
  };
  await journal();
  console.log("Migração e repetição concluídas:", JSON.stringify(log.replay));
} catch (e) {
  log.errors.push({ message: e.message, at: new Date().toISOString() });
  await journal();
  console.error("Migração pausada com dados preservados:", e.message);
  process.exitCode = 1;
}
