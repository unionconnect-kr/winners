// verifyJwt must perform cryptographic verification against Google's public keys.
export function createPushAuthenticator({verifyJwt,email,audience}) {
 return async token=>{
  const {payload}=await verifyJwt(token,{issuer:['https://accounts.google.com','accounts.google.com'],audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email','email_verified']});
  if(payload.email!==email||payload.email_verified!==true)throw Error('unauthorized');
  return true;
 };
}
