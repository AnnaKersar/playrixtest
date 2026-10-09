import argparse,json
from pathlib import Path
from .pipeline import Store,MockProvider,compile_briefs,build_sheets
p=argparse.ArgumentParser();p.add_argument('--data',default='runtime');sub=p.add_subparsers(dest='command',required=True)
c=sub.add_parser('run-mock');c.add_argument('--spec',required=True);c.add_argument('--briefs');c.add_argument('--sources');c.add_argument('--run-id');c.add_argument('--resume');c.add_argument('--fail-at',type=int)
c=sub.add_parser('verify-refs');c.add_argument('--spec',required=True);c.add_argument('--sources',required=True)
a=p.parse_args();spec=json.loads(Path(a.spec).read_text(encoding='utf8'));sheets=build_sheets(spec,a.sources) if a.sources else {}
if a.command=='verify-refs':print(json.dumps({'verified_sheets':len(sheets)}))
else:
    if a.briefs:spec=compile_briefs(spec,json.loads(Path(a.briefs).read_text(encoding='utf8')))
    store=Store(a.data);run=a.resume or store.create(spec,a.run_id)
    print(json.dumps(store.execute(run,MockProvider(fail_at=a.fail_at),sheets)))
