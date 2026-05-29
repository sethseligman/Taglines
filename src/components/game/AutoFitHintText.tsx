"use client";

import { useRef } from "react";
import { useAutoFitFontSize } from "@/hooks/useAutoFitFontSize";
import { FONT_PLAYFAIR } from "@/lib/fontStacks";

export function AutoFitHintText({
  text,
  isDesktop,
}: {
  text: string;
  isDesktop: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  const fontSize = useAutoFitFontSize(textRef, containerRef, {
    min: isDesktop ? 15 : 13,
    max: isDesktop ? 22 : 18,
    deps: [text, isDesktop],
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 116,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <p
        ref={textRef}
        style={{
          margin: 0,
          color: "#C9B87A",
          fontFamily: FONT_PLAYFAIR,
          fontStyle: "italic",
          fontSize: `${fontSize}px`,
          lineHeight: 1.6,
          textAlign: "center",
          width: "100%",
          maxWidth: "100%",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </p>
    </div>
  );
}
