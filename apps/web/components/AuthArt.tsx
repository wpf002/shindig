const STRIPES = ["#8f3a46", "#c98b84", "#e8c4bc", "#a3ae8d", "#c9a77c"];

export function AuthArt({ children }: { children: React.ReactNode }) {
  return (
    <aside className="auth-art" aria-hidden>
      <div className="stripes">
        {STRIPES.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
      <div>{children}</div>
    </aside>
  );
}
