import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { formatYield } from "@/lib/yield";
import "./listings.css";

export default function MyListingsPage() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "farmer") { navigate("/login"); return; }
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      const res = await api.get("/listings/my-listings");
      setListings(res.data.listings || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteListing = async (id) => {
    if (!window.confirm("Delete this listing? This action cannot be undone.")) return;
    try {
      await api.delete(`/listings/${id}`);
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch { alert("Failed to delete listing"); }
  };

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  return (
    <div className="mkt-page">
      <Navbar />
      <div className="mkt-container">
        <div className="mkt-head--row">
          <div>
            <h1 className="mkt-title">My Listings 🌾</h1>
            <p className="mkt-subtitle">{listings.length} listing{listings.length !== 1 ? "s" : ""} total</p>
          </div>
          <Link to="/create-listing" className="mkt-btn">
            + New Listing
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="mkt-empty-card">
            <p className="mkt-empty__icon">🌱</p>
            <p className="mkt-empty__title mkt-empty__title--mb">No listings yet</p>
            <p className="mkt-empty__text--mb">Create your first crop listing to list it on the marketplace.</p>
            <Link to="/create-listing" className="mkt-btn mkt-btn--wide">
              Create First Listing →
            </Link>
          </div>
        ) : (
          <div className="mkt-grid">
            {listings.map((l) => (
              <div key={l.id} className="mkt-card">
                {l.image_url ? (
                  <img src={l.image_url} alt={l.crop_name} className="mkt-card__img" />
                ) : (
                  <div className="mkt-card__ph">
                    <span>🌿</span>
                  </div>
                )}

                <div className="mkt-card__body">
                  <div className="mkt-card__titlerow">
                    <h2 className="mkt-card__title">{l.crop_name}</h2>
                    {l.farm_verified ? (
                      <span className="mkt-tag mkt-tag--verified">✅</span>
                    ) : (
                      <span className="mkt-tag mkt-tag--pending">⏳</span>
                    )}
                  </div>

                  <p className="mkt-card__loc">
                    📍 {[l.village, l.taluka, l.district].filter(Boolean).join(", ")}
                    {l.state && `, ${l.state}`}
                  </p>

                  <div className="mkt-tiles mkt-tiles--mb">
                    <div className="mkt-tile mkt-tile--green">
                      <p className="mkt-tile__label">🌾 Expected Yield</p>
                      <p className="mkt-tile__value">{formatYield(l)}</p>
                    </div>
                    <div className="mkt-tile mkt-tile--gray">
                      <p className="mkt-tile__label">Land</p>
                      <p className="mkt-tile__value">{l.land_size} ac</p>
                    </div>
                    <div className="mkt-tile mkt-tile--blue">
                      <p className="mkt-tile__label">Stages</p>
                      <p className="mkt-tile__value">{l.stage_count || 0} / 5</p>
                    </div>
                    <div className="mkt-tile mkt-tile--purple">
                      <p className="mkt-tile__label">Contracts</p>
                      <p className="mkt-tile__value">{l.contract_count || 0}</p>
                    </div>
                  </div>

                  <div className="mkt-card__actions">
                    <Link to={`/listing/${l.id}`} className="mkt-btn mkt-btn--sm">
                      View Details
                    </Link>
                    <Link to={`/listing/${l.id}/add-stage`} className="mkt-btn--soft">
                      + Stage
                    </Link>
                    <button onClick={() => deleteListing(l.id)} className="mkt-btn--danger">
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
