"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Render a WebGL scene only while it is on screen and the tab is visible.
 * Returns a ref for the container and the frameloop mode for <Canvas>.
 */
export function useActiveCanvas<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { rootMargin: "100px" });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { ref, frameloop: (onScreen && visible ? "always" : "never") as "always" | "never" };
}
