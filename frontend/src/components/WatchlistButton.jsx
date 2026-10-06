import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import "./components.css";

export default function WatchlistButton({ listingId, className = "" }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api.get(`/watchlist/check/${listingId}`)
      .then((res) => setSaved(res.data.saved))
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [listingId]);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      if (saved) {
        await api.delete(`/watchlist/${listingId}`);
        setSaved(false);
      } else {
        await api.post("/watchlist", { listing_id: listingId });
        setSaved(true);
      }
    } catch {}
    finally { setLoading(false); }
  };

  if (!checked) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`wl-btn ${className}`}
      title={saved ? "Remove from watchlist" : "Save to watchlist"}
    >
      <span className="wl-btn__icon">{saved ? "❤️" : "🤍"}</span>
    </button>
  );
}
