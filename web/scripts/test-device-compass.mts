import {
  COMPASS_DEAD_ZONE_DEG,
  compassHeadingToMapBearing,
  normalizeDegrees,
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

const still = smoothCompassAngle(0, 2, 0.2, 5);
assert(still === 0, "dead zone ignores tiny changes");

const moved = smoothCompassAngle(0, 90, 0.5, 10);
assert(moved > 0 && moved < 90, "smooth step toward target");

const bearing = compassHeadingToMapBearing(90, 0);
assert(bearing === 90, "bearing equals heading without grivation");

console.log("device-compass: ok", { COMPASS_DEAD_ZONE_DEG, moved, bearing });
