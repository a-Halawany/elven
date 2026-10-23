#!/bin/bash
# usage: glscan.sh <label>  (run inside a clone)
S=/private/tmp/claude-501/-Users-halawany-work-personal-mohammed-new-project/410dc92c-9357-4f51-bd03-84dce11e3661/scratchpad
$S/bin/gitleaks detect --source . --redact --config .gitleaks.toml --log-opts "--all --full-history" --report-format json --report-path $S/fix/gl/$1.json --log-level error >/dev/null 2>&1
rc=$?
python3 - "$S/fix/gl/$1.json" "$1" "$rc" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); print(f"{sys.argv[2]} exit={sys.argv[3]} findings={len(d)}")
for f in d: print('   ',f['Commit'][:10],f['File'],f['StartLine'],f['Match'])
PY
