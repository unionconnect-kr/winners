// Deployment values are server-owned. A request cannot select its Firebase
// project, Android package, or Supabase environment.
const deployments = Object.freeze({
  'https://obpkzecgswnfuyhwvncd.supabase.co': Object.freeze({
    environment: 'staging', projectId: 'manee-staging', packageName: 'kr.co.manee.app.staging',
  }),
  'https://bhwuuxcrzxespkjlmqxr.supabase.co': Object.freeze({
    environment: 'production', projectId: 'manee-production-3eafa', packageName: 'kr.co.manee.app',
  }),
});
export function androidPushDeployment(url, credentials, productionEnabled = false) {
  const deployment = deployments[url];
  if (!deployment || (deployment.environment === 'production' && productionEnabled !== true)) return null;
  if (credentials && credentials.project !== deployment.projectId) return null;
  return deployment;
}
