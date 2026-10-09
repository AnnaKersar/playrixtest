# Cloudflare target — prepared, not deployed

One Worker serves the HTML app/API and consumes one Queue. D1 stores run/job IDs, unique attempt claims, revisions, choice events and ledger; private R2 stores frozen inputs, 13 sheets, native/final PNG, manifests and exports. The generic study page reads a dynamic registry, so batches do not redeploy HTML.

One Queue message is only a job ID. Start with batch size 1 and consumer concurrency 1. Atomically reserve budget and claim a unique attempt before any billable call. At-least-once delivery must never repeat an already reserved/unknown call. A timeout or crash after submission is manual review, even if the queue redelivers it. A D1 outbox should cover the database/enqueue gap. Storage-only recovery can retry; image generation cannot retry automatically.

## Verified official limits (2026-10-09)

- Workers: 128 MB/isolate; Free 10 ms CPU, Paid default 30 s and configurable up to 300 s. API network waiting is not CPU. `waitUntil` only extends work by 30 s after response/disconnect; use Queue consumers for image work. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Queues: 128 KB/message, 15-minute consumer wall time; Free retention 24 h, paid configurable to 14 days. Keep images and prompts out of messages. [Queue limits](https://developers.cloudflare.com/queues/platform/limits/)
- D1: maximum row/string/BLOB 2 MB, 100 bound parameters/query. Keep large raster inputs/exports in R2. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- R2: approximately 5 GiB single-part upload, approximately 5 TiB object limit; one write/second to the same key. Use immutable per-run/per-attempt keys. [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)

Paid Workers is the likely fit for multipart/PNG processing, but this is a profiling recommendation, not authorization for a subscription. Do not assume Python/Pillow runs unchanged in Workers. Retain native PNG immediately, then profile a bounded WASM resize stage or separately approved processing option for actual 860×960 exports. Bounded reference fetch concurrency and streaming avoid duplicate 13-sheet buffers within 128 MB.

## Private data on a public code repository

Do not enable an R2 public bucket or r2.dev. Serve assets only through authenticated Worker routes. Protect UI, API, assets and preview routes with verified Access JWT validation/owner authorization; checking an arbitrary header alone is insufficient. `run_worker_first=true` allows authentication before static assets. workers.dev/previews are disabled in the example. No R2 bucket, queue, database, access policy, login, secret or subscription is created by these files.

## Remaining explicit steps

1. Confirm Cloudflare account, owner-only audience, deployment destination and recurring/overage budget. Existing image budget does not authorize Cloudflare fees.
2. Approve any required Workers/R2 subscription and new security grants. Connect the account through an approved flow.
3. Implement and test the D1/R2/Queue adapters, transaction/outbox recovery, verified authentication, bounded PNG processing and private asset routes. The included Worker is intentionally fail-closed and cannot run paid jobs.
4. Privately provision the existing renderer, all original references and approved frozen contract; verify source and sheet pixel hashes.
5. Provide API secrets through secure setup, verify model entitlement and exact settings, reconcile actual historical costs/reserves, then approve a bounded production test.
6. Separately benchmark a real vision ranker against held-out human choices. No improvement is assumed from the mock ranker.

The current hosted editor is not migrated or modified by this plan.
