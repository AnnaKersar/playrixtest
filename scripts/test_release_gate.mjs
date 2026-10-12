import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const c=JSON.parse(readFileSync('wrangler.jsonc','utf8')),p=JSON.parse(readFileSync('package.json','utf8'));
assert.equal(c.build.command,'npm run check');assert.equal(p.scripts.check,'npm run test');assert.equal(p.scripts.test,'node scripts/run_required_tests.mjs');
const r=spawnSync(process.execPath,['scripts/run_required_tests.mjs','--only=scripts/fixtures/release-failure.mjs'],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/FAIL fixtures\/release-failure/);
const workflow=readFileSync('.github/workflows/required-checks.yml','utf8');assert.match(workflow,/npm run check/);assert(!workflow.includes('continue-on-error'));
console.log('PASS actual failed-test exit blocks Wrangler build and CI checks; no provider');
