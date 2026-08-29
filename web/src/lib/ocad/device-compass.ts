/** Utilities for reading and smoothing device compass heading for map rotation. */

export const COMPASS_DEAD_ZONE_DEG = 3;
/** EMA blend per animation frame (~60 fps). */
export const COMPASS_SMOOTH_ALPHA = 0.18;
/** Max map rotation per animation frame (degrees). */
export const COMPASS_MAX_STEP_DEG = 5;

export type CompassEventName = "deviceorientationabsolute" | "deviceorientation";

type OrientableEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

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
  const clamped = Math.abs(step) > maxStep ? Math.sign(step) * maxStep : step;
  return normalizeDegrees(current + clamped);
}

export function preferredOrientationEventName(): CompassEventName | null {
  if (typeof window === "undefined") return null;
  if ("ondeviceorientationabsolute" in window) return "deviceorientationabsolute";
  if ("DeviceOrientationEvent" in window || "ondeviceorientation" in window) {
    return "deviceorientation";
  }
  return null;
}

export function isCompassSupported(): boolean {
  return preferredOrientationEventName() != null;
}

/** Screen rotation offset so heading stays aligned in landscape. */
export function screenOrientationOffsetDeg(): number {
  if (typeof window === "undefined") return 0;
  const modern = window.screen?.orientation?.angle;
  if (typeof modern === "number" && Number.isFinite(modern)) return modern;
  const legacy = (window as Window & { orientation?: number }).orientation;
  if (typeof legacy === "number" && Number.isFinite(legacy)) return legacy;
  return 0;
}

/**
 * Magnetic heading in degrees (0 = north, clockwise).
 * Prefers iOS webkitCompassHeading, then absolute alpha. Relative-only alpha is ignored.
 */
export function readCompassHeadingDeg(
  event: DeviceOrientationEvent,
  source: CompassEventName,
): number | null {
  const oriented = event as OrientableEvent;
  if (
    typeof oriented.webkitCompassHeading === "number" &&
    Number.isFinite(oriented.webkitCompassHeading)
  ) {
    return normalizeDegrees(oriented.webkitCompassHeading + screenOrientationOffsetDeg());
  }

  if (typeof event.alpha !== "number" || !Number.isFinite(event.alpha)) {
    return null;
  }

  const absolute = source === "deviceorientationabsolute" || event.absolute === true;
  if (!absolute) return null;

  return normalizeDegrees(360 - event.alpha + screenOrientationOffsetDeg());
}

/**
 * CSS clockwise rotation that makes the phone heading point up on the map.
 * Heading 0 (north) → 0°. Heading 90 (east) → 270° (counter-clockwise 90°).
 */
export function compassHeadingToMapRotation(
  headingDeg: number,
  grivationRad: number,
): number {
  const grivationDeg = (grivationRad * 180) / Math.PI;
  return normalizeDegrees(-(headingDeg - grivationDeg));
}

/** @deprecated Use compassHeadingToMapRotation */
export function compassHeadingToMapBearing(
  headingDeg: number,
  grivationRad: number,
): number {
  return compassHeadingToMapRotation(headingDeg, grivationRad);
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
