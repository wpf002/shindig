import Link from "next/link";

const BOARD = [
  { top: 0, left: 40, w: 180, h: 220, bg: "linear-gradient(160deg,#e8c3bd,#c99a9a)", r: -4 },
  { top: 40, left: 200, w: 170, h: 170, bg: "linear-gradient(200deg,#a7b59a,#6f7f63)", r: 5 },
  { top: 190, left: 110, w: 200, h: 150, bg: "linear-gradient(140deg,#f6f1e7,#ead9be)", r: -2 },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Now in Dallas–Fort Worth</p>
            <h1 style={{ marginTop: 14 }}>
              Your board, <em>booked.</em>
            </h1>
            <p className="lede">
              Connect the Pinterest board you&apos;ve been building. Shindig reads the look and finds local venues, photographers,
              DJs, caterers and planners who already work that way, at your budget.
            </p>
            <div className="row" style={{ marginTop: 28 }}>
              <Link href="/signup" className="btn thread">
                Start a Plan
              </Link>
              <Link href="/signup?role=vendor" className="btn ghost">
                List Your Business
              </Link>
            </div>
          </div>
          <div className="demo-board" aria-hidden>
            {BOARD.map((s, i) => (
              <div
                key={i}
                className="sheet"
                style={{ top: s.top, left: s.left, width: s.w, height: s.h, background: s.bg, transform: `rotate(${s.r}deg)` }}
              />
            ))}
            <div className="card" style={{ position: "absolute", left: 230, top: 250, width: 230, padding: 16 }}>
              <p className="eyebrow">Your Look</p>
              <p style={{ fontFamily: "var(--display)", fontSize: "1.2rem", marginTop: 4 }}>Garden, Romantic</p>
              <p className="small muted">Blush, sage, ivory · semi-formal</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap steps">
        <div className="card">
          <span className="step-num">1</span>
          <h3>Bring Your Board</h3>
          <p className="muted">Connect Pinterest and pick a board, or drop in screenshots from anywhere.</p>
        </div>
        <div className="card">
          <span className="step-num">2</span>
          <h3>See Your Look</h3>
          <p className="muted">Style, palette, formality, and setting, pulled from your pins. Change anything that&apos;s off.</p>
        </div>
        <div className="card">
          <span className="step-num">3</span>
          <h3>Meet Your Vendors</h3>
          <p className="muted">
            Matches for every category, with the reason for each and what it costs against your budget. Nobody pays to rank.
          </p>
        </div>
      </section>
    </main>
  );
}
