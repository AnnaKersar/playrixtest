# Historical archive handoff

This change publishes the confirmed historical record separately from studio UI, editor and reference import work. It does not run generation or change billing, credentials, model pins, queue configuration or production generation switches.

## Access and exports

- Public archive: https://playrixtest.acasyna.workers.dev/archive
- Active manifest: https://playrixtest.acasyna.workers.dev/api/archive
- Published snapshot: `/archive-seed/history-v1/archive-manifest.json`
- Missing-media inventory: `/archive-seed/history-v1/missing-media.json`
- Additional recovery candidates: `/archive-seed/history-v1/recovery-candidates.json`
- Original raster bytes: `/api/archive/image/<sha256>`
- Repository package: `cloudflare/visitor-public/archive-seed/history-v1/`

No owner login is needed for reading the published archive. Owner uploads retain their existing authenticated, same-origin requirements. An explicitly published R2 archive takes precedence over the packaged snapshot; a storage failure returns an error instead of silently substituting a different version.

## Confirmed scope

- 6 chapters; 56 narrative records plus one original-reference collection = 57 entries.
- 445 historical artifact records in the source inventory. Records can repeat files and are not independent generation counts.
- 101 inventory records recovered, representing 91 unique historical raster files.
- All 160 original Playrix references retained byte-for-byte.
- 251 unique published images, 104,637,917 bytes in total.
- 344 inventory records still lack available original files. The missing-media export records run ID, filename and SHA-256 where known. No replacement images were generated.

Narratives preserve hypotheses, changes, test methods, outcomes, feedback, decisions and evidence labels. Missing separate feedback is explicitly marked. Comparisons and derived compositions have separate roles; they are not counted as new generations. Dates without direct confirmation remain inferred or unknown. Historical cost estimates are not summed and are not provider invoices.

Subsequent user clarification: ice cream is C1; the DJ deck is C2. The reference entry records this clarification without rewriting earlier historical classifications. Current studio category changes belong to the other development workstream.

## Verification

`node scripts/test_archive_seed.mjs` validates schema, every asset's SHA-256 and byte length, required narrative fields, anonymous reads, missing/private key rejection, active R2 precedence and failure behavior. `node scripts/test_experiment_archive.mjs` covers authenticated imports, same-origin checks, raster/hash validation and incomplete-publication rejection. `node scripts/test_archive_actual_browser.mjs` loads the actual archive and checks 57 entries, chapter controls, attribution, uncertainty labels, search and a 390 px mobile viewport. The synthetic archive browser test retains the text-injection fixture.

The privacy scanner allows only the exact hash/size/extension-matched public archive files listed in this manifest. Raw notebooks, private paths, transfer IDs, credentials and private logs are excluded.

## Continuing recovery

The cloud workspace reported 124 additional original PNGs after excluding the 91 already published. Its index reports 114 matching missing records; ten recovered notebook exports require explicit provenance matching. These bytes are not included here: the supported Library materialization of the first package returned HTTP 403 on the Windows executor. The complete candidate hash/size/run index is included for continuation, but its files must be materialized and verified in an authorized executor before publication. Ten Library packages and their exact IDs were handed directly to the continuing development chat; private transfer links are not published.

1. Match recovered original bytes against SHA-256 in `missing-media.json` and the original inventory. Deduplicate by hash; retain all supported record associations.
2. Review each image's role and provenance. Do not relabel contact sheets or composites as independent raw generations.
3. Add only approved public raster files. Update entries, assets, missing records and counts together; preserve uncertainty and previous decisions.
4. Run both archive server tests, browser checks and `scripts/privacy_scan.py`; check current upstream commits before merging.
5. Publish a new reviewed snapshot, or use the existing owner archive import for a complete manifest and all matching images.

The archive records evidence, not readiness of the paid-generation pipeline. Queue activation, journal database migration, exact generation reference package pins and budget preflight remain outside this change.
