import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { api, getUser, logout } from "@/lib/api";
import "./components.css";

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const notifRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) fetchNotifications();

    // Click outside to close
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotif(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pathname]);

  // Poll notifications every 30s
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch {}
  };

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getDashboardLink = () => {
    if (!user) return "/login";
    if (user.role === "farmer") return "/farmer-dashboard";
    if (user.role === "buyer") return "/buyer-dashboard";
    if (user.role === "admin") return "/admin-dashboard";
    return "/";
  };

  const getNotifIcon = (type) => {
    const icons = {
      contract_request: "📋",
      contract_accepted: "✅",
      contract_rejected: "❌",
      stage_uploaded: "🌱",
      payment_released: "💰",
      gps_alert: "📍",
      system: "🔔",
    };
    return icons[type] || "🔔";
  };

  return (
    <>
    <nav className="nav">
      <div className="nav__inner">
        <div className="nav__bar">
          {/* Logo */}
          <Link to="/" className="nav__logo">
            <span className="nav__logo-mark">🌾</span>
            <span className="nav__logo-text">AgriChain</span>
          </Link>

          {/* Nav links */}
          <div className="nav__links">
            <Link to="/marketplace" className="nav__link">
              Marketplace
            </Link>
            {user?.role === "farmer" && (
              <>
                <Link to="/farmer-dashboard" className="nav__link">
                  Dashboard
                </Link>
                <Link to="/create-listing" className="nav__link">
                  + New Listing
                </Link>
                <Link to="/my-listings" className="nav__link">
                  My Listings
                </Link>
                <Link to="/farmer-contracts" className="nav__link">
                  Contracts
                </Link>
              </>
            )}
            {user?.role === "buyer" && (
              <>
                <Link to="/buyer-dashboard" className="nav__link">
                  Dashboard
                </Link>
                <Link to="/buyer-contracts" className="nav__link">
                  My Contracts
                </Link>
                <Link to="/watchlist" className="nav__link">
                  Watchlist
                </Link>
              </>
            )}
            {user?.role === "admin" && (
              <Link to="/admin-dashboard" className="nav__link">
                Admin Panel
              </Link>
            )}

            {/* More dropdown - available to all logged-in users */}
            {user && (
              <div className="nav__more" ref={moreRef}>
                <button onClick={() => setShowMore(!showMore)} className="nav__more-btn">
                  More
                  <svg className="nav__chevron-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMore && (
                  <div className="nav__more-panel">
                    <Link to="/analytics" onClick={() => setShowMore(false)} className="nav__more-item">
                      📊 Analytics
                    </Link>
                    <Link to="/market-prices" onClick={() => setShowMore(false)} className="nav__more-item">
                      📈 Market Prices
                    </Link>
                    {user.role !== "admin" && (
                      <Link to="/escrow" onClick={() => setShowMore(false)} className="nav__more-item">
                        🔒 Escrow & Payments
                      </Link>
                    )}
                    <Link to={`/profile/${user.id}`} onClick={() => setShowMore(false)} className="nav__more-item">
                      👤 My Profile
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="nav__right">
            {user ? (
              <>
                {/* Notifications Bell */}
                <div className="nav__notif" ref={notifRef}>
                  <button onClick={() => setShowNotif(!showNotif)} className="nav__bell">
                    <svg className="nav__bell-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="nav__badge badge-pulse">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notification dropdown */}
                  {showNotif && (
                    <div className="nav__notif-panel">
                      <div className="nav__notif-head">
                        <span className="nav__notif-title">Notifications</span>
                        {unreadCount > 0 && (
                          <button onClick={markAllRead} className="nav__notif-markall">
                            Mark all read
                          </button>
                        )}
                      </div>
                      <div className="nav__notif-list">
                        {notifications.length === 0 ? (
                          <div className="nav__notif-empty">
                            <p className="nav__notif-empty-icon">🔔</p>
                            <p className="nav__notif-empty-text">No notifications yet</p>
                          </div>
                        ) : (
                          notifications.slice(0, 15).map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => markRead(notif.id)}
                              className={`nav__notif-item ${!notif.is_read ? "nav__notif-item--unread" : ""}`}
                            >
                              <div className="nav__notif-row">
                                <span className="nav__notif-emoji">{getNotifIcon(notif.type)}</span>
                                <div className="nav__notif-body">
                                  <p className="nav__notif-name">{notif.title}</p>
                                  <p className="nav__notif-msg">{notif.message}</p>
                                  <p className="nav__notif-date">
                                    {new Date(notif.created_at).toLocaleDateString("en-IN", {
                                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                                    })}
                                  </p>
                                </div>
                                {!notif.is_read && (
                                  <span className="nav__notif-dot" />
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <Link
                        to="/notifications"
                        className="nav__notif-all"
                        onClick={() => setShowNotif(false)}
                      >
                        View all notifications →
                      </Link>
                    </div>
                  )}
                </div>

                {/* User menu */}
                <div className="nav__menu">
                  <button onClick={() => setShowMenu(!showMenu)} className="nav__user-btn">
                    <div className="nav__avatar">
                      {user.name?.[0]?.toUpperCase()}
                    </div>
                    <span className="nav__user-name">{user.name}</span>
                    <svg className="nav__user-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showMenu && (
                    <div className="nav__user-panel">
                      <div className="nav__user-head">
                        <p className="nav__user-head-name">{user.name}</p>
                        <p className="nav__user-head-role">{user.role}</p>
                      </div>
                      <Link
                        to={getDashboardLink()}
                        className="nav__user-item"
                        onClick={() => setShowMenu(false)}
                      >
                        Dashboard
                      </Link>
                      <button onClick={handleLogout} className="nav__logout">
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="nav__auth">
                <Link to="/login" className="nav__login">
                  Login
                </Link>
                <Link to="/signup" className="nav__signup">
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
    </>
  );
}
