import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(`${dir}/${entry.name}`)
          : `${dir}/${entry.name}`,
      ),
    )
  ).flat();
}
const paths = [
  "app.js",
  "config.js",
  ...(await files("src")),
  ...(await files("scripts")),
  ...(await files("functions")),
];
for (const file of paths.filter((p) => /\.(js|mjs)$/.test(p))) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `Syntax error in ${file}: ${result.stderr}`);
}
const config = await readFile("config.js", "utf8");
assert(config.includes("jelqadbfyfmouulhsvvs.supabase.co"));
assert(!config.includes("twtldgdceidyurinrvsy"));
const html = await readFile("index.html", "utf8");
assert(!html.includes("Criar conta grátis"));
assert(html.includes("Minha Empresa"));
for (const file of [...paths, "index.html", "worker/src/index.ts"]) {
  const source = await readFile(file, "utf8");
  assert(!/sb_secret_[A-Za-z0-9_-]{16,}/.test(source), `Secret in ${file}`);
  assert(
    !/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(source),
    `Hardcoded JWT in ${file}`,
  );
}
console.log(
  "Syntax, development-project isolation, private-access UI and secret checks passed.",
);
