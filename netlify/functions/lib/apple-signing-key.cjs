'use strict';
const {createPrivateKey}=require('node:crypto');
function appleSigningKey(value){
 // Environment editors may retain literal escaped line endings from a PEM paste.
 // Base64 inside the PEM never contains backslashes; normalize only line endings.
 let pem=value.trim();
 if(pem.startsWith('"')){try{const decoded=JSON.parse(pem);if(typeof decoded==='string')pem=decoded;}catch{throw Error('apple_signing_key_invalid');}}
 pem=pem.replace(/\\+r\\+n|\\+n|\\+r/g,'\n');
 // A single-line environment input can strip real PEM newlines entirely.
 const compact=pem.match(/^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PRIVATE KEY-----$/);
 if(compact){const body=compact[1].replace(/\s/g,'');pem='-----BEGIN PRIVATE KEY-----\n'+body.match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----\n';}
 const key=createPrivateKey(pem);
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('apple_signing_key_invalid');
 return key;
}
module.exports={appleSigningKey};
