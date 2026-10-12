import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {textRequest,parsePlan,strictSchema,textCost} from '../cloudflare/text-planner.mjs';
import {plannerSchema} from '../cloudflare/planner-contract.mjs';
import {privateEditor} from '../cloudflare/private-editor.mjs';
import {sha} from '../cloudflare/provider.mjs';
const checks=[];function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
const schema=strictSchema(plannerSchema);function fixture(s){if(s.enum)return s.enum[0];if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,fixture(v)]));if(s.type==='array')return [];return 'synthetic';}
const plan=fixture(schema),collection=fixture(schema.properties.collections.items),object=fixture(schema.properties.collections.items.properties.objects.items);Object.assign(object,{display_name:'Whistle',main_identity:'Brass whistle',subject_semantic_key:'whistle',theme_facet:'Start signal',theme_role:'A playful whistle marks the surprise moment',living_creatures:'none',semantic_family:'tool',factual_checks:['The loop attaches to the whistle body','The mouthpiece has a coherent opening']});collection.objects=[object];plan.collections=[collection];plan.art_direction_version='synthetic-v1';plan.art_direction_sha256='a'.repeat(64);
const frozen={input:{immutable_art_direction:{version:'synthetic-v1',sha256:'a'.repeat(64)}}};
const payload={status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(plan)}]}],usage:{input_tokens:5,output_tokens:8,input_tokens_details:{cached_tokens:2}}};
check('strict schema and valid structured plan',()=>{assert.equal(schema.additionalProperties,false);assert.equal(parsePlan(payload,frozen).objects.length,1);});
check('refusal and incomplete output rejected',()=>{assert.throws(()=>parsePlan({...payload,status:'incomplete'},frozen));assert.throws(()=>parsePlan({...payload,output:[{content:[{type:'refusal'}]}]},frozen));});
check('unknown properties rejected; reported Art Direction metadata cannot change the pinned version',()=>{assert.throws(()=>parsePlan({...payload,output:[{content:[{type:'output_text',text:JSON.stringify({...plan,extra:true})}]}]},frozen));const parsed=parsePlan({...payload,output:[{content:[{type:'output_text',text:JSON.stringify({...plan,art_direction_version:'changed'})}]}]},frozen);assert.equal(parsed.art_direction_version,'synthetic-v1');});
check('C3 keeps meaningful surface',()=>{const p=structuredClone(plan);p.collections[0].objects[0].production_category='C3';p.collections[0].objects[0].asset_stage='foreground_only';assert.throws(()=>parsePlan({...payload,output:[{content:[{type:'output_text',text:JSON.stringify(p)}]}]},frozen));});
let calls=0;const env={LIVE_PLANNER_ENABLED:'true',OPENAI_API_KEY:'synthetic-not-a-credential'};await assert.rejects(()=>textRequest(env,frozen,async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(init.body);assert.equal(b.text.format.strict,true);assert.equal(b.store,false);assert.equal(init.redirect,'error');return new Response('',{status:429});}));check('single-send adapter with structured output and no retry',()=>assert.equal(calls,1));
await assert.rejects(()=>textRequest({...env,LIVE_PLANNER_ENABLED:'false'},frozen,()=>{calls++;}));check('disabled text adapter sends nothing',()=>assert.equal(calls,1));
check('usage accounting distinguishes cached tokens and unknown',()=>{assert.equal(textCost(payload.usage,{input:5,cached:1,output:20}),177);assert.equal(textCost({},{}),null);});
console.log('PASS current planner schema, metadata pinning, construction checks, one-send adapter and usage accounting; no external requests');
