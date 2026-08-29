"use client";

import { useEffect, useRef, useState } from "react";
import {
  compassHeadingToMapRotation,
  isCompassSupported,
  preferredOrientationEventName,
  readCompassHeadingDeg,
  smoothCompassAngle,
} from "@/lib/ocad/device-compass";

type Options = {
  /** When false, rotation eases back to north-up and the listener stops. */
  active: boolean;
  /** OCAD grivation in radians — aligns compass with map north. */
  grivationRad: number;
};

const UI_THROTTLE_MS = 250;
const HEADING_WAIT_MS = 4000;
const SETTLE_EPS_DEG = 0.4;

export function useSmoothedCompass({ active, grivationRad }: Options) {
  const [displayBearing, setDisplayBearing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasHeading, setHasHeading] = useState(false);

  const supported = isCompassSupported();
  const bearingRef = useRef(0);
  const targetRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastUiRef = useRef(0);
  const grivationRef = useRef(grivationRad);
  grivationRef.current = grivationRad;

  useEffect(() => {
    if (!active) {
      targetRef.current = 0;
      if (Math.abs(bearingRef.current) < SETTLE_EPS_DEG) {
        bearingRef.current = 0;
        setDisplayBearing(0);
        setHasHeading(false);
        setError(null);
        return;
      }

      const settle = () => {
        const next = smoothCompassAngle(bearingRef.current, 0, 0.28, 8);
        bearingRef.current = Math.abs(next) < SETTLE_EPS_DEG || next > 359 ? 0 : next;
        setDisplayBearing(bearingRef.current);
        if (bearingRef.current === 0) return;
        rafRef.current = requestAnimationFrame(settle);
      };
      rafRef.current = requestAnimationFrame(settle);
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      };
    }

    if (!supported) {
      setError("Enheten stödjer inte kompass.");
      return;
    }

    const eventName = preferredOrientationEventName();
    if (!eventName) {
      setError("Enheten stödjer inte kompass.");
      return;
    }

    let cancelled = false;
    setError(null);
    setHasHeading(false);
    targetRef.current = null;

    const waitId = window.setTimeout(() => {
      if (cancelled || targetRef.current != null) return;
      setError("Ingen kompassriktning. Håll telefonen plant och prova utomhus, bort från metall.");
    }, HEADING_WAIT_MS);

    const onOrientation = (event: DeviceOrientationEvent) => {
      const heading = readCompassHeadingDeg(event, eventName);
      if (heading == null) return;
      targetRef.current = compassHeadingToMapRotation(heading, grivationRef.current);
    };

    const tick = (now: number) => {
      const target = targetRef.current;
      if (target != null) {
        const next = smoothCompassAngle(bearingRef.current, target);
        bearingRef.current = next;
        if (now - lastUiRef.current >= UI_THROTTLE_MS) {
          lastUiRef.current = now;
          setDisplayBearing(next);
          setHasHeading(true);
          setError(null);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener(eventName, onOrientation, true);
    if (eventName === "deviceorientationabsolute") {
      window.addEventListener("deviceorientation", onOrientation, true);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.clearTimeout(waitId);
      window.removeEventListener(eventName, onOrientation, true);
      window.removeEventListener("deviceorientation", onOrientation, true);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, supported]);

  return {
    bearingRef,
    displayBearing,
    error,
    hasHeading,
    supported,
  };
}
