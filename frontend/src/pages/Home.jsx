import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./home.css";

const stats = [
  { label: "Active Farmers", value: "2,400+", icon: "👨‍🌾" },
  { label: "Verified Listings", value: "8,900+", icon: "🌾" },
  { label: "Successful Contracts", value: "3,200+", icon: "📋" },
  { label: "Tonnes Traded", value: "45,000+", icon: "⚖️" },
];

const features = [
  {
    icon: "📍",
    title: "GPS Verified Crops",
    desc: "Every crop update is verified using GPS-tagged photos to ensure authenticity for buyers.",
  },
  {
    icon: "📋",
    title: "Smart Contracts",
    desc: "Secure agreements between farmers and buyers with escrow protection and market-based settlement.",
  },
  {
    icon: "💰",
    title: "Fair Market Settlement",
    desc: "Final payments use live market prices — farmers always get the best available rate at harvest.",
  },
  {
    icon: "📊",
    title: "Live Analytics",
    desc: "Track crop growth, yield history, and investment portfolio in real time.",
  },
  {
    icon: "🔔",
    title: "Smart Notifications",
    desc: "Instant alerts for contract requests, crop updates, GPS verifications, and payment releases.",
  },
];

const steps = [
  { step: "01", title: "Farmer Lists Crop", desc: "Upload GPS-tagged images and enter land, soil, and season details." },
  { step: "02", title: "Buyer Monitors Growth", desc: "Buyers track every growth stage with GPS verification in real time." },
  { step: "03", title: "Contract & Funding", desc: "Buyer funds cultivation. Secure escrow holds the payment until delivery." },
  { step: "04", title: "Market Settlement", desc: "At harvest, live market price is used for final payment — always fair." },
];

export default function HomePage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  return (
    <div className="home">
      <Navbar />

      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero__blobs">
          <div className="home-hero__blob--yellow" />
          <div className="home-hero__blob--green" />
        </div>
        <div className="home-hero__inner">
          <span className="home-hero__badge">
            🚀 Forward-Contract Agricultural Marketplace
          </span>
          <h1 className="home-hero__title">
            Connecting Farmers &amp; Buyers
            <br />
            <span className="home-hero__title-accent">Before the Harvest</span>
          </h1>
          <p className="home-hero__subtitle">
            GPS-verified crop tracking, smart contracts, and market-based settlement — all in one platform.
          </p>
          <div className="home-btn-row">
            {user ? (
              <Link
                to={
                  user.role === "farmer"
                    ? "/farmer-dashboard"
                    : user.role === "buyer"
                    ? "/buyer-dashboard"
                    : "/admin-dashboard"
                }
                className="home-btn home-btn--primary home-btn--shadow"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <>
                <Link to="/signup" className="home-btn home-btn--primary home-btn--shadow">
                  Get Started Free
                </Link>
                <Link to="/marketplace" className="home-btn home-btn--ghost">
                  Browse Marketplace
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="home-stats">
        <div className="home-stats__grid">
          {stats.map((s) => (
            <div key={s.label} className="home-stat">
              <div className="home-stat__icon">{s.icon}</div>
              <div className="home-stat__value">{s.value}</div>
              <div className="home-stat__label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="home-features">
        <div className="home-features__inner">
          <div className="home-section-head">
            <h2 className="home-section-head__title">
              Everything You Need
            </h2>
            <p className="home-section-head__subtitle">
              AgriChain combines GPS verification and smart contracts to make agricultural trade transparent and fair.
            </p>
          </div>
          <div className="home-features__grid">
            {features.map((f) => (
              <div key={f.title} className="home-feature card-hover">
                <div className="home-feature__icon">{f.icon}</div>
                <h3 className="home-feature__title">{f.title}</h3>
                <p className="home-feature__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="home-how">
        <div className="home-how__inner">
          <div className="home-section-head">
            <h2 className="home-section-head__title">How It Works</h2>
            <p className="home-section-head__subtitle">Simple, transparent, and fair for everyone.</p>
          </div>
          <div className="home-how__steps">
            {steps.map((s) => (
              <div key={s.step} className="home-step">
                <div className="home-step__num">
                  {s.step}
                </div>
                <div className="home-step__body">
                  <h3 className="home-step__title">{s.title}</h3>
                  <p className="home-step__desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta">
        <div className="home-cta__inner">
          <h2 className="home-cta__title">
            Ready to Transform Your Agricultural Business?
          </h2>
          <p className="home-cta__subtitle">
            Join thousands of farmers and buyers already trading smarter with AgriChain.
          </p>
          <div className="home-btn-row">
            <Link to="/signup" className="home-btn home-btn--primary">
              Join as Farmer 👨‍🌾
            </Link>
            <Link to="/signup" className="home-btn home-btn--ghost">
              Join as Buyer 🏢
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer__brand">
          <span>🌾</span> AgriChain
        </div>
        <p>© 2026 AgriChain. Crop Lifecycle Marketplace.</p>
      </footer>
    </div>
  );
}
