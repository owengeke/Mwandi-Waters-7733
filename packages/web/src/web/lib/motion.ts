import { useEffect, useRef, useState } from "react";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/** Live `prefers-reduced-motion: reduce` flag (false during SSR). */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(REDUCE_QUERY).matches),
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(REDUCE_QUERY);
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * Counts from 0 to `target` once, easing out. Later value changes snap straight
 * to the new number, so data refreshes and filters never replay the animation.
 * Reduced motion shows the final value immediately.
 */
export function useCountUp(target: number | undefined, duration = 700) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const hasCounted = useRef(false);

  useEffect(() => {
    if (target == null || !Number.isFinite(target)) return;

    if (reduced || duration <= 0 || hasCounted.current) {
      hasCounted.current = true;
      setValue(target);
      return;
    }

    let frame = 0;
    const begin = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - begin) / duration);
      const eased = 1 - (1 - progress) ** 3;
      if (progress < 1) {
        setValue(target * eased);
        frame = requestAnimationFrame(step);
      } else {
        hasCounted.current = true;
        setValue(target);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return value;
}