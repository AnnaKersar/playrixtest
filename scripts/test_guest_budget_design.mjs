// Isolated budget-design tests only. Does not change application auth/schema or real ledgers.
import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE scopes(id TEXT PRIMARY KEY,cap INTEGER,known INTEGER,unknown INTEGER);CREATE TABLE calls(id TEXT PRIMARY KEY,scope TEXT,kind TEXT,reserve INTEGER,actual INTEGER,status TEXT);INSERT INTO scopes VALUES('project',100000000000,0,0),('guest-shared',5000000000,0,0),('guest-a',5000000000,0,0),('guest-b',5000000000,0,0);`);
const amount=(scope)=>db.prepare(`SELECT COALESCE(SUM(COALESCE(actual,reserve)),0) n FROM calls WHERE (?='project' OR scope=?)`).get(scope,scope).n;
function claim(id,scope,reserve,kind='image'){return db.prepare(`INSERT OR IGNORE INTO calls SELECT ?,?,?,?,NULL,'reserved' WHERE
EXISTS(SELECT 1 FROM scopes p WHERE p.id='project' AND p.unknown=0 AND p.known+COALESCE((SELECT SUM(COALESCE(actual,reserve)) FROM calls),0)+?<=p.cap)
AND NOT EXISTS(SELECT 1 FROM calls WHERE status='unknown')
AND (?='owner' OR EXISTS(SELECT 1 FROM scopes s WHERE s.id=? AND s.unknown=0 AND s.known+COALESCE((SELECT SUM(COALESCE(actual,reserve)) FROM calls WHERE scope=?),0)+?<=s.cap))`).run(id,scope,kind,reserve,reserve,scope,scope,scope,reserve).changes===1;}
let n=0;const check=(name,fn)=>{fn();n++;console.log('PASS '+name);};
check('shared guest cap counts both text and images',()=>{assert(claim('a-text','guest-shared',1000000000,'text'));assert(claim('b-image','guest-shared',4000000000));assert(!claim('new-run','guest-shared',1));});
check('duplicate request ID cannot reserve twice',()=>{assert(!claim('a-text','guest-shared',100));assert.equal(amount('guest-shared'),5000000000);});
check('stable per-person scope persists across runs and refresh',()=>{assert(claim('run1-a','guest-a',3000000000));assert(!claim('run2-a','guest-a',3000000000));assert(claim('run1-b','guest-b',3000000000));});
check('actual usage replaces reservation without resetting accumulated spend',()=>{db.prepare("UPDATE calls SET actual=500000000,status='complete' WHERE id='a-text'").run();assert.equal(amount('guest-shared'),4500000000);assert(claim('retry-new-attempt','guest-shared',500000000,'text'));assert(!claim('over-limit','guest-shared',1));});
check('competing admissions cannot oversubscribe final remaining amount',()=>{const wins=['parallel-1','parallel-2'].map(id=>claim(id,'guest-a',2000000000));assert.equal(wins.filter(Boolean).length,1);});
check('owner bypasses guest cap but remains under project cap',()=>{assert(claim('owner-1','owner',80000000000));assert(!claim('owner-2','owner',10000000000));});
check('ambiguous provider result retains reservation and blocks new paid calls',()=>{const before=amount('project');db.prepare("UPDATE calls SET status='unknown' WHERE id='run1-b'").run();assert.equal(amount('project'),before);assert(!claim('after-unknown','owner',1));});
check('historical $1.10 remains unknown and cannot be cleared by run identity',()=>{db.prepare("UPDATE calls SET status='complete',actual=reserve WHERE status='unknown'").run();db.prepare("UPDATE scopes SET unknown=1100000000 WHERE id='project'").run();assert(!claim('fresh-browser-owner','owner',1));assert(!claim('fresh-browser-guest','guest-b',1));assert.equal(db.prepare("SELECT unknown FROM scopes WHERE id='project'").get().unknown,1100000000);});
console.log(JSON.stringify({passed:n,scopeSelected:false,providerCalls:0,productionChanges:0}));db.close();
