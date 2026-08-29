import {
  COMPASS_DEAD_ZONE_DEG,
  compassHeadingToMapRotation,
  normalizeDegrees,
  readCompassHeadingDeg,
  shortestAngleDelta,
  smoothCompassAngle,
} from "../src/lib/ocad/device-compass";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(normalizeDegrees(-90) === 270, "normalize negative");
assert(normalizeDegrees(450) === 90, "normalize overflow");
assert(shortestAngleDelta(350, 10) === 20, "shortest delta across 0");
assert(shortestAngleDelta(10, 350) === -20, "shortest delta negative");

const still = smoothCompassAngle(0, 1, 0.2, 5);
assert(still === 0, "dead zone ignores tiny changes");

const moved = smoothCompassAngle(0, 90, 0.5, 10);
assert(moved > 0 && moved < 90, "smooth step toward target");

const northUp = compassHeadingToMapRotation(0, 0);
assert(northUp === 0, "north heading keeps map north-up");

const eastUp = compassHeadingToMapRotation(90, 0);
assert(eastUp === 270, "east heading rotates map counter-clockwise");

const westUp = compassHeadingToMapRotation(270, 0);
assert(westUp === 90, "west heading rotates map clockwise");

const iosHeading = readCompassHeadingDeg(
  { webkitCompassHeading: 45, alpha: 12 } as unknown as DeviceOrientationEvent,
  "deviceorientation",
);
assert(iosHeading === 45, "prefers webkit compass heading");

const relative = readCompassHeadingDeg(
  { alpha: 90, absolute: false } as unknown as DeviceOrientationEvent,
  "deviceorientation",
);
assert(relative === null, "ignores relative-only alpha");

const absolute = readCompassHeadingDeg(
  { alpha: 90, absolute: true } as unknown as DeviceOrientationEvent,
  "deviceorientationabsolute",
);
assert(absolute === 270, "absolute alpha 90 is heading 270");

console.log("device-compass: ok", { COMPASS_DEAD_ZONE_DEG, moved, eastUp });
