"use client";

interface ScoreRingProps {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 120 }: ScoreRingProps) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "var(--color-success)"
      : score >= 60
        ? "var(--color-warning)"
        : "var(--color-critical)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="8"
        />
        {/* Score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1s ease-out",
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold"
          style={{ fontFamily: "var(--font-display)", color }}
        >
          {score}
        </span>
        <span className="text-xs text-text-muted mt-0.5">/ 100</span>
      </div>
    </div>
  );
}
