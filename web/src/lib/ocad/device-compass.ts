/** Utilities for reading and smoothing device compass heading for map rotation. */

export const COMPASS_DEAD_ZONE_DEG = 4;
/** EMA blend per animation frame (~60 fps) — lower = smoother rotation. */
export const COMPASS_SMOOTH_ALPHA = 0.08;
/** Max map rotation per animation frame (degrees). */
export const COMPASS_MAX_STEP_DEG = 1.5;

export function normalizeDegrees(deg: number): number {
  let value = deg % 360;
  if (value < 0) value += 360;
  return value;
}

/** Shortest signed difference from `from` to `to` in degrees (-180..180). */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = normalizeDegrees(to) - normalizeDegrees(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function smoothCompassAngle(
  current: number,
  target: number,
  alpha = COMPASS_SMOOTH_ALPHA,
  maxStep = COMPASS_MAX_STEP_DEG,
): number {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) < COMPASS_DEAD_ZONE_DEG) {
    return normalizeDegrees(current);
  }
  const step = delta * alpha;
  const clamped =
    Math.abs(step) > maxStep ? Math.sign(step) * maxStep : step;
  return normalizeDegrees(current + clamped);
}

type OrientableEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

export function readCompassHeadingDeg(event: DeviceOrientationEvent): number | null {
  const oriented = event as OrientableEvent;
  if (
    typeof oriented.webkitCompassHeading === "number" &&
    Number.isFinite(oriented.webkitCompassHeading)
  ) {
    return normalizeDegrees(oriented.webkitCompassHeading);
  }
  if (event.absolute && typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return normalizeDegrees(360 - event.alpha);
  }
  if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return normalizeDegrees(360 - event.alpha);
  }
  return null;
}

/** Convert magnetic compass heading to map rotation (clockwise degrees, 0 = north up). */
export function compassHeadingToMapBearing(
  headingDeg: number,
  grivationRad: number,
): number {
  const grivationDeg = (grivationRad * 180) / Math.PI;
  return normalizeDegrees(headingDeg - grivationDeg);
}

export function isCompassSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "DeviceOrientationEvent" in window;
}

export async function requestCompassPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const OrientCtor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<PermissionState>;
  };
  if (typeof OrientCtor.requestPermission !== "function") {
    return true;
  }
  try {
    const result = await OrientCtor.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}
