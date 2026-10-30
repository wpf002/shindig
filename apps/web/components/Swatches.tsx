import { colorName } from "@shindig/core";

export function Swatches({ colors, size }: { colors: string[]; size?: "lg" }) {
  if (colors.length === 0) return null;
  return (
    <div className={`swatches ${size ?? ""}`} aria-label={`Palette: ${colors.map(colorName).join(", ")}`}>
      {colors.map((c, i) => (
        <span key={`${c}-${i}`} className="swatch" style={{ background: c }} title={`${colorName(c)} ${c}`} />
      ))}
    </div>
  );
}
