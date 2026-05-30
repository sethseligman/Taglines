"use client";

import { type RefObject, useLayoutEffect, useState } from "react";

export function useAutoFitFontSize(
  textRef: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  options: { min: number; max: number; fitMaxHeight?: number; deps?: ReadonlyArray<unknown> }
): number {
  const { min, max, fitMaxHeight, deps = [] } = options;
  const [fontSize, setFontSize] = useState(max);

  useLayoutEffect(() => {
    const textEl = textRef.current;
    const containerEl = containerRef.current;
    if (!textEl || !containerEl) return;

    let rafId: number | null = null;

    const fit = () => {
      const t = textRef.current;
      const c = containerRef.current;
      if (!t || !c) return;

      let size = max;
      t.style.fontSize = `${size}px`;

      const heightLimit = fitMaxHeight ?? c.clientHeight;

      while (size > min && t.scrollHeight > heightLimit) {
        size -= 1;
        t.style.fontSize = `${size}px`;
      }

      setFontSize(size);
    };

    const scheduleFit = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    };

    scheduleFit();

    const ro = new ResizeObserver(() => scheduleFit());
    ro.observe(containerEl);

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [min, max, fitMaxHeight, ...deps]);

  return fontSize;
}
