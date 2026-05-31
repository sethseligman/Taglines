import type { CSSProperties } from "react";

/** Full-screen win poster frame — shared by daily end sequence and challenge between-legs. */
export function posterFrameStyle(isDesktop: boolean): CSSProperties {
  if (isDesktop) {
    return {
      maxWidth: "min(42vw, 340px)",
      maxHeight: "85vh",
      width: "auto",
      height: "auto",
    };
  }
  return {
    width: "78vw",
    maxWidth: "320px",
    height: "auto",
  };
}

export function posterPlaceholderFrameStyle(isDesktop: boolean): CSSProperties {
  return {
    ...posterFrameStyle(isDesktop),
    border: "1px solid #222",
    minWidth: isDesktop ? 200 : 160,
    minHeight: isDesktop ? 300 : 240,
  };
}
