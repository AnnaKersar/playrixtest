import assert from 'node:assert/strict';import {testComparison} from '../cloudflare/visitor-public/test-comparison.mjs';
const c=testComparison([{card:'our1',votes:2,shown:4},{card:'our2',votes:1,shown:1},{card:'ref1',votes:1,shown:10},{card:'ref2',votes:2,shown:20}],['our1','our2'],{rounds:12,found:5});
assert.deepEqual(c,{ours:{votes:3,shown:5},refs:{votes:3,shown:30},rounds:12,found:5});assert.equal(c.ours.votes/c.ours.shown,.6);assert.equal(c.refs.votes/c.refs.shown,.1);
assert.equal(testComparison([],[],null).rounds,0);console.log('PASS source totals weighted by exposure, round outcomes, empty sample');

