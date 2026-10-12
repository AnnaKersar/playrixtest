import {createWorker} from './worker.mjs';
import {createPublicGuestWorker} from './public-guests.mjs';
export function createVisitorEntry(deps={}){return createPublicGuestWorker((request,env,identity)=>createWorker({...deps,authenticate:async()=>identity}).fetch(request,env));}
const visitor=createVisitorEntry();export default {fetch(request,env){return visitor.fetch(request,{...env,PUBLIC_ASSETS:env.ASSETS});},async scheduled(event,env){return createWorker().scheduled(event,env);},async queue(batch,env){return createWorker().queue(batch,env);}};
