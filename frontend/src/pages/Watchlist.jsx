import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { formatYield } from "@/lib/yield";
import "./listings.css";

export default function WatchlistPage() {
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "buyer") { navigate("/login"); return; }
    fetchWatchlist();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const res = await api.get("/watchlist");
      setWatchlist(res.data.watchlist || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const removeItem = async (listingId) => {
    try {
      await api.delete(`/watchlist/${listingId}`);
      setWatchlist((prev) => prev.filter((w) => w.id !== listingId && w.listing_id !== listingId));
    } catch { alert("Failed to remove"); }
  };

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  return (
    <div className="mkt-page">
      <Navbar />
      <div className="mkt-container">
        <div className="mkt-head">
          <h1 className="mkt-title">My Watchlist ❤️</h1>
          <p className="mkt-subtitle">{watchlist.length} saved listing{watchlist.length !== 1 ? "s" : ""}</p>
        </div>

        {watchlist.length === 0 ? (
          <div className="mkt-empty-card">
            <p className="mkt-empty__icon">💚</p>
            <p className="mkt-empty__title mkt-empty__title--mb">No saved listings yet</p>
            <p className="mkt-empty__text--mb">Save crops you're interested in to track them here.</p>
            <Link to="/marketplace" className="mkt-btn mkt-btn--wide">
              Browse Marketplace →
            </Link>
          </div>
        ) : (
          <div className="mkt-grid">
            {watchlist.map((item) => (
              <div key={item.listing_id} className="mkt-card">
                <button
                  onClick={() => removeItem(item.listing_id)}
                  className="mkt-heart"
                  title="Remove from watchlist"
                >
                  ❤️
                </button>

                <Link to={`/listing/${item.listing_id}`} className="mkt-cardlink">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.crop_name} className="mkt-card__img" />
                  ) : (
                    <div className="mkt-card__ph">
                      <span>🌿</span>
                    </div>
                  )}

                  <div className="mkt-card__body">
                    <h2 className="mkt-card__title">{item.crop_name}</h2>
                    <p className="mkt-card__loc">
                      📍 {[item.district, item.state].filter(Boolean).join(", ")}
                    </p>

                    <div className="mkt-tiles">
                      <div className="mkt-tile mkt-tile--green">
                        <p className="mkt-tile__label">🌾 Expected Yield</p>
                        <p className="mkt-tile__value">{formatYield(item)}</p>
                      </div>
                      <div className="mkt-tile mkt-tile--gray">
                        <p className="mkt-tile__label">Land</p>
                        <p className="mkt-tile__value">{item.land_size} ac</p>
                      </div>
                    </div>

                    <p className="mkt-card__farmer">
                      👨‍🌾 {item.farmer_name}
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
