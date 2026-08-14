/**
 * FROZEN: the SBOM shape check as it stood BEFORE C17, reproduced exactly.
 *
 * This is what "we validate the SBOM" meant up to and including C16: a hand-rolled check of
 * the document's identity fields plus a non-empty components/dependencies pair, taken verbatim
 * from `assert-final-manifests.mjs` at `d63318e0`. It is not a CycloneDX validator and never
 * claimed to be one — it knows nothing of component types, hash algorithms, licence objects or
 * externalReferences, because it only ever looked at the handful of fields C16 needed.
 *
 * It is frozen here so the C17 controls can demonstrate the gap by execution: a document this
 * check ACCEPTS and the official schema REJECTS is the whole reason C17 exists.
 *
 * DO NOT EDIT.
 */

/** The pre-C17 check. Returns a list of problems; empty means accepted. */
export function permissiveSbomProblems(sbom, { name = 'target', expectedSerial = null } = {}) {
  const problems = [];
  if (sbom === null || typeof sbom !== 'object' || Array.isArray(sbom)) {
    problems.push(`C16 target ${name} SBOM is not a JSON object`);
    return problems;
  }
  if (sbom.bomFormat !== 'CycloneDX') {
    problems.push(`C16 target ${name} SBOM bomFormat is ${JSON.stringify(sbom.bomFormat)}, expected "CycloneDX"`);
  }
  if (sbom.specVersion !== '1.6') {
    problems.push(`C16 target ${name} SBOM specVersion is ${JSON.stringify(sbom.specVersion)}, expected "1.6"`);
  }
  if (sbom.version !== 1) {
    problems.push(`C16 target ${name} SBOM version is ${JSON.stringify(sbom.version)}, expected 1`);
  }
  if (expectedSerial !== null && sbom.serialNumber !== expectedSerial) {
    problems.push(`C16 target ${name} SBOM serialNumber ${JSON.stringify(sbom.serialNumber)} != the derived ${expectedSerial}`);
  }
  const components = Array.isArray(sbom.components) ? sbom.components : null;
  const dependencies = Array.isArray(sbom.dependencies) ? sbom.dependencies : null;
  if (components === null || dependencies === null) {
    problems.push(`C16 target ${name} SBOM has no components/dependencies arrays`);
  } else if (components.length === 0 || dependencies.length === 0) {
    problems.push(
      `C16 target ${name} SBOM graph is EMPTY (${components.length} components, ${dependencies.length} dependencies)`,
    );
  }
  return problems;
}
