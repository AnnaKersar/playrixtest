# Import existing packages without choosing a folder

The owner pages expose `transfer_reference_pack` and `transfer_private_study` through the browser's `document.modelContext` when supported. They use the existing owner-only, same-origin import endpoints. No credentials, reference bytes or study data are committed to public assets.

For the reference pack, call `status`, upload only the missing approved hashes with `file` (SHA-256 and base64 bytes), then `commit`. The final server operation verifies all 50 originals and the exact 13 sheets before activation. Original reference cards already in the 160 library are reused.

For v9, call `prepare` with the original `private-import.json`, retain `packageHash` and `available_sha256`, upload missing files with `file`, then `commit`. Existing differing immutable files are rejected. Repeating prepare resumes verified uploads. The renderer and saved study remain owner-only.

A standard-library Python alternative imports directly from the original ZIPs:

```bash
python3 scripts/import_packages.py --references Original50_And_13_Sheets.zip --private Private_v9_Study_Import.zip
```

It prompts for the existing owner passcode without echo, retains the session only in memory, logs out on completion, verifies every local file before transfer, and stops on errors. Running it again resumes verified files. It never performs paid generation, changes budget records, or publishes the historical archive. No arbitrary source URLs are accepted.

Manual multi-file selection remains available as a fallback; a directory picker is no longer required. This change does not enable live generation or configure the queue.
