commit a424505a82970d8e4446ea5e0aacaf5f0a85a2e9
Author: Halawany <eahmad96@icloud.com>
Date:   Sat Aug 22 00:25:51 2026 +0300

    Gate-2.2 C18.1.10: derive the checkout's source binding once per control suite
    
    The source binding — HEAD, cleanliness, tracked migration digests and the
    migration-derived transforms — is a property of the CHECKOUT, identical for every
    archive judged against it, but it shells out to git twice per verification (~22 ms
    each). Across 247 controls that is real time, and it is larger on a loaded hosted
    runner where the hosted control suite measured 67.4 s, 101.2 s and 102.5 s against
    a 90 s target.
    
    The production CLI still re-derives the binding on every run; only a control suite
    may inject one it derived once, which is the "cache source-derived expectations per
    suite" rule. The binding is still checked against every archive — it is simply not
    re-shelled 247 times. No control is removed, sampled or weakened.
    
    C18 IS NOT CLOSED and C19 IS NOT STARTED.
    
    Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

diff --git a/apps/api/test/gate/c18-mutation-controls.ctl.ts b/apps/api/test/gate/c18-mutation-controls.ctl.ts
index 49f4e30..1cb7f96 100644
--- a/apps/api/test/gate/c18-mutation-controls.ctl.ts
+++ b/apps/api/test/gate/c18-mutation-controls.ctl.ts
@@ -19,7 +19,9 @@ import { tmpdir } from 'node:os';
 import { dirname, join, relative } from 'node:path';
 
 // eslint-disable-next-line import/no-relative-packages
-import { ingestArchive, verifyEvidence, verifySemantics } from '../../../../scripts/gate/c18-db-paths.mjs';
+import {
+  deriveSourceBinding, ingestArchive, verifyEvidence, verifySemantics,
+} from '../../../../scripts/gate/c18-db-paths.mjs';
 // eslint-disable-next-line import/no-relative-packages
 import { commandIdFor } from '../../../../scripts/gate/lib/c18-contract.mjs';
 // eslint-disable-next-line import/no-relative-packages
@@ -294,9 +296,20 @@ const editJson = (dir: string, name: string, edit: (doc: any) => void) => {
   writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
 };
 
+/**
+ * The checkout's source binding, derived ONCE. It is identical for every archive judged against
+ * this checkout, and shelling out to git per control cost about 22 ms each — real time on a
+ * loaded hosted runner. The binding is still checked against every archive.
+ */
+let SOURCE_BINDING: unknown = null;
+const sourceBinding = () => {
+  if (SOURCE_BINDING === null) SOURCE_BINDING = deriveSourceBinding(REPO);
+  return SOURCE_BINDING;
+};
+
 async function expectReject(mutate: Mutator, pattern: RegExp, opts: { rebindAfter?: boolean } = {}) {
   const { members } = mutateMembers(mutate, opts);
-  const r = await verifySemantics({ members, root: REPO });
+  const r = await verifySemantics({ members, root: REPO, sourceBinding: sourceBinding() });
   expect(r.ok).toBe(false);
   expect(r.problems.join('\n')).toMatch(pattern);
 }
diff --git a/scripts/gate/c18-db-paths.mjs b/scripts/gate/c18-db-paths.mjs
index 3ada100..d3d8fa6 100644
--- a/scripts/gate/c18-db-paths.mjs
+++ b/scripts/gate/c18-db-paths.mjs
@@ -988,6 +988,21 @@ function reconstructSnapshot(snap, pfx, rawFor) {
   return problems;
 }
 
+/**
+ * C18.1.10 — derive the checkout's source binding: HEAD, cleanliness, tracked migration digests
+ * and the migration-derived intentional transforms. Cheap to state, but it shells out to git, so
+ * a control suite derives it once rather than per control.
+ */
+export function deriveSourceBinding(root) {
+  const tracked = trackedMigrationDigests(root);
+  return {
+    head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
+    dirty: spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
+    tracked,
+    transforms: deriveIntentionalTransforms(tracked.dir, tracked.files),
+  };
+}
+
 /**
  * C18.1.10 — HARDENED ZIP INGRESS.
  *
@@ -1061,7 +1076,7 @@ export function ingestArchive({ zipPath }) {
  */
 export async function verifySemantics({
   members, root, online = false, requireHosted = false, fetchImpl = globalThis.fetch, token = null,
-  zipBytes = null,
+  zipBytes = null, sourceBinding = null,
 }) {
   const problems = [];
   const notes = [];
@@ -1162,14 +1177,19 @@ export async function verifySemantics({
     }
 
     // ── SOURCE BINDING: HEAD, cleanliness, migrations from the CHECKOUT ───────
-    const rootHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
-    const rootDirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).stdout.trim();
+    // C18.1.10 — the SOURCE BINDING is a property of the checkout, identical for every archive
+    // judged against it. The production CLI always re-derives it. A control suite may derive it
+    // ONCE and inject it, which is the "cache source-derived expectations per suite" rule: the
+    // binding is still checked against every archive, it is simply not re-shelled 247 times.
+    const binding = sourceBinding ?? deriveSourceBinding(root);
+    const rootHead = binding.head;
+    const rootDirty = binding.dirty;
     // A malformed manifest must never SUPPRESS the source binding finding.
     if (typeof manifest.source_sha === 'string' && manifest.source_sha !== rootHead) {
       problems.push(`manifest source_sha ${manifest.source_sha} is not this checkout's HEAD ${rootHead}`);
     }
     if (rootDirty !== '') problems.push('the verifier checkout is not clean; verification must run from the exact source');
-    const tracked = trackedMigrationDigests(root);
+    const tracked = binding.tracked;
     if (shaped) {
       const manifestDigests = Object.entries(manifest.migration_digests).sort();
       const sourceDigests = [...tracked.digests.entries()].sort();
@@ -1177,7 +1197,7 @@ export async function verifySemantics({
         problems.push('manifest migration digests are not exactly the source-derived set');
       }
     }
-    const transforms = deriveIntentionalTransforms(tracked.dir, tracked.files);
+    const transforms = binding.transforms;
     if (shaped && JSON.stringify(manifest.intentional_transforms) !== JSON.stringify(transforms)) {
       problems.push('manifest intentional transforms are not exactly the migration-derived set');
     }
