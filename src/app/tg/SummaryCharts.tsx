"use client";

/** Lightweight SVG charts for Mini App home — no chart library. */

type Slice = { label: string; value: number; color: string };

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
) {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export function DonutChart({
  title,
  slices,
  centerLabel,
}: {
  title: string;
  slices: Slice[];
  centerLabel?: string;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const cx = 60;
  const cy = 60;
  const r = 42;
  let angle = 0;
  const arcs =
    total <= 0
      ? []
      : slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const sweep = (s.value / total) * 360;
            const start = angle;
            const end = angle + sweep;
            angle = end;
            // full circle special-case
            if (sweep >= 359.9) {
              return {
                ...s,
                d: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`,
              };
            }
            return { ...s, d: arcPath(cx, cy, r, start, end) };
          });

  return (
    <div className="tg-chart-card">
      <p className="tg-chart-title">{title}</p>
      <div className="tg-chart-row">
        <svg
          viewBox="0 0 120 120"
          className="tg-donut"
          aria-hidden
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="16"
          />
          {arcs.map((a) => (
            <path
              key={a.label}
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeWidth="16"
              strokeLinecap="butt"
            />
          ))}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="tg-donut-center"
          >
            {centerLabel ?? String(total)}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            className="tg-donut-sub"
          >
            всего
          </text>
        </svg>
        <ul className="tg-chart-legend">
          {slices.map((s) => (
            <li key={s.label}>
              <span
                className="tg-legend-dot"
                style={{ background: s.color }}
              />
              <span className="tg-legend-label">{s.label}</span>
              <span className="tg-legend-val">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProfitBars({
  title,
  bars,
}: {
  title: string;
  bars: Array<{ label: string; value: number; valueLabel: string; color: string }>;
}) {
  const max = Math.max(1, ...bars.map((b) => Math.max(0, b.value)));
  return (
    <div className="tg-chart-card">
      <p className="tg-chart-title">{title}</p>
      <div className="tg-bars">
        {bars.map((b) => {
          const pct = Math.round((Math.max(0, b.value) / max) * 100);
          return (
            <div key={b.label} className="tg-bar-row">
              <div className="tg-bar-meta">
                <span>{b.label}</span>
                <span className="tabular-nums">{b.valueLabel}</span>
              </div>
              <div className="tg-bar-track">
                <div
                  className="tg-bar-fill"
                  style={{ width: `${pct}%`, background: b.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FunnelBars({
  title,
  steps,
}: {
  title: string;
  steps: Array<{ label: string; value: number; color: string }>;
}) {
  const max = Math.max(1, ...steps.map((s) => Math.max(0, s.value)));
  return (
    <div className="tg-chart-card">
      <p className="tg-chart-title">{title}</p>
      <div className="tg-funnel">
        {steps.map((s) => {
          const pct = Math.max(12, Math.round((Math.max(0, s.value) / max) * 100));
          return (
            <div key={s.label} className="tg-funnel-step">
              <div
                className="tg-funnel-block"
                style={{ width: `${pct}%`, background: s.color }}
              >
                <span>{s.label}</span>
                <strong>{s.value}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
