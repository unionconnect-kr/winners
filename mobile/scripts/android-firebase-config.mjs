import { existsSync, readFileSync } from 'node:fs';
export function androidFirebaseProject(path) {
  if (!existsSync(path)) return null;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const project = config.project_info?.project_id;
  const client = config.client?.find(c => c.client_info?.android_client_info?.package_name === 'kr.co.manee.app.staging');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project || '') || !/^\d+$/.test(config.project_info?.project_number || '') ||
      !client?.client_info?.mobilesdk_app_id || !client?.api_key?.[0]?.current_key) {
    throw Error('Firebase config must include the kr.co.manee.app.staging Android app.');
  }
  return project;
}
