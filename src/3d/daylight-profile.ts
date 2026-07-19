const DAYLIGHT_ALTITUDE = 0.15;

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

export function getDaylightRenderProfile(altitude: number, isMobile: boolean) {
  const alt = Math.min(Math.max(altitude, 0), 1);
  const day = 0.4 + 0.6 * alt;
  const mobileExposure = 0.7 + day;
  const desktopExposure = 0.6 + 0.8 * day;
  const sharedDaylightBlend = isMobile
    ? 1
    : Math.min(alt / DAYLIGHT_ALTITUDE, 1);

  return {
    exposure: lerp(desktopExposure, mobileExposure, sharedDaylightBlend),
    bloomStrength: isMobile ? 0 : 0.4 * (1 - sharedDaylightBlend),
    edgeStrength: lerp(0.35, 0.15, sharedDaylightBlend),
    sharedDaylightBlend,
  };
}

