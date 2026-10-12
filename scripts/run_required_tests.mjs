import {readdirSync,mkdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
// These require a connected browser/server, private imported studies or unchanged original files.
// They remain manual integration checks; they cannot run in a clean CI checkout.
export const manual=new Set(['test_archive_actual_browser.mjs','test_archive_browser.mjs','test_generations_browser.mjs','test_latest_lora.mjs','test_public_demo.mjs','test_owner_redirects.mjs','test_reference_library.mjs','test_private_import.mjs','test_imported_study.mjs','test_archive_seed_import.mjs','test_local_integrations.mjs']);
mkdirSync('review',{recursive:true});
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);if(only&&!/^scripts\/(fixtures\/)?[a-z0-9_-]+\.mjs$/.test(only))throw Error('Invalid test path');
const tests=only?[only.slice(8)]:readdirSync('scripts').filter(f=>/^test.*\.mjs$/.test(f)&&!manual.has(f)).sort();let failed=0;
if(!only)for(const required of ['test_worker.mjs','test_real_resume.mjs','test_reliability_recovery.mjs','test_atomic_guest_budget.mjs','test_guest_budget_reset.mjs','test_unknown_hold_migration.mjs','test_png_security.mjs','test_release_gate.mjs'])if(!tests.includes(required))throw Error('Missing mandatory regression '+required);
for(const test of tests){
 const r=spawnSync(process.execPath,['--import','./scripts/offline-test-guard.mjs','scripts/'+test],{encoding:'utf8',timeout:60000});
 if(r.status!==0){failed++;console.error('FAIL '+test+'\n'+(r.error?.message||'')+(r.stdout||'')+(r.stderr||''));}else console.log('PASS '+test);
}
console.log(`Required checks: ${tests.length-failed}/${tests.length}. Paid requests: 0. Manual integration scripts: ${manual.size}.`);
if(failed)process.exitCode=1;
