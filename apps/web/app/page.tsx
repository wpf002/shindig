import Link from "next/link";
import { CATEGORIES, CATEGORY_LABELS } from "@shindig/core";
import { Ring } from "@/components/Ring";

const PINS = [
  { h: 150, bg: "linear-gradient(165deg,#ecd0c8,#c8908a)" },
  { h: 96, bg: "linear-gradient(200deg,#f7efe2,#e3cfae)" },
  { h: 120, bg: "linear-gradient(150deg,#b3bf9f,#6e7f5e)" },
  { h: 170, bg: "linear-gradient(190deg,#f3e7d6,#d7b48f)" },
  { h: 100, bg: "linear-gradient(140deg,#8f3a46,#5b1d29)" },
  { h: 132, bg: "linear-gradient(170deg,#e7dccb,#b7a58b)" },
  { h: 110, bg: "linear-gradient(210deg,#d6a39b,#a36159)" },
  { h: 150, bg: "linear-gradient(160deg,#c9cfb6,#8a9772)" },
  { h: 90, bg: "linear-gradient(150deg,#faf3e8,#eadbc4)" },
];
const LOOK = ["#e8c4bc", "#a3ae8d", "#f5ecdf", "#8f3a46", "#c9a77c"];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow row" style={{ gap: 10 }}>
              <span className="pulse-dot" /> Dallas–Fort Worth
            </p>
            <h1 className="rise">
              Your board,
              <br />
              <em>booked.</em>
            </h1>
            <p className="lede rise d1">
              Shindig reads your Pinterest board and finds DFW vendors who already work in that style, at your budget.
            </p>
            <div className="row ctas rise d2">
              <Link href="/signup" className="btn accent lg">
                Start a Plan <span className="arrow">→</span>
              </Link>
              <Link href="/signup?role=vendor" className="btn ghost lg">
                List Your Business
              </Link>
            </div>
            <dl className="hero-facts rise d3">
              <div>
                <b>{CATEGORIES.length}</b>
                <span>Vendor Categories</span>
              </div>
              <div>
                <b>$0</b>
                <span>Paid Placement</span>
              </div>
              <div>
                <b>30</b>
                <span>Pins Read</span>
              </div>
            </dl>
          </div>

          <div className="mock" aria-hidden>
            <div className="board rise">
              <div className="board-head">
                <i /> Spring Garden Wedding · 64 Pins
              </div>
              <div className="pins">
                {PINS.map((p, i) => (
                  <div key={i} className="pin" style={{ height: p.h, background: p.bg }} />
                ))}
              </div>
            </div>
            <div className="card look rise d2">
              <p className="eyebrow">Your Look</p>
              <div className="swatch-strip">
                {LOOK.map((c) => (
                  <div key={c} style={{ background: c }} />
                ))}
              </div>
              <p className="serif">
                Garden <em className="flair">Romantic</em>
              </p>
              <div className="chips" style={{ marginTop: 10 }}>
                <span className="chip static quiet">Semi-Formal</span>
                <span className="chip static quiet">Outdoor</span>
              </div>
            </div>
            <div className="card hit rise d3">
              <div className="thumb" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>The Grove at Hickory Creek</h3>
                <p className="small muted">Venue · Denton · $8–11k</p>
              </div>
              <Ring value={94} size={50} />
            </div>
          </div>
        </div>
      </section>

      <section className="wrap process">
        <div>
          <span className="num">01</span>
          <h3>Bring Your Board</h3>
          <p>Connect Pinterest or drop in screenshots.</p>
        </div>
        <div>
          <span className="num">02</span>
          <h3>Check Your Look</h3>
          <p>Style, palette, formality and setting, read from your pins. Edit anything.</p>
        </div>
        <div>
          <span className="num">03</span>
          <h3>Meet Your Vendors</h3>
          <p>Ranked by fit, priced against your budget. Nobody pays to rank.</p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div>
            <p className="eyebrow">For Vendors</p>
            <h2 style={{ marginTop: 12 }}>
              Get found for your <em>style.</em>
            </h2>
            <p>Upload your portfolio. Shindig reads it and puts you in front of planners who want that look.</p>
            <div className="row" style={{ marginTop: 28 }}>
              <Link href="/signup?role=vendor" className="btn light lg">
                List Your Business <span className="arrow">→</span>
              </Link>
            </div>
          </div>
          <div className="cat-cloud">
            {CATEGORIES.map((c) => (
              <span key={c}>{CATEGORY_LABELS[c]}</span>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap">
          <span className="brand" style={{ fontSize: "1.1rem" }}>
            Shindig
          </span>
          <span>Dallas–Fort Worth</span>
        </div>
      </footer>
    </main>
  );
}
