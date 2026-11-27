import test from "node:test";
import assert from "node:assert/strict";
import { verifyProjectCoherence } from "../server/project-coherence-validator.js";

test("accepts files with a known entrypoint and resolved local import", () => {
  const r = verifyProjectCoherence([{path:"src/main.js",content:'import "./util.js";'}, {path:"src/util.js",content:"export const x=1;"}]);
  assert.equal(r.passed,true);
});
test("reports missing candidate entrypoint", () => {
  const r = verifyProjectCoherence([{path:"README.md",content:""}]);
  assert.ok(r.issues.some(x=>x.code==="ENTRYPOINT_MISSING"));
});
test("detects unresolved local JavaScript import", () => {
  const r = verifyProjectCoherence([{path:"src/main.js",content:'import "./missing.js";'}]);
  assert.ok(r.issues.some(x=>x.code==="LOCAL_IMPORT_MISSING"));
});
test("detects unresolved local HTML script or href target", () => {
  const r = verifyProjectCoherence([{path:"index.html",content:'<script src="./app.js"></script>'}]);
  assert.ok(r.issues.some(x=>x.code==="LOCAL_HTML_TARGET_MISSING"));
});
test("does not flag external package imports", () => {
  const r = verifyProjectCoherence([{path:"src/main.js",content:'import React from "react";'}]);
  assert.equal(r.passed,true);
});
test("handles non-array input and empty project", () => {
  assert.equal(verifyProjectCoherence(null).passed,false);
  assert.ok(verifyProjectCoherence([]).issues.some(x=>x.code==="EMPTY_PROJECT"));
});
test("documents static-only limitation", () => {
  const r = verifyProjectCoherence([{path:"src/main.js",content:""}]);
  assert.equal(r.scope,"static_manifest_only");
  assert.match(r.limitation,/not a complete parser/);
});
