const DEFAULT_ENTRYPOINTS = ["src/main.js", "src/index.js", "index.js"];

/**
 * Conservative manifest coherence checks: declared entrypoints and local import targets.
 * This is static inspection only; it does not parse every language or execute code.
 */
export function verifyProjectCoherence(files, { entrypoints = DEFAULT_ENTRYPOINTS } = {}) {
  const issues = [];
  if (!Array.isArray(files)) return { passed: false, issues: [{ code: "FILES_NOT_ARRAY" }], scope: "static_manifest_only" };
  const byPath = new Map();
  for (const f of files) if (f && typeof f.path === "string") byPath.set(f.path, f.content);
  if (files.length === 0) issues.push({ code: "EMPTY_PROJECT" });
  const declaredEntrypoints = entrypoints.filter(p => byPath.has(p));
  if (entrypoints.length && declaredEntrypoints.length === 0) issues.push({ code: "ENTRYPOINT_MISSING", candidates: entrypoints });
  for (const f of files) {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
    if (f.path.endsWith(".html")) {
      for (const match of f.content.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const target = match[1];
        if (target.startsWith("./") && !byPath.has(target.slice(2))) issues.push({ code: "LOCAL_HTML_TARGET_MISSING", from: f.path, target });
      }
    }
    if (f.path.endsWith(".js") || f.path.endsWith(".mjs")) {
      for (const match of f.content.matchAll(/(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        const target = match[1];
        if (!target.startsWith(".")) continue;
        const candidates = [target, target + ".js", target + ".mjs", target + ".json", target.replace(/\/$/, "") + "/index.js"];
        if (!candidates.some(p => byPath.has(p))) issues.push({ code: "LOCAL_IMPORT_MISSING", from: f.path, target });
      }
    }
  }
  return { passed: issues.length === 0, filesChecked: files.length, issues, scope: "static_manifest_only", limitation: "Checks common entrypoint and local reference patterns only; not a complete parser, build, or runtime verification." };
}
