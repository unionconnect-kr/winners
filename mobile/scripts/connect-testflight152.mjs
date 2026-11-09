import {pathToFileURL} from 'node:url';
import {connectTestFlight} from './connect-testflight.mjs';

export async function connectTestFlight152(env,options){
  if(env.MANEE_INTERNAL_BUILD!=='ios-20261106-1.52')throw Error('INTERNAL_CONNECT_NOT_REQUESTED');
  return connectTestFlight(env,options);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {console.log(JSON.stringify(await connectTestFlight152(process.env)));}
  catch(error){
    console.error(/^INTERNAL_CONNECT_[A-Z_]+(?:_\d{3})?$/.test(error.message)?error.message:'INTERNAL_CONNECT_FAILED');
    process.exitCode=1;
  }
}
