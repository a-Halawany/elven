import sys, re, os, json
from collections import defaultdict, OrderedDict
import docx
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn
S = sys.argv[1]
HEAD = "07edd9dcd57e972203fb9e7bbcdab3a398c642b5"
stats = json.load(open(f"{S}/stats.json"))
VOLS = [
 ("v00","docx","docs/The_Eye_Volume_0_Product_Constitution_v1.0 elvin.docx","f079067067d9db0bdf389b0f4a32fcbad15af44f",88681),
 ("v01","docx","docs/The_Eye_Volume_1_Executive_Vision_Book_v1.0 elvin.docx","cb6de42bbb4c82491632934d74435d6c7f6bf011",609027),
 ("v02","pdf","docs/The_Eye_Volume_2_Technical_Presentation_v1.1 elvin.pdf","62925dd018a9006a476da7cc0d2a0daf87eb1d2f",14213756),
 ("v03","pdf","docs/The_Eye_Volume_3_Technical_Architecture_v1.0 elvin.pdf","dab2408476ff2ddab85656ad586bad6414b49c66",3679286),
 ("v04","pdf","docs/The_Eye_Volume_4_Engineering_Specification_v1.0 elvin.pdf","08efeffbce4f901b05b1d5c9a13a58377b116c96",7185556),
 ("v05","pdf","docs/The_Eye_Volume_5_AI_Architecture_v1.0 elvin.pdf","cc97ed452c263adc1fa01028e67677d71efe61b1",10292126),
 ("v06","pdf","docs/The_Eye_Volume_6_Infrastructure_Architecture_v1.0 elvin .pdf","9a33d8221892792afffec3c719ae113359294155",11356353),
 ("v07","pdf","docs/The_Eye_Volume_7_Data_Platform_v1.0 elvin.pdf","81a6cc01958db0cebe823550cc0a62956f671b27",11299146),
 ("v08","pdf","docs/The_Eye_V8_PRD elvin.pdf","d1a704b1a041726fabaaa6d3b43888d57cd966b6",11875347),
 ("v09","pdf","docs/The_Eye_Volume_9_UI_UX_Design_System_v1.0 elvin .pdf","657c95092c1d00ad52965e9fc2d45d9075c8e244",12422483),
 ("v10","pdf","docs/The_Eye_Volume_10_Investor_Package_v1.0 elvin.pdf","152de5911d0e5c99e57cf94ef06e966dee6e7713",5491176),
]
RX_A = re.compile(r'(?<![A-Za-z0-9-])([A-Z]{1,5}(?:-[A-Z]{1,4})?)-([A-Z]?)(\d{2,4}(?:-\d{2,4}){0,2})(?![A-Za-z0-9-])')
RX_L = re.compile(r'(?<![A-Za-z0-9-])(L\d{1,2})-([CI])(\d{2})(?![A-Za-z0-9-])')
NEAR_EMPTY = 120

def ids_in(line):
    out = []
    for m in RX_A.finditer(line):
        out.append((m.group(1) + ("-" + m.group(2) if m.group(2) else ""), m.group(0)))
    for m in RX_L.finditer(line):
        out.append(("L{n}-" + m.group(2), m.group(0)))
    return out

def units_pdf(txt):
    parts = re.split(r'^=== PAGE (\d+) ===\n', txt, flags=re.M)[1:]
    return [(int(n), body) for n, body in zip(parts[0::2], parts[1::2])]

md = []
summary = []
md.append(f"# Volume extraction inventory\n\nSource: git HEAD `{HEAD}` (branch phase6-decisions). Bytes retrieved with `git show <HEAD>:<path>`; each blob id recomputed as sha1(`blob <len>\\0<bytes>`) and compared with the pinned id and size before extraction.\n\nTools: pypdf 6.18.0 (PDF, page by page, `=== PAGE n ===` markers), python-docx 1.2.0 (DOCX, body order preserved, `=== PARA n ===` every 50 paragraphs, `## ` prefix on Heading/Title-styled paragraphs, tables as `[TABLE]` blocks with rows joined by ` | `).\n\nIdentifier regex: `[A-Z]{{1,5}}(-[A-Z]{{1,4}})?-[A-Z]?\\d{{2,4}}(-\\d{{2,4}}){{0,2}}` (word-bounded) plus layer ids `L\\d{{1,2}}-[CI]\\d{{2}}`. Counts are DISTINCT identifier strings per prefix. Families named in the brief but found in no volume: `IF-`, `V0-`. Near-empty threshold: fewer than {NEAR_EMPTY} characters after the two running-header lines.\n")
for tag, ext, path, blob, size in VOLS:
    st = stats[tag]
    txt = open(f"{S}/{tag}.txt", encoding="utf-8").read()
    ids = defaultdict(set); examples = defaultdict(list)
    headings = []; empties = []; near = []
    if ext == "pdf":
        pages = units_pdf(txt)
        for n, body in pages:
            lines = [l for l in body.split("\n") if l.strip()]
            content = lines
            if n > 1 and len(lines) >= 2 and lines[0].startswith("THE EYE") and lines[1].startswith("THE EYE"):
                content = lines[2:]
            cchars = sum(len(l.strip()) for l in content)
            if not body.strip(): empties.append(n)
            elif cchars < NEAR_EMPTY: near.append((n, cchars, " / ".join(content)[:80]))
            for l in lines:
                for pref, ident in ids_in(l):
                    ids[pref].add(ident)
                    if len(examples[pref]) < 3 and not any(e[1] == l.strip() for e in examples[pref]):
                        examples[pref].append((f"p{n}", l.strip()[:150]))
            # headings: first content line(s)
            head3 = " ".join(content[:3]).upper()
            if "CONTENTS" in head3[:60] and n < 12: continue
            if content:
                l0 = content[0]
                m = re.match(r'^PART\s+([IVX]+|\d+)\s*$', l0.strip())
                if m and len(content) > 1:
                    pt = content[1].strip()
                    if pt.endswith((" and", ",", " or")) and len(content) > 2 and len(content[2]) < 70:
                        pt += " " + content[2].strip()
                    headings.append((n, f"PART {m.group(1)} — {pt}"))
                    continue
                m = re.match(r'^(\d{1,3})\s{2,}(\S.*)$', l0)
                if m:
                    title = m.group(2).rstrip()
                    if (l0.endswith(" ") or title.endswith(("and", "or", "/", "and Execution"))) and len(content) > 1 and len(content[1]) < 70 and not content[1].isupper():
                        title += " " + content[1].strip()
                    if "/ Evidence and" in title or "Evidence and Execution Contract" in title:
                        continue
                    headings.append((n, f"{m.group(1)}  {title}"))
        unit_label = f"{st['units']} pages"
        loc_label = "page"
    else:
        # docx: re-walk body for heading paragraph indexes
        d = docx.Document(f"{S}/src/{tag}.docx")
        n = 0
        for child in d.element.body.iterchildren():
            if child.tag == qn('w:p'):
                n += 1
                p = Paragraph(child, d)
                sty = (p.style.name if p.style is not None else "") or ""
                if sty.lower().startswith("heading") or sty.lower() == "title":
                    t = p.text.strip()
                    if t: headings.append((n, f"[{sty}] {t}"))
        for i, l in enumerate(txt.split("\n"), 1):
            for pref, ident in ids_in(l):
                ids[pref].add(ident)
                if len(examples[pref]) < 3 and not any(e[1] == l.strip()[:150] for e in examples[pref]):
                    examples[pref].append((f"line {i}", l.strip()[:150]))
        unit_label = f"{st['units']} paragraphs, {st['tables']} tables ({st['table_rows']} rows)"
        loc_label = "paragraph #"
    md.append(f"\n## {tag} — {os.path.basename(path)}\n")
    md.append(f"- Path at HEAD: `{path}`\n- Blob: `{blob}` (verified), {size} bytes\n- Extraction: `{S}/{tag}.txt`, source copy `{S}/src/{tag}.{ext}`\n- Units: {unit_label}\n- Characters in extraction file: {st['chars']}")
    if ext == "pdf":
        meta = st.get("meta", {})
        md.append(f"- PDF metadata: producer={meta.get('/Producer','?')!r} creator={meta.get('/Creator','?')!r} title={meta.get('/Title','?')!r}")
        md.append(f"- Empty pages ({len(empties)}): {', '.join(map(str, empties)) if empties else 'none'}")
        md.append(f"- Near-empty pages ({len(near)}): " + ("; ".join(f"p{n} ({c} chars: {s})" for n, c, s in near) if near else "none"))
    md.append(f"\n### Identifier families ({len(ids)})\n")
    md.append("| Prefix | Distinct ids | Range | Example lines |\n|---|---|---|---|")
    for pref, s in sorted(ids.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        srt = sorted(s)
        ex = "<br>".join(f"`{loc}` {l.replace('|','\\|')}" for loc, l in examples[pref])
        md.append(f"| `{pref}` | {len(s)} | {srt[0]} … {srt[-1]} | {ex} |")
    md.append(f"\n### Headings detected ({len(headings)}; listed up to 120, keyed by {loc_label})\n")
    for loc, h in headings[:120]:
        md.append(f"- {loc}: {h}")
    if len(headings) > 120: md.append(f"- … {len(headings)-120} more not listed")
    summary.append({"tag": tag, "units": st["units"], "chars": st["chars"],
                    "prefixes": {k: len(v) for k, v in sorted(ids.items(), key=lambda kv: -len(kv[1]))},
                    "empty": empties, "near": [n for n, _, _ in near], "headings": len(headings)})
open(f"{S}/INVENTORY.md", "w", encoding="utf-8").write("\n".join(md) + "\n")
json.dump(summary, open(f"{S}/summary.json", "w"), indent=1)
for s in summary:
    print(s["tag"], s["units"], "units", s["chars"], "chars", "headings", s["headings"], "empty", len(s["empty"]), "near", s["near"][:10], "prefixes", list(s["prefixes"].items())[:6])
