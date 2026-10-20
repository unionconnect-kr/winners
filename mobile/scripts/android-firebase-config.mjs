import { existsSync, readFileSync } from 'node:fs';
const environments = JSON.parse(readFileSync(new URL('../../config/android-firebase.json', import.meta.url), 'utf8'));
export function androidFirebaseProject(path, environment = 'staging') {
  if (!['staging', 'production'].includes(environment)) throw Error('Specify the Android Firebase environment explicitly.');
  const expected = environments[environment];
  if (!existsSync(path)) {
    if (environment === 'production') throw Error('Production Android requires its Firebase client configuration.');
    return null;
  }
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const project = config.project_info?.project_id;
  const client = config.client?.find(c => c.client_info?.android_client_info?.package_name === expected.packageName);
  if (project !== expected.projectId || !/^\d+$/.test(config.project_info?.project_number || '') ||
      !client?.client_info?.mobilesdk_app_id || !client?.api_key?.[0]?.current_key) {
    throw Error(`Firebase config must match ${expected.projectId} and ${expected.packageName}.`);
  }
  return project;
}
