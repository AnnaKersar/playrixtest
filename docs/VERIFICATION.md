# Executed offline verification

- 17 Python test cases: frozen prompt/AD/rules, synthetic 50-source/13-sheet exact pixels, tampering, partial-success exports, successful cache resume, ambiguous request refusal, unknown usage, budget exhaustion, feedback replay/revision conflict, prior-study preservation, semantic budgets, user-lock provenance, category/stage constraints, mock ranker and upstream planner-to-compiler contract.
- 10 browser integration checks: 20 assets automatically registered as 60 immutable v9 variants; dimensions/alpha/opaque preservation; reused review UI; durable save/reload, material export, undo, independent editor draft, desktop/mobile overflow.
- 5 HTML flow checks: form launches a fresh mock run; all 20 objects become a study without redeploy; 20 successful per-image saves; standalone HTML has 20 inline PNGs and no scripts; gallery loads all 20 at 860px native width.
- 6 pattern checks: v9 finite-stripe cutoff reproduced before compositing; opt-in v10 extends both margins; gaps preserved; zero-opacity explicit; opaque foreground blocks pattern; transparent hole preserves underlying composition.

The demonstrated stripe case had zero mask coverage in both horizontal margins in v9. In opt-in v10, margin coverage was approximately 59% and 57%. This is a technical reproduction at changed density/scale, **not** a per-candidate explanation of any user's rejection.

All checks used local files, SQLite and an isolated browser. No paid image/text/vision calls. No production answer writes, cloud deployments, credentials or subscriptions. Browser QA needs a privately imported existing renderer; unit tests use only synthetic fixtures.

Remaining: live model entitlement/settings, complete private source pack verification, cloud auth/storage/queue port and resize profiling, human artistic review, held-out AI-ranker benchmark. Mock planner emits a fixed fixture inventory and explicitly does not claim constraint extraction or thematic inference.
