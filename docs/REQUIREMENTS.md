# Requirements checklist

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| HTML brief → mock run → results | Implemented | Local form, asynchronous image saves, HTML/ZIP results; final browser smoke listed in verification |
| Existing editor and review reused | Tested locally | Private v9 import; public repository contains adapter/UI only |
| No edits to existing hosted app/notebook | Preserved | Separate checkout/runtime; no deployment or source writes there |
| 20 objects, 50 references, 13 sheets | Tested synthetically | Exact source/pixel hashes and original-size tiles checked; real pack must be privately provisioned |
| Frozen AD, rules, prompt/hash versions | Tested | Deterministic compiler; explicit changed semantic details make new prompt hashes |
| Text model optional | Disabled | `gpt-6-sol` interface only; no paid planning |
| Upstream Narrative Collection Designer prompt | Implemented, mock tested | New developer prompt + structured collections schema + eval cases; receives broad category/names/GD brief; real LLM inference/evals pending |
| Enrichment v1.1 user/model provenance | Offline candidate, tested | Latest user constraints override model defaults; shared AD immutable; semantic/visual validation explicitly unperformed |
| Exact image API adapter | Implemented, unwired | One multipart call; 13 sheets; exact model/settings; no retry; entitlement/settings unverified |
| Per-image raw/final/checkpoints | Tested | RGBA native and Lanczos 860×960; partial catalog/contact/HTML/ZIP |
| Run IDs, timing, usage, actual/unknown ledger | Tested | Durable pre-call reservation; validated token breakdown; no automatic top-up |
| Unknown paid request refusal / resume cache | Tested | Ambiguous/error blocks all sends; successful caches hash-verified |
| Dynamic study without each-batch deployment | Tested locally | Saved assets → browser v9 registration → immutable 3 variants; current renderer worker needs an open browser |
| Material labels separate from background labels | Tested | Independent fields, durable revisions, replay and export |
| Preserve old runs, choices, frozen candidates | Tested locally | New study does not mutate prior choices; registration immutable |
| Pattern clipping/visibility diagnostics | Tested | Precomposition coverage/alpha/contrast/margins; no inferred user rejection reasons |
| New version for demonstrated renderer defect | Tested locally | Opt-in v10 stripe continuation; v9 unchanged; broader artistic evaluation pending |
| Foreground occlusion / transparent holes | Tested in browser | Opaque object unchanged; hole shows original underlying composition |
| Purpose, contents, decorations, accessories, theme, detail budget | Tested | Explicit per-object fields; no blanket additions |
| Optional vision ranker | Mock only | Reasons/confidence/axes, allowed palette guard, benchmark interface; no live call or improvement claim |
| Structured semantic quality report | Implemented | Identity/geometry/material/color/shading/shadow/highlight/alpha fields remain unreviewed until human input |
| Public Git: code + synthetic fixtures only | Scan required before every push | Private renderer, source images, actual prompts/results/choices/IDs excluded |
| Cloudflare Workers/Queue/D1/private R2 | Architecture/config prepared | No account/resources/credentials/deployment; fail-closed Worker placeholder |
| Production private auth and assets | Planned | Verify JWT/owner auth on every route; no public R2; current local app is loopback only |
| Server-side cloud rendering/resizing | Planned | Profile bounded Worker/WASM processing; Python/browser prototype is not a cloud port |
| Approved bounded production test | Blocked intentionally | Requires private assets, capability validation, cost baseline, credentials and separate approval |
