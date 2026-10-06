import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./profile.css";

function StarRating({ rating }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span className="prof-star-rating">
      {"⭐".repeat(full)}
      {half && "✨"}
      {rating === 0 && <span className="prof-star-rating__empty">No ratings yet</span>}
    </span>
  );
}

export default function PublicProfilePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    setCurrentUser(getUser());
    fetchProfile();
  }, [id]);

  const fetchProfile = async () => {
    try {
      const res = await api.get(`/profile/${id}`);
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="page-loader">
      <div className="spinner" />
    </div>
  );

  if (!data) return (
    <div className="page-loader">
      <p className="page-loader__text">User not found.</p>
    </div>
  );

  const { user, stats, recent_reviews } = data;
  const isOwnProfile = currentUser?.id === user.id;
  const ratingTotal = parseInt(stats?.total_reviews || user.total_reviews || 0);

  return (
    <div className="prof">
      <Navbar />
      <div className="prof__inner">
        {/* Header card */}
        <div className="prof-card">
          <div className="prof-header">
            <div className="prof-avatar">
              {user.profile_image ? (
                <img src={user.profile_image} alt={user.name} className="prof-avatar__img" />
              ) : (
                user.name?.[0]?.toUpperCase()
              )}
            </div>

            <div className="prof-header__main">
              <div className="prof-header__top">
                <div>
                  <h1 className="prof-name">{user.name}</h1>
                  <span className={`prof-role ${user.role === "farmer" ? "prof-role--farmer" : "prof-role--buyer"}`}>
                    {user.role === "farmer" ? "👨‍🌾 Farmer" : "🏢 Buyer"}
                  </span>
                </div>
                {isOwnProfile && (
                  <Link to="/profile/edit" className="prof-edit-btn">
                    Edit Profile
                  </Link>
                )}
              </div>

              <div className="prof-rating-row">
                <StarRating rating={parseFloat(user.avg_rating || 0)} />
                {ratingTotal > 0 && (
                  <span className="prof-rating-count">
                    {parseFloat(user.avg_rating).toFixed(1)} ({ratingTotal} review{ratingTotal !== 1 ? "s" : ""})
                  </span>
                )}
              </div>

              {user.bio && <p className="prof-bio">{user.bio}</p>}

              <div className="prof-meta">
                {user.district && <span>📍 {user.district}, {user.state}</span>}
                {user.phone_number && <span>📞 {user.phone_number}</span>}
                <span>📅 Joined {new Date(user.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="prof-stats">
          {user.role === "farmer" ? (
            <>
              <div className="prof-stat">
                <p className="prof-stat__value">{stats?.total_listings || 0}</p>
                <p className="prof-stat__label">Total Listings</p>
              </div>
              <div className="prof-stat">
                <p className="prof-stat__value prof-stat__value--green">{stats?.verified_listings || 0}</p>
                <p className="prof-stat__label">Verified Farms</p>
              </div>
              <div className="prof-stat">
                <p className="prof-stat__value prof-stat__value--blue">{stats?.total_contracts || 0}</p>
                <p className="prof-stat__label">Total Contracts</p>
              </div>
              <div className="prof-stat">
                <p className="prof-stat__value prof-stat__value--purple">{parseFloat(stats?.total_yield || 0).toFixed(1)}T</p>
                <p className="prof-stat__label">Total Expected Yield</p>
              </div>
            </>
          ) : (
            <>
              <div className="prof-stat">
                <p className="prof-stat__value">{stats?.total_contracts || 0}</p>
                <p className="prof-stat__label">Total Contracts</p>
              </div>
              <div className="prof-stat">
                <p className="prof-stat__value prof-stat__value--green">{stats?.completed || 0}</p>
                <p className="prof-stat__label">Completed Deals</p>
              </div>
              <div className="prof-stat prof-stat--wide">
                <p className="prof-stat__value prof-stat__value--blue">₹{parseFloat(stats?.total_spent || 0).toLocaleString("en-IN")}</p>
                <p className="prof-stat__label">Total Spent</p>
              </div>
            </>
          )}
        </div>

        {/* Reviews */}
        <div className="prof-reviews">
          <div className="prof-reviews__head">
            <h2 className="prof-reviews__title">Recent Reviews</h2>
          </div>
          {recent_reviews?.length === 0 ? (
            <div className="prof-reviews__empty">
              <p className="prof-reviews__empty-icon">⭐</p>
              <p className="prof-reviews__empty-text">No reviews yet</p>
            </div>
          ) : (
            <div className="prof-review-list">
              {recent_reviews?.map((r) => (
                <div key={r.id} className="prof-review">
                  <div className="prof-review__top">
                    <p className="prof-review__name">{r.reviewer_name}</p>
                    <span className="prof-review__stars">{"⭐".repeat(r.rating)}</span>
                  </div>
                  <p className="prof-review__meta">{r.crop_name} • {new Date(r.created_at).toLocaleDateString("en-IN")}</p>
                  {r.comment && <p className="prof-review__comment">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
