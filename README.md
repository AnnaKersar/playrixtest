# AI Card Studio

The default Cloudflare deployment now opens a public, synthetic pattern editor with no visitor login. Paid generation is disabled. Owner login at `/owner.html` requires a manually entered `OWNER_PASSCODE` Secret and D1 session storage. Private assets and historical studies are not public.

**Dashboard:** leave Build command blank; deploy command `npx wrangler deploy`. The nine public-safe static assets are checked in, so no separate build step is required. The previous protected deployment configuration is preserved as `wrangler.access.jsonc`; this does not change account-level Cloudflare Access rules.

Local source and optional server integration remain below.

# AI Card Studio — local mock MVP

Browser workflow: **brief → run → saved results → three procedural alternatives → review → editor draft**. No paid API calls, keys, cloud services or subscriptions are enabled. Demo images are synthetic shapes, not examples of artistic quality.

## Run

Python 3.11+ and Pillow are required. Node 22+ and Chromium/Edge are optional for browser QA.

```sh
python -m pip install -r requirements.txt
python -m studio.server --port 5190
```

Open **http://127.0.0.1:5190/**. Edit twenty briefs and click **Создать mock-партию**. Successful images save immediately. Run cards link to standalone HTML results, ZIP and review. `results.html` inside each ZIP opens directly without a server, network calls or keys.

The private calibrated renderer is intentionally **not in this public repository**. Original artwork, measured palettes, private prompts and results are excluded. Reuse an authorized existing editor checkout locally:

```sh
python scripts/import_editor.py /path/to/existing-editor-checkout
```

This imports v9 into ignored `private/editor/`, removes embedded source rasters and adapts the existing review interface. It does not modify the source checkout. Without that renderer, mock images and HTML exports work, but procedural registration/editing remains unavailable. This is an integration boundary, not a replacement renderer.

## Guarantees and limits

- SQLite persists runs, prompt/reference hashes, jobs, immutable candidates, feedback revisions and idempotent events.
- Raw RGBA: 1376×1536; Lanczos export: 860×960. Alpha max 254 is accepted; contact previews source-over composite onto a neutral background.
- Every success refreshes manifests, ledger, partial contact sheet, HTML and ZIP. Failures retain successful outputs.
- A $1 unknown-billing reservation is durable before a request. Unknown/interrupted/error states stop continuation: no automatic retry/top-up. Reservation is **not** a provider hard cap.
- The public demo budget is $100 with zero historical spend. A production run requires a verified private cost/reserve baseline, not this synthetic default.
- Fixed image contract: `gpt-image-2.5-sunburst-2026-09-08`, medium, transparent PNG, one image, 13 sheets. Model entitlement/current parameter support are **not production-verified**. Live entry points are blocked; no model/quality/reference fallback.
- Optional `gpt-6-sol` planner is disabled. Approved Art Direction can be compiled deterministically and versioned without paid planning.
- Material feedback is separate from background feedback. Artistic acceptance/learning remain false. Reviews never trigger regeneration.
- Semantic detail budgets are explicit: contents/decorations/accessories appear only when specified. The compiler does not fill every container or decorate every object.
- Mock ranker records reasons, confidence and axes; it is not an AI selector or evidence of improved harmony. Benchmarking keeps “none” separate. Live vision needs separate approval.

## Rendering and tests

v9 is reused unchanged. Opt-in v10 continues finite vertical-stripe geometry to inverse-transformed viewport bounds. Frozen v9 studies remain unchanged. Pattern QA measures coverage, opacity, contrast and margins before object/surface occlusion. Ring endings and transparent gaps are not automatically errors. Artistic review of v10 is pending.

```sh
python -m unittest discover -v
```

Tests cover compiler integrity, synthetic 50-source/13-sheet pixel hashes, corruption, partial exports, unknown billing, retry refusal, budget exhaustion, feedback/replay/conflict, prior-study preservation, semantic budgets and ranker gates. Browser integration tests require the private renderer and isolated Edge. See [verification](docs/VERIFICATION.md).

## Deployment boundary

The HTML app binds loopback and rejects foreign Host/Origin values. It is not a multi-user production server. Cloudflare configuration is prepared, **not deployed**. See [Cloudflare plan](docs/CLOUDFLARE.md) and [requirements status](docs/REQUIREMENTS.md).

`private/`, `runtime/`, `.env*`, PNGs, notebooks, ZIPs and user responses must stay out of git. No existing hosted application is migrated by this repository.
