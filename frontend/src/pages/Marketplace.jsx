import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import WatchlistButton from "@/components/WatchlistButton";
import { formatYield } from "@/lib/yield";
import "./listings.css";

export default function MarketplacePage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedTaluka, setSelectedTaluka] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getUser());
    loadListings();
  }, []);

  const loadListings = async () => {
    setLoading(true);
    try {
      const res = await api.get("/listings/all");
      setListings(res.data.listings || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const states = [...new Set(listings.map((l) => l.state).filter(Boolean))].sort();
  const districts = [...new Set(
    listings.filter((l) => !selectedState || l.state === selectedState)
      .map((l) => l.district).filter(Boolean)
  )].sort();
  const talukas = [...new Set(
    listings.filter((l) => (!selectedState || l.state === selectedState) && (!selectedDistrict || l.district === selectedDistrict))
      .map((l) => l.taluka).filter(Boolean)
  )].sort();

  const filtered = listings.filter((l) => {
    const matchSearch = !search || l.crop_name?.toLowerCase().includes(search.toLowerCase());
    const matchState = !selectedState || l.state === selectedState;
    const matchDistrict = !selectedDistrict || l.district === selectedDistrict;
    const matchTaluka = !selectedTaluka || l.taluka === selectedTaluka;
    const matchVerified = !verifiedOnly || l.farm_verified;
    return matchSearch && matchState && matchDistrict && matchTaluka && matchVerified;
  });

  return (
    <div className="mkt-page">
      <Navbar />

      {/* Hero bar */}
      <div className="mkt-hero">
        <div className="mkt-hero__inner">
          <h1 className="mkt-hero__title">Crop Marketplace 🏪</h1>
          <p className="mkt-hero__subtitle">
            Browse crop listings from farmers across India
          </p>
        </div>
      </div>

      <div className="mkt-container">
        {/* Filters */}
        <div className="mkt-filters">
          <div className="mkt-filters__grid">
            <div className="mkt-filters__search">
              <div className="mkt-search">
                <svg className="mkt-search__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search crops..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mkt-search__input"
                />
              </div>
            </div>

            <select value={selectedState} onChange={(e) => { setSelectedState(e.target.value); setSelectedDistrict(""); setSelectedTaluka(""); }}
              className="mkt-select">
              <option value="">All States</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={selectedDistrict} onChange={(e) => { setSelectedDistrict(e.target.value); setSelectedTaluka(""); }}
              className="mkt-select">
              <option value="">All Districts</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            <select value={selectedTaluka} onChange={(e) => setSelectedTaluka(e.target.value)}
              className="mkt-select">
              <option value="">All Talukas</option>
              {talukas.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="mkt-filters__foot">
            <label className="mkt-check">
              <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="mkt-check__box" />
              <span className="mkt-check__label">✅ Verified farms only</span>
            </label>
            <p className="mkt-filters__count">
              {loading ? "Loading..." : `${filtered.length} listing${filtered.length !== 1 ? "s" : ""} found`}
            </p>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="mkt-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="mkt-skel">
                <div className="mkt-skel__img" />
                <div className="mkt-skel__body">
                  <div className="mkt-skel__l1" />
                  <div className="mkt-skel__l2" />
                  <div className="mkt-skel__l3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mkt-empty">
            <p className="mkt-empty__icon">🌾</p>
            <p className="mkt-empty__title">No listings found</p>
            <p className="mkt-empty__text">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="mkt-grid">
            {filtered.map((listing) => (
              <Link key={listing.id} to={`/listing/${listing.id}`} className="mkt-cardlink">
                <div className="mkt-card">
                  {/* Watchlist heart */}
                  {user?.role === "buyer" && (
                    <div className="mkt-heart-wrap">
                      <WatchlistButton listingId={listing.id} />
                    </div>
                  )}

                  {/* Image */}
                  {listing.image_url ? (
                    <img src={listing.image_url} alt={listing.crop_name}
                      className="mkt-card__img mkt-card__img--tall" />
                  ) : (
                    <div className="mkt-card__ph mkt-card__ph--tall">
                      <span>🌿</span>
                    </div>
                  )}

                  <div className="mkt-card__body">
                    {/* Badges */}
                    <div className="mkt-badges">
                      {listing.farm_verified ? (
                        <span className="mkt-tag mkt-tag--verified">✅ Verified</span>
                      ) : (
                        <span className="mkt-tag mkt-tag--unverified">⏳ Unverified</span>
                      )}
                      {listing.season && (
                        <span className="mkt-tag mkt-tag--season">{listing.season}</span>
                      )}
                    </div>

                    <h2 className="mkt-card__title">{listing.crop_name}</h2>

                    <p className="mkt-card__loc">
                      📍 {[listing.village, listing.taluka, listing.district].filter(Boolean).join(", ")}
                      {listing.state && `, ${listing.state}`}
                    </p>

                    <div className="mkt-tiles mkt-tiles--push">
                      <div className="mkt-tile mkt-tile--green mkt-tile--span2">
                        <p className="mkt-tile__label">🌾 Expected Yield</p>
                        <p className="mkt-tile__value">{formatYield(listing)}</p>
                      </div>
                      <div className="mkt-tile mkt-tile--gray">
                        <p className="mkt-tile__label">Land Size</p>
                        <p className="mkt-tile__value">{listing.land_size} acres</p>
                      </div>
                      <div className="mkt-tile mkt-tile--gray">
                        <p className="mkt-tile__label">Soil</p>
                        <p className="mkt-tile__value mkt-tile__value--truncate">{listing.soil_type || "—"}</p>
                      </div>
                    </div>

                    {listing.farmer_name && (
                      <p className="mkt-card__farmer">
                        👨‍🌾 {listing.farmer_name}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
