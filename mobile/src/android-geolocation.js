// The app's attendance boundary is 100 m. Android's coarse-only permission
// can still return a position even when enableHighAccuracy is requested.
export function createAndroidGeolocation(geolocation) {
  async function currentPosition(options) {
    const position = await geolocation.getCurrentPosition({
      ...options, enableHighAccuracy: true, maximumAge: 0,
    });
    const permissions = await geolocation.checkPermissions();
    if (permissions.location !== 'granted') {
      throw { code: 1, reason: 'precise-location-required' };
    }
    const coords = position?.coords;
    if (!coords || !Number.isFinite(coords.latitude) || Math.abs(coords.latitude) > 90 ||
        !Number.isFinite(coords.longitude) || Math.abs(coords.longitude) > 180 ||
        !Number.isFinite(coords.accuracy) || coords.accuracy <= 0 || coords.accuracy > 100) {
      throw { code: 2, reason: 'position-inaccurate' };
    }
    return position;
  }
  return {
    getCurrentPosition(success, failure, options = {}) {
      return currentPosition(options).then(success, error => {
        const code = String(error?.code || '');
        failure?.({
          code: code === '1' || code === 'OS-PLUG-GLOC-0003' ? 1 :
            code === '3' || code === 'OS-PLUG-GLOC-0010' ? 3 : 2,
          reason: error?.reason,
        });
      });
    },
  };
}
