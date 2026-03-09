"use client";

export function Header() {
  return (
    <header className="border-b border-border bg-surface-raised/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <span
              className="text-lg font-semibold tracking-tight text-text-primary"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Repo<span className="text-accent">Shift</span>
            </span>
          </div>

          <p
            className="hidden sm:block text-sm text-text-muted"
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}
          >
            Audit. Standardize. Shift Forward.
          </p>
        </div>
      </div>
    </header>
  );
}
