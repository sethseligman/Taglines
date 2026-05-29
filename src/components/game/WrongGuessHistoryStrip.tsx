"use client";

interface WrongGuessHistoryStripProps {
  guessHistory: string[];
  relaxedVisual?: boolean;
}

export function WrongGuessHistoryStrip({
  guessHistory,
  relaxedVisual = true,
}: WrongGuessHistoryStripProps) {
  if (guessHistory.length === 0) return null;

  return (
    <div
      className={relaxedVisual ? "mt-12 md:mt-14" : "mt-8"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-start",
        padding: "0 1.5rem",
        width: "100%",
      }}
    >
      {guessHistory.map((g, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5"
          style={{
            opacity: 0.75,
            transform: i % 2 === 0 ? "rotate(-0.4deg)" : "rotate(0.3deg)",
            alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div
              style={{
                width: 4,
                height: 3,
                borderRadius: 0.5,
                background: "#0D0D0D",
                border: "1px solid #2a2a2a",
              }}
            />
            <div
              style={{
                width: 4,
                height: 3,
                borderRadius: 0.5,
                background: "#0D0D0D",
                border: "1px solid #2a2a2a",
              }}
            />
          </div>
          <div
            style={{
              fontFamily: '"DM Sans", sans-serif',
              fontSize: "0.65rem",
              color: "#3a3a3a",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderLeft: "1px solid #1e1e1e",
              borderRight: "1px solid #1e1e1e",
              padding: "2px 8px",
              background: "#0f0f0f",
            }}
          >
            {g === "" ? "\u00a0" : g}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div
              style={{
                width: 4,
                height: 3,
                borderRadius: 0.5,
                background: "#0D0D0D",
                border: "1px solid #2a2a2a",
              }}
            />
            <div
              style={{
                width: 4,
                height: 3,
                borderRadius: 0.5,
                background: "#0D0D0D",
                border: "1px solid #2a2a2a",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
