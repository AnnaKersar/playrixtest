# Cloudflare Worker bootstrap (no deployment performed)

This branch replaces the universal 503 placeholder with a protected HTML/API application, D1 studies/job/choice ledger, private R2 artifacts and a one-image-per-message Queue consumer. The cloud UI is a small independent mock review interface. It does **not** deploy the private calibrated v9 editor, reproduce its recommendations, or enable paid inference. The existing Python/local editor remains separate and unchanged.

## Verified offline

Run `npm run test:worker` with Node 24. Tests use real WebCrypto signed JWTs and SQLite SQL with D1/R2/Queue adapters; all provider and JWKS responses are synthetic. They exercise authentication, preflight, twenty jobs, native/final PNG alpha and holes, immutable candidates, choice revisions, outbox, duplicate claims, ambiguous timeouts, storage-only recovery and provider multipart/no-retry behavior. This is local integration evidence, not a deployed Cloudflare or actual-provider verification.

Regenerate the checked-in planner contract with `python scripts/build_worker_planner.py` when the versioned source changes. Planner uses fixed public examples; live text inference stays disabled.

## Safe first deployment — only after setup approval

Do not press Deploy merely to publish code. Workers Builds Git integration creates an account API token by default and reuses it for future builds. Connecting the repository grants persistent build access. Deploy writes a Worker and uploads static assets. Later database/bucket/queue creation creates persistent account resources; R2 activation can require a subscription checkout. Cloudflare fees are separate from an image-generation budget. No such resource, subscription, token or deployment was created by this implementation.

The root `wrangler.jsonc` deliberately declares **no D1, R2 or Queue resources**. Recent Wrangler versions can provision resources with missing IDs; there are no incomplete resource declarations here. `workers_dev` and preview URLs are false, `run_worker_first` is true, and all content including HTML and errors is behind signature-verified owner authentication. A missing Access configuration returns 503, not unprotected HTML.

1. Review/merge this branch before deploying `main`, or explicitly choose this branch. Pin the local/Builds CLI through `npm install` and the committed `package.json` (`wrangler` 4.92.0).
2. For the bootstrap alone: build command blank; deployment command `npx wrangler deploy`. This creates the Worker/static assets only. It does not create application storage. Do not enable preview URLs or a public workers.dev endpoint.
3. Set up an owner-only Cloudflare Access self-hosted application for the intended hostname, with an Allow policy for the owner's exact email. Add the same protected custom hostname to the Worker. Access setup and hostname routing are account changes requiring the owner's approval. No hostname or application ID is assumed in source.
4. Worker runtime variables: `ACCESS_TEAM_DOMAIN` = the exact `https://<team>.cloudflareaccess.com` issuer, without trailing slash; `ACCESS_AUD` = that application's AUD; `OWNER_EMAIL` = exact permitted email. Keep `LIVE_GENERATION_ENABLED=false`. These owner-specific values stay in Dashboard, not this public repository. `keep_vars:true` preserves Dashboard variables; it does not promise to preserve unconfigured bindings.
5. Visit the protected hostname as owner. `/api/preflight` will report missing DB/ARTIFACTS/IMAGE_JOBS and the migration. HTML loads after valid authentication but mock execution remains disabled until storage is configured. Test an unauthenticated/incognito request to HTML, JS, API and image URLs: no application data should be returned.

With no authorized hostname or Access application yet, the bootstrap is deliberately unreachable/503. Do not solve that by weakening auth.

## Add storage only after resource/tariff approval

Create exactly one existing D1 database, one **private** R2 bucket (disable public r2.dev/custom public bucket access), and one Queue. No public object URLs are used. Record the actual database UUID and resource names. These are deployment identifiers, not invented placeholders.

Set build environment variables `STUDIO_D1_ID`, `STUDIO_D1_NAME`, `STUDIO_R2_BUCKET`, `STUDIO_QUEUE` to those actual existing resources. Run `node scripts/configure_worker.mjs`. It validates that every identifier is supplied and writes ignored `wrangler.generated.jsonc` without network requests. Review that file before use.

For subsequent Workers Builds use build command `node scripts/configure_worker.mjs` and deploy command `npx wrangler deploy --config wrangler.generated.jsonc`. The generated configuration declares:

| Binding | Resource | Effect |
| --- | --- | --- |
| `ASSETS` | bundled `cloudflare/public` | Authenticated static HTML/JS/CSS |
| `DB` | existing D1 UUID | Durable runs, attempts, budget, choices/events |
| `ARTIFACTS` | existing private R2 bucket | Frozen manifests, references, raw/final PNGs |
| `IMAGE_JOBS` | existing Queue producer and consumer | One job per message; batch/concurrency 1, retries 0 |

Apply the initial schema once to the **chosen actual database name** with `npx wrangler d1 execute ACTUAL_DATABASE_NAME --remote --file cloudflare/schema.sql --config wrangler.generated.jsonc`. This writes tables and an **unapproved zero budget** baseline. Then deploy with the generated config. These commands are instructions only; they have not been run remotely.

Recheck `/api/preflight`, create a one-object mock run, refresh its status, inspect the transparent 860×960 PNG and manifest, save a candidate choice, reload and export JSON. Mock uses no OpenAI secret or provider calls, but Cloudflare execution/storage can be billable. Expand to twenty jobs only after that account smoke test.

## Live provider remains a separate gate

The versioned adapter sends one POST to `/v1/images/edits`, exact model `gpt-image-2.5-sunburst-2026-09-08`, thirteen PNG reference sheets, 1376×1536, medium, transparent, n=1. Entitlement, model availability, runtime memory/CPU and the actual request contract have **not** been verified by a paid request. Resizing uses premultiplied Lanczos-3 JS, not Pillow; it preserves alpha but is not claimed pixel-identical to the existing Pillow pipeline. Private refs/Art Direction were not uploaded.

Before any live enablement the owner must separately approve the deployment/cost plan, validate the private pack and visual pipeline, and manually enter the previously chosen OpenAI key as `OPENAI_API_KEY` **Worker Secret**. Never enter it into a build command, public source, client UI or plaintext variable. No new key is required or created by this code.

Provision a private R2 `reference-pack/v1` JSON manifest with `model`, `reference_count:50`, exact `art_direction` and its SHA-256, and 13 ordered `sheets` entries `{key,sha256,count}`. Keys must start `references/`, dimensions 896×1040, counts 4 for the first twelve and 2 for the last. `sha256` is encoded PNG SHA. Validate original 50-source membership, 1:1 tile layout and labels offline before signing/pinning; the Worker verifies pinned sheet hashes/dimensions/counts, not semantic provenance or tile reconstruction. Set `REFERENCE_MANIFEST_KEY`, `APPROVED_REFERENCE_MANIFEST_SHA256` and `APPROVED_ART_DIRECTION_SHA256` privately. Do not publish this manifest or its source data.

An explicit, verified historical billing baseline and ceiling must be written to D1 `budget` in integer nanodollars (`$1 = 1,000,000,000`), then `approved=1`. No historical values are guessed. Any historical unknown amount blocks live requests. Each live run additionally requires an exact approval string in the API request. Setting `LIVE_GENERATION_ENABLED=true` is a deliberate later operation, not part of bootstrap instructions.

The $1 per-attempt reservation is a conservative admission estimate, **not a provider hard spending cap**. Actual token usage may exceed it; subsequent jobs use actual usage. Unknown usage/billing blocks later live jobs. Independent provider-side budget controls are needed for a hard external ceiling.

## Failure semantics

D1 atomically inserts a unique job claim and checks the global budget. Any existing claim—running, complete or unknown—prevents another provider call. A crash after claiming but before sending may therefore leave an unused reservation; safety is preferred over automatic retry. No code deletes claims or blindly resubmits them.

Raw PNG and a receipt are persisted before finalization. `/api/recover` reads only an existing durable receipt; it never contacts a provider. Missing receipts require manual billing reconciliation. Unknown attempts retain reservations. A pending outbox can be dispatched again; duplicate queue messages remain safe because the claim is unique. Queue acknowledgements alone are not success: inspect D1 job/attempt status. A configuration failure before claim can leave the job queued; fix configuration and explicitly re-enqueue its original job ID. Never re-enqueue a replacement/new job to bypass an ambiguous attempt.

Choices freeze three exact candidate configs, use optimistic revisions and idempotent event IDs, and export the event history. `undo` records an explicit cleared choice. No training, semantic quality claim or automatic art approval follows from a saved choice.

References: [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [R2 setup](https://developers.cloudflare.com/r2/get-started/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
