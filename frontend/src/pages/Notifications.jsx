import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./notifications.css";

const TYPE_ICONS = {
  contract_request: "📋", contract_accepted: "✅", contract_rejected: "❌",
  stage_uploaded: "🌱", payment_released: "💰", gps_alert: "📍", system: "🔔",
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data.notifications || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  if (loading) return (
    <div className="page-loader">
      <div className="spinner" />
    </div>
  );

  return (
    <div className="notif-page">
      <Navbar />
      <div className="notif-page__inner">
        <div className="notif-head">
          <div>
            <h1 className="notif-title">Notifications 🔔</h1>
            {unread > 0 && <p className="notif-unread-count">{unread} unread notification{unread !== 1 ? "s" : ""}</p>}
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} className="notif-markall">
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="notif-empty">
            <p className="notif-empty__icon">🔔</p>
            <p className="notif-empty__title">No notifications yet</p>
            <p className="notif-empty__text">You&apos;ll see updates about contracts, crop stages, and payments here.</p>
          </div>
        ) : (
          <div className="notif-list">
            {notifications.map((n) => (
              <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
                className={`notif-item ${!n.is_read ? "notif-item--unread" : ""}`}>
                <div className="notif-item__row">
                  <span className="notif-item__icon">{TYPE_ICONS[n.type] || "🔔"}</span>
                  <div className="notif-item__body">
                    <div className="notif-item__top">
                      <p className="notif-item__title">{n.title}</p>
                      {!n.is_read && <span className="notif-item__dot" />}
                    </div>
                    <p className="notif-item__msg">{n.message}</p>
                    <p className="notif-item__date">
                      {new Date(n.created_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
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
