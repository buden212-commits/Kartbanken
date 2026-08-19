"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  compassHeadingToMapBearing,
  isCompassSupported,
  readCompassHeadingDeg,
  requestCompassPermission,
  smoothCompassAngle,
} from "@/lib/ocad/device-compass";

type Options = {
  /** When false, compass listener and animation stop. */
  active: boolean;
  /** OCAD grivation in radians — aligns compass with map north. */
  grivationRad: number;
};

export function useSmoothedCompass({ active, grivationRad }: Options) {
  const [bearing, setBearing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const supported = isCompassSupported();
  const smoothedRef = useRef(0);
  const targetRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const grivationRef = useRef(grivationRad);
  grivationRef.current = grivationRad;

  const stopAnimation = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      stopAnimation();
      targetRef.current = null;
      smoothedRef.current = 0;
      setBearing(0);
      setPending(false);
      setError(null);
      return;
    }

    if (!supported) {
      setError("Enheten stödjer inte kompass.");
      return;
    }

    let cancelled = false;
    let removeListener: (() => void) | undefined;

    const onOrientation = (event: DeviceOrientationEvent) => {
      const heading = readCompassHeadingDeg(event);
      if (heading == null) return;
      targetRef.current = compassHeadingToMapBearing(
        heading,
        grivationRef.current,
      );
    };

    const tick = () => {
      const target = targetRef.current;
      if (target != null) {
        const next = smoothCompassAngle(smoothedRef.current, target);
        smoothedRef.current = next;
        setBearing(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    void (async () => {
      setPending(true);
      setError(null);
      const granted = await requestCompassPermission();
      if (cancelled) return;
      setPending(false);
      if (!granted) {
        setError("Kompass nekad — tillåt rörelse/riktning i webbläsaren.");
        return;
      }

      window.addEventListener("deviceorientation", onOrientation, true);
      removeListener = () => {
        window.removeEventListener("deviceorientation", onOrientation, true);
      };
      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      stopAnimation();
      removeListener?.();
    };
  }, [active, stopAnimation, supported]);

  return {
    bearing,
    error,
    pending,
    supported,
  };
}
