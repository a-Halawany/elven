# إيقاف مؤقت للمشروع — وثيقة التسليم (2026-10-23)

الوثيقة دي بتقول **وصلنا لفين**، و**إزاي نرجع نكمّل**، و**إيه اللي محتاج يشتغل**، و**الخطة**.
الأسماء التقنية (فروع، ملفات، أوامر، أرقام runs) مكتوبة بالإنجليزي زي ما هي في المشروع.

> الريبو `a-Halawany/elven` **public**. أي حاجة بتترفع عليه بيشوفها الكل.
> الأسرار المحلية في `.eye-local/` **مش** على GitHub ولازم تتحفظ عندك بشكل خاص (شوف §5).

---

## 1. وصلنا لفين

### 1.1 الكود على `main`
- **`main` = `92baa26`** (merge لـ #100). آخر migration: **`0123_b40_source_platform.sql`**.
- آخر stage اتبنت واتدمجت: **B40** — source platform (registry/rights، vault authenticity، intake/scanning، acquisition policy، connector runtime). اتدمجت في #95 (`2f9053b`).
- قبلها، وبالترتيب: B80 → B81 → B50 → B82 → integration pass (0122) → B40.

### 1.2 اللي اتعمل في آخر جلسة (2026-10-21 → 2026-10-23)
| PR | إيه | الحالة |
|---|---|---|
| #95 | B40 كاملة (0123) | merged `2f9053b` |
| #96 | vitest 4.1.11 → 4.1.12 (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp) | merged `46a8569` |
| #97 | redis:8-alpine re-pin `615b4ced…` + postgres:18-alpine re-pin `83148c0b…` + **re-issue لكل الـ 12 SCX records** (موافقة الـ owner) + إصلاح race في fixture الـ B7 telemetry | merged `1a4633b` |
| #98 | postgres re-pin `898c60cb…` + re-scope الـ 12 records (اتغير بس ppc64le child) | merged `5cc4bed` |
| #99 | next 16.3.8 → 16.4.1 (GHSA-2464-fhr4-w9xw CRITICAL، GHSA-p3m5-59mp-jv5r HIGH) + redis `0bf6577d…` | merged `ffd0d80` |
| #100 | B32 health harness: نافذة منتصف الليل (عمر الـ supplier بيتحسب من الـ instant) | merged `92baa26` |
| **#101** | **C17: `DEVELOPMENT_COMPONENTS` 313 → 307** | **مفتوح — مستني قرار (شوف §2.1)** |

التفاصيل الكاملة في `audit/CP6_BATCHES.md` من §B40.0 لحد §B40.18، و`docs/SCANNER_DISPOSITIONS.md` §3.13–§3.15، و`docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md` §8.8–§8.12.

### 1.3 حالة الـ delivery chain على `main` (`92baa26`)
| Workflow | Run | النتيجة |
|---|---|---|
| ci | 39912285573 | ✅ أخضر (أول مرة من بعد `219846f`) |
| C19 lifecycle | 39912285555 | ❌ "missing fixture" (شوف §2.1) |
| C17 finalize | 39921031027 | ❌ الـ closure اتقاس 307 والمسجّل 313 → #101 بيصلحه |
| C19 anchor | 39921135724 | ✅ |

**يعني `main` لسه ما عملش delivery كامل** من آخر مرة (`219846f`، #94).

### 1.4 الـ PRs المفتوحة
- **#101** — مستني القرار في §2.1. الـ ci بتاعه أخضر (39935677581)، والـ C19 lifecycle (39935677687) أحمر **بس** في `delivery-chain-dry` بسبب missing fixture.
- **#70** (B90) — المحتوى بتاعه **موجود في `main` خلاص** (`c5dd1683` ancestor of main). الـ PR بس ما اتقفلش؛ ممكن يتقفل.
- **#42** (docs، 2026-09-08) — قديم وما اتدمجش. محتاج قرار: يتقفل ولا يتحدّث.

### 1.5 الـ demo (eye_demo) على اللاب
- الـ demo database `eye_demo` واصل لـ **0123**. الـ act بتاع B40 held (135 ✓) وstood، والـ release candidate **r9** attested على `89318748` بدون findings مفتوحة، والـ regression walks 82/84 (الاتنين الفاضلين مستنيين B63).
- **الـ containers الشغالة لسه على الـ images القديمة** (قبل الـ re-pins بتاعة 10-22). استبدالها عملية مسجّلة لوحدها، **وقبلها backup جديد** (runbook).
- اتعمل backup وقت الإيقاف: `.eye-local/backups/eye_demo-pause-20261023*.dump` (شوف §5).

### 1.6 الـ stage الجاية: **B84**
- B84 = "Decision/briefing/publishing UX, attention center, governance administration" (F-P7-E-12، F-P7-E-15، F-P7-E-16). الـ dependencies (B80، B81، B82) كلها merged، وهي أول stage في أطول precedence chain.
- **الـ requirement map جاهزة**: `docs/handoff/2026-10-23/b84/MAP.md`، وفيها 130 row (E-12 0/17/26، E-15 1/30/17، E-16 0/30/9)، migration مقترحة **0124**، 6 parts + part للـ acceptance، و**Q1–Q16 أسئلة للـ owner ومع كل سؤال default مقترح** (§9 في الـ map).
- الـ worktree `.claude/worktrees/b84` (branch `phase6-b84` من `1a4633ba`) موجود محلياً وفاضي، ومحتاج يتعمله reset على آخر `main` قبل البدء.

---

## 2. القرارات المستنية الـ owner

### 2.1 (عاجل) قفل الـ chain على `main`
- **المشكلة**: `scripts/gate/c19-fixture.mjs` بيدوّر على publication fixture في **آخر 40 run على `main` بس**. آخر SHA عمل finalize (`219846f`) خرج برا الشباك ده، فـ C19 lifecycle بيفشل في **كل** PR لحد ما `main` يعمل finalize تاني. و`main` مش هيعمل finalize غير لما #101 يتدمج. يعني دايرة مقفولة.
- **الاختيارات**: (أ) موافقة إن #101 يتدمج والـ check الوحيد الأحمر هو `delivery-chain-dry` بسبب missing fixture (bootstrap لمرة واحدة)، وبعدها نتأكد إن الـ chain كلها خضرا؛ (ب) تغيير governed لشباك الـ 40 run في C19 (frozen control).

### 2.2 مواعيد مهمة
- **كل الـ SCX records (SCX-0002…0017) بتنتهي 2026-11-05.** لو الإيقاف عدّى التاريخ ده، الـ C15 gate هيفشل على `main` لحد ما الـ records تتجدد بموافقة الـ owner. وممكن الـ upstream images تتحرك تاني، فيبقى محتاج re-pin. اتبع §3.11–§3.15 في `docs/SCANNER_DISPOSITIONS.md`.
- الـ standing authorization في §3.11 **انتهت** للـ artefacts الجديدة: أي advisory Go جديد في الـ gosu يروح للـ owner.

### 2.3 قرارات تانية مفتوحة (من غير deadline)
1. **ClamAV (D2)**: الـ admission محجوب (مفيش Alpine arm64، والـ Debian فيها 1 CRITICAL + 53 HIGH). الاختيارات: dispositions، أو derived image، أو ننتظر. وطول ما ده مش محسوم، **EXC-P1-001 مفتوح**.
2. **الـ SDK كـ workspace dependency**: محتاج `scripts/gate/target-descriptor.json` (frozen).
3. **تغيير الـ 4 demo credentials**: الخطة جاهزة ومعمول لها rehearsal، **بس ما اتنفذتش** (`evidence/cp6/b40-credential-rotation-plan.md`).
4. **B84 Q1–Q16** (في الـ map).
5. **Flakes متكررة في الـ hosted CI** (كلها موثقة في CP6 §B40.15–§B40.18):
   - `ENOTEMPTY` في `afterAll` بتاع `c15-runner-behaviour` (حصل مرتين، والسبب مش متأكد منه؛ فرضية git maintenance اتنفت). الإصلاح الأدنى المقترح `rmSync(..., { maxRetries })`، بس الملف frozen C15 control.
   - **deadlock في B8 subscription replay** (`phase6-graph-subscriptions-3`، حصل مرتين): ده **product defect** حقيقي في lock order بتاع `graph.subscription_replay_core` (0065)، والإصلاح محتاج migration جديدة.
   - `phase6-review-corrections` §7: `max_elapsed_ms: 1` → test بيعتمد على التوقيت.
   - الـ macOS `c19-lifecycle` "DELIBERATE EVASION": control بيعتمد على التوقيت.
   - inconsistency في GitHub runs listing جوه C19 (`c19-resolve: no ci push run`).
6. **0089**: بيعمل floor بعد round (عمر 9.996 يوم بيتقري "10 days"). مجرد precision nuance.
7. **B63 carriers**: audit-lock contention وحجم الـ trust overview.
8. **#70 / #42**: يتقفلوا ولا لأ.
9. **مساحة الديسك**: حوالي 56 dump قديم في `.eye-local/backups` (≈8 GB)، والديسك كان 99%.

---

## 3. إزاي نرجع نكمّل (خطوة بخطوة)

### 3.1 الماكينة
1. شغّل Docker Desktop. **لو الجهاز نام فترة طويلة اعمل restart لـ Docker Desktop**: ساعة الـ VM كانت متأخرة ~120 ثانية عن الـ host، وده بيخلي tests الـ B32 تفشل محلياً بشكل متقطع.
2. رجّع `.eye-local/` (الأسرار، والـ vault، والـ keys، والـ backups) لو كانت اتنقلت. **مفيش حاجة منها على GitHub.**
3. شغّل الـ containers الأساسية:
   ```bash
   docker start eye-postgres eye-redis
   ```
   ولو هتشتغل على builds متوازية: `docker start eye-redis-b12 eye-redis-b33-4 eye-redis-b33-5 eye-redis-b33-6 eye-redis-b33-7 eye-redis-b94-8 eye-redis-b94-9` (البورتات 6392، 6394–6399).
4. الـ Claude memory بتاعة المشروع: `~/.claude/projects/-Users-halawany-work-personal-mohammed-new-project/memory/` (الـ index في `MEMORY.md`، والتفاصيل في `cp6-b40-start.md`).

### 3.2 الريبو
```bash
git fetch origin --prune
git -C .claude/worktrees/b84 reset --hard origin/main   # worktree فاضي، آمن
```
قبل أي شغل اتأكد من الـ drift:
```bash
pnpm audit
docker buildx imagetools inspect --raw postgres:18-alpine | shasum -a 256
docker buildx imagetools inspect --raw redis:8-alpine | shasum -a 256
gh run list --branch main --limit 10
```
وقارن الـ digests بـ `conformance.manifest.json` → `pinned_images`. لو اتغيرت يبقى محتاج re-pin (§8.4 من الـ maintenance doc)، ولو الـ postgres اتغير فيها **الـ records محتاجة موافقة الـ owner**.

### 3.3 الـ demo
- الـ runbook: `docs/ops/DEMONSTRATION_RUNBOOK.md` (§2 للـ restart، و§32 لـ B40، و§33 لتغيير الـ credentials).
- الـ API على `eye_demo`: `scripts/ops/demo-restart.sh` (أو `--build` بعد تغيير في الكود، أو `--verify-only`).
- الخدمات المساعدة اللي كانت شغالة (من الـ repo root، والـ env من `.eye-local/env`):
  - `node scripts/retention/https-recipient.mjs --self-signed nordwerk-exports.demo.invalid --listen 127.0.0.1:3443`
  - `node scripts/execution/synthetic-erp.mjs --self-signed 127.0.0.1 --listen 127.0.0.1:3444 --bearer-env …` (و`:3454`)
  - `node scripts/attention/local-sinks.mjs --host 127.0.0.1 --smtp-port 2525 --http-port 3446` (و`2535`/`3456`)
  - الـ args الكاملة في أقسام الـ runbook بتاعة B13/B14/B24/B34.
- **الـ act targets**: كل أمر act/walk لازم يحدد `EYE_ACT_TARGET=rehearsal|live` و`EYE_DB_NAME` و`EYE_API` صراحة (`scripts/act-target.mjs`)؛ مفيش default.
- الـ rehearsal بيتعمل دايماً على **نسخة** متعملها restore من backup (API `:3411`، Redis `:6392`، web `:3010`)، **مش** على `eye_demo` مباشرة.

### 3.4 الـ gates محلياً
- الـ recipe: `docs/handoff/2026-10-23/tools/gates.sh <worktree> <label> <redis-port>` (build، unit، web، boundaries، integration على DB جديدة، acceptance، upgrade). المسارات اللي جواه كانت للـ scratchpad القديم، فعدّلها.
- C15 FINAL محلياً: اعمل single-branch clone للـ head، وبعدين:
  ```bash
  node scripts/gate/supply-chain.mjs --out <dir> --trivy-cache <dir> --final --expected-sha <sha>
  ```
  مع الـ scanners الـ pinned (`bash scripts/gate/install-scanners.sh gitleaks trivy`، أو `DEST=<dir>`).
- الـ history scan زي الـ hosted: `tools/glscan.sh`. **الـ hosted بيقرا كل الـ remote branches**، فما تعملش push لـ branch فيه commits مش متغطية بالـ `.gitleaks.toml` اللي على `main`.
- مشاكل محلية معروفة (مش regressions): الـ C15 runner بيعمل timeout تحت الضغط (شغّل `c15-runner-behaviour` لوحده)، و`hermetic-suite-meta` child دايماً بيعمل SIGTERM محلياً، وفرق الساعة في Docker.

### 3.5 قواعد اتعلمناها (مهمة)
- **الـ pre-merge checks** (`pnpm audit`، الـ tags مقابل الـ pins، والـ head) **تتعمل لوحدها قبل أمر الـ merge**، ونقف عند أي finding. (اتعمل merge لـ #98 مرة في نفس الأمر، والسبب ده مسجّل في §B40.16.)
- الـ upstream images والـ advisories ممكن تتغير **بين** الـ PR الأخضر والـ merge، فاتأكد قبلها مباشرة.
- أي fixture بيزرع **DATE** وبيقارنه بـ `now` معرّض لنافذة منتصف الليل.
- `gh pr create` ممكن يرجّع "connection reset" والـ PR يكون اتعمل فعلاً، فاتأكد بـ `gh pr list --head …` قبل ما تعيد المحاولة.

---

## 4. الخطة

**المرحلة 0: نفتح `main` (أول حاجة)**
1. قرار §2.1، وبعده merge لـ #101، ونتأكد من الـ chain كلها: ci → C19 lifecycle → C17 finalize → C19 anchor.
2. لو الـ fixture رجع، نعمل re-run لأي C19 lifecycle كان فشل بسببه.

**المرحلة 1: صيانة قبل 2026-11-05**
1. نجدد الـ SCX records (موافقة الـ owner)، ونعمل re-pin لو الـ images اتحركت.
2. قرارات الـ flakes (§2.3 بند 5)، وأهمها إصلاح الـ B8 replay deadlock (migration جديدة، ومنسقة مع رقم 0124 بتاع B84).
3. نقفل #70 ونقرر في #42.

**المرحلة 2: B84** (حسب `b84/MAP.md` والـ templates في `b40-briefs/`)
1. إجابات Q1–Q16 من الـ owner (أو الموافقة على الـ defaults).
2. DESIGN، وبعده prelude لـ 0124، وبعده 6 parts بالتوازي (Redis 6394–6399)، وبعده integration، وبعده part الـ acceptance.
3. الـ gates، والـ act rehearsal على نسخة، وبعده live على `eye_demo` (backup قبلها)، والـ walks، وبعده bookkeeping (STAGES/FEATURE_TRACKER/controls/schedule-model)، والـ records (CP6 §B84.*)، وPR وhosted green وmerge والـ chain.

**بعد B84**: حسب ترتيب الـ owner للـ account الواحد. الـ candidates الجاهزة: B45 (model fabric)، وبعدها B74 (محتاجة B34 + B45 + B84)، وباقي الترتيب في `audit/delivery/STAGES.csv` و`audit/DELIVERY_PLAN.md`.

---

## 5. حاجات محلية بس (مش على GitHub)
| الحاجة | المكان | ليه مش مرفوعة |
|---|---|---|
| الأسرار، والـ vault، والـ keys، والـ env | `.eye-local/` | أسرار؛ والريبو public |
| backups الـ demo DB | `.eye-local/backups/` (+ `eye_demo-pause-20261023*.dump`) | بيانات الـ demo؛ حجمها كبير |
| 22 WIP branch قديمة (pre-squash parts) | bundle في `.eye-local/archive/local-only-branches-20261023.bundle` | فيها strings الـ gitleaks بيعلّم عليها، ولو اترفعت هتكسر الـ history scan في كل PR وتنشر الحاجات دي public. المحتوى اتدمج في `main` عن طريق الـ squashes |

**احفظ نسخة من `.eye-local/` بشكل خاص** (encrypted drive أو password manager للأسرار).

## 6. الحاجات اللي اتوقفت على اللاب وقت الإيقاف
- الـ demo API (`:3401`)، والـ https recipient (`:3443`)، والـ synthetic ERPs (`:3444`، `:3454`)، والـ local sinks (`2525/3446`، `2535/3456`).
- الـ containers: `eye-postgres`، و`eye-redis`، و`eye-redis-b12`، و`eye-redis-b33-4…7`، و`eye-redis-b94-8/9` (اتعملها **stop** مش remove؛ الـ volumes والداتا موجودة).
- **ما اتلمستش** (مشاريع تانية): `n8n`، و`nginx-proxy-manager`، و`mk-outbound-testdb`.

## 7. الـ branches اللي اترفعت للحفظ
- `pause/handoff-2026-10-23`: الوثيقة دي، والـ B84 map، والـ B40 briefs، والـ tools.
- `archive/main-checkout-wip-20261023`: 3 ملفات vitest reports اتعملها regeneration (مش مهمة، اتحفظت للأمانة).
- `archive/b33-book-wip-20261023`: تعديلات bookkeeping بتاعة B33 ما اتعملهاش commit من 2026-10-09 (غالباً قديمة واتعدّاها `main`، فراجعها قبل ما تستخدمها).
