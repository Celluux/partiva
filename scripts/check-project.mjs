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
const projectFiles = [
  ...paths,
  ".env.example",
  "worker/.dev.vars.example",
  "worker/wrangler.jsonc",
  "worker/src/index.ts",
  "public/_headers",
];
for (const file of projectFiles) {
  const source = await readFile(file, "utf8");
  const hosts = source.matchAll(/(?:https|wss):\/\/([a-z0-9]+)\.supabase\.co/g);
  for (const [, reference] of hosts)
    assert(
      !reference.includes("YOUR_PROJECT_REF"),
      `Unconfigured project in ${file}`,
    );
}
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
  "Syntax, instance configuration, private-access UI and secret checks passed.",
);
