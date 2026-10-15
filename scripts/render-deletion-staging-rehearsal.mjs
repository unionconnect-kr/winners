import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const STAGING='obpkzecgswnfuyhwvncd';
export function renderDeletionRehearsal(projectRef){
 if(projectRef!==STAGING)throw Error('This rehearsal is restricted to the selected MANEE Staging project');
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const inventory=read('../security/account-deletion-preflight.sql');
 const start='do $inventory$\n',end='end $inventory$;';
 if(inventory.split(start).length!==2||inventory.split(end).length!==2)throw Error('Inventory block contract changed');
 // Reuse the actual inventory body inside the disposable write transaction.
 // Its standalone operator file retains the separately tested READ ONLY wrapper.
 const block=inventory.slice(inventory.indexOf(start)+start.length,inventory.indexOf(end))+'end;';
 const template=read('../security/account-deletion-staging-rehearsal.sql');
 if(template.split('-- @inventory-body').length!==3)throw Error('Expected preflight and postflight markers');
 return template.replaceAll('-- @inventory-body',()=>block);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--project-ref')throw Error('Usage: node scripts/render-deletion-staging-rehearsal.mjs --project-ref '+STAGING);
 process.stdout.write(renderDeletionRehearsal(args[1]));
}
