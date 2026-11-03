import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

/**
 * Fades its children up the first time they scroll into view. With `stagger`,
 * the reveal is passed on to the direct children (each can set `--i`) so they
 * rise one after another. Content is shown immediately when reduced motion is
 * requested or IntersectionObserver is unavailable, and the observer
 * disconnects after the first reveal.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  stagger = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    if (window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ "--i": delay } as React.CSSProperties}
      className={cn(stagger ? "reveal-stagger" : "reveal", shown && "reveal-in", className)}
    >
      {children}
    </div>
  );
}
