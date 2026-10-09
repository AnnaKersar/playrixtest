from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
prompt=(root/'prompts/narrative-collection-designer-v1.2.md').read_text(encoding='utf8')
examples=json.loads((root/'config/enrichment-v1.1-examples.json').read_text(encoding='utf8'))['examples']
schema=json.loads((root/'config/planner-output.schema.json').read_text(encoding='utf8'))
code="// Generated from the versioned public planner contract by scripts/build_worker_planner.py.\nimport { sha } from './provider.mjs';\nexport const PLANNER_VERSION='narrative-collection-designer/v1.2';\n"
code+='export const plannerPrompt='+json.dumps(prompt,ensure_ascii=False)+';\nconst examples='+json.dumps(examples,ensure_ascii=False)+';\nexport const plannerSchema='+json.dumps(schema,ensure_ascii=False)+';\n'
code+='''export async function planMock(body) {
 const theme=body.theme||'',gd=body.gd_brief||'';
 if(typeof theme!=='string'||!theme.trim()||theme.length>4000||typeof gd!=='string'||gd.length>4000)throw Object.assign(Error('Category and brief must be bounded text'),{status:400});
 return {version:PLANNER_VERSION,provider:'mock',llm_inference:false,review_required:true,warning:'Fixed generic inventory; thematic fit and constraint extraction were not evaluated.',prompt_sha256:await sha(plannerPrompt),objects:examples.map((e,i)=>({object_id:String(i+1).padStart(3,'0'),name:e.name,brief:e.brief})),request_preview:{model:'gpt-6-sol',execution_enabled:false,messages:[{role:'developer',content:plannerPrompt},{role:'user',content:JSON.stringify({category:theme,gd_brief:gd})}],output_schema:plannerSchema}};
}
'''
(root/'cloudflare/planner-contract.mjs').write_text(code,encoding='utf8')
