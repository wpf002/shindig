export function Ring({ value, size = 56, tone }: { value: number; size?: number; tone?: "moss" | "amber" }) {
  const stroke = Math.max(3, Math.round(size / 13));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`ring ${tone ?? ""}`} style={{ width: size, height: size }} title={`${value} Fit`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="val"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)}
        />
      </svg>
      <b style={{ fontSize: size * 0.34 }}>{value}</b>
    </span>
  );
}
