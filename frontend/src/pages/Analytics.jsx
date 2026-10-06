import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import "./analytics.css";

const COLORS = ["#16a34a", "#2563eb", "#f59e0b", "#dc2626", "#8b5cf6", "#06b6d4", "#ec4899"];

function StatCard({ icon, label, value, sub, color = "green" }) {
  return (
    <div className={`anl-stat anl-stat--${color}`}>
      <div className="anl-stat__icon">{icon}</div>
      <div className="anl-stat__value">{value}</div>
      <div className="anl-stat__label">{label}</div>
      {sub && <div className="anl-stat__sub">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    setUser(u);
    fetchAnalytics(u.role);
  }, []);

  const fetchAnalytics = async (role) => {
    try {
      const endpoint = role === "farmer" ? "/analytics/farmer"
        : role === "buyer" ? "/analytics/buyer"
        : "/analytics/platform";
      const res = await api.get(endpoint);
      setData(res.data.analytics);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="page-loader">
      <div className="spinner" />
    </div>
  );

  const fmt = (n) => n ? Number(n).toLocaleString("en-IN") : "0";
  const fmtL = (n) => n ? `₹${(Number(n) / 100000).toFixed(1)}L` : "₹0";

  return (
    <div className="anl">
      <Navbar />
      <div className="anl__inner">
        <div className="anl__head">
          <h1 className="anl__title">Analytics 📊</h1>
          <p className="anl__subtitle anl__subtitle--cap">{user?.role} performance overview</p>
        </div>

        {/* FARMER VIEW */}
        {user?.role === "farmer" && data && (
          <>
            <div className="anl-stats anl-stats--lg4">
              <StatCard icon="🌾" label="Total Listings" value={data.listings?.total || 0} color="green" />
              <StatCard icon="✅" label="Verified Farms" value={data.listings?.verified || 0} color="blue" />
              <StatCard icon="📋" label="Total Contracts" value={data.contracts?.total || 0} color="purple" />
              <StatCard icon="💰" label="Total Earned" value={fmtL(data.revenue?.total_earned)} sub="from completed deals" color="yellow" />
            </div>

            <div className="anl-charts">
              {/* Monthly listing trend */}
              <div className="anl-card">
                <h2 className="anl-card__title">📅 Monthly Listings & Yield</h2>
                {data.monthly_trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.monthly_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="listings" fill="#16a34a" name="Listings" radius={[4,4,0,0]} />
                      <Bar yAxisId="right" dataKey="yield" fill="#2563eb" name="Yield (T)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="anl-empty">No data yet</p>}
              </div>

              {/* Crop distribution */}
              <div className="anl-card">
                <h2 className="anl-card__title">🌿 Crop Distribution</h2>
                {data.crop_distribution?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={data.crop_distribution}
                        dataKey="count"
                        nameKey="crop_name"
                        cx="50%" cy="50%"
                        outerRadius={80}
                        label={({ crop_name, percent }) => `${crop_name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {data.crop_distribution.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="anl-empty">No data yet</p>}
              </div>
            </div>

            {/* Contract status breakdown */}
            <div className="anl-card">
              <h2 className="anl-card__title">📋 Contract Status Breakdown</h2>
              <div className="anl-cbreak">
                {[
                  { label: "Pending", value: data.contracts?.pending, cls: "anl-cbox--yellow" },
                  { label: "Accepted", value: data.contracts?.accepted, cls: "anl-cbox--green" },
                  { label: "Completed", value: data.contracts?.completed, cls: "anl-cbox--blue" },
                  { label: "Avg Price/Q", value: `₹${Math.round(data.revenue?.avg_price_per_quintal || 0)}`, cls: "anl-cbox--purple" },
                ].map((s) => (
                  <div key={s.label} className={`anl-cbox ${s.cls}`}>
                    <div className="anl-cbox__value">{s.value || 0}</div>
                    <div className="anl-cbox__label">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* BUYER VIEW */}
        {user?.role === "buyer" && data && (
          <>
            <div className="anl-stats anl-stats--lg4">
              <StatCard icon="📋" label="Total Contracts" value={data.contracts?.total || 0} color="green" />
              <StatCard icon="✅" label="Active Deals" value={data.contracts?.active || 0} color="blue" />
              <StatCard icon="🏆" label="Completed" value={data.contracts?.completed || 0} color="purple" />
              <StatCard icon="💰" label="Total Invested" value={fmtL(data.investment?.total_committed)} color="yellow" />
            </div>

            <div className="anl-charts">
              {/* Monthly investment */}
              <div className="anl-card">
                <h2 className="anl-card__title">📈 Monthly Investment</h2>
                {data.monthly_trend?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.monthly_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
                      <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Value"]} />
                      <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} name="Investment" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="anl-empty">No data yet</p>}
              </div>

              {/* Crop portfolio */}
              <div className="anl-card">
                <h2 className="anl-card__title">🌾 Crop Portfolio</h2>
                {data.crop_portfolio?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.crop_portfolio} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="crop_name" type="category" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="contracts" fill="#16a34a" name="Contracts" radius={[0,4,4,0]}>
                        {data.crop_portfolio.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="anl-empty">No data yet</p>}
              </div>
            </div>

            {/* Top farmers */}
            {data.top_farmers?.length > 0 && (
              <div className="anl-list">
                <div className="anl-list__head">
                  <h2 className="anl-list__title">👨‍🌾 Your Top Farmers</h2>
                </div>
                <div className="anl-list__body">
                  {data.top_farmers.map((f, i) => (
                    <div key={i} className="anl-list__row">
                      <div className="anl-rank">
                        <div className="anl-rank__num">
                          {i + 1}
                        </div>
                        <div>
                          <p className="anl-farmer__name">{f.name}</p>
                          <p className="anl-muted-xs">{f.contracts} contracts</p>
                        </div>
                      </div>
                      <div className="anl-list__right">
                        <p className="anl-farmer__rating">
                          {"⭐".repeat(Math.round(f.avg_rating || 0))} {f.avg_rating ? parseFloat(f.avg_rating).toFixed(1) : "—"}
                        </p>
                        <p className="anl-muted-xs">{f.total_quantity} T total</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ADMIN VIEW */}
        {user?.role === "admin" && data && (
          <>
            <div className="anl-stats anl-stats--lg4">
              <StatCard icon="👥" label="Total Users" value={fmt(data.users?.total)} sub={`+${data.users?.new_this_month} this month`} color="green" />
              <StatCard icon="🌾" label="Total Listings" value={fmt(data.listings?.total)} sub={`${data.listings?.verified} verified`} color="blue" />
              <StatCard icon="📋" label="Total Contracts" value={fmt(data.contracts?.total)} sub={`${data.contracts?.completed} completed`} color="purple" />
              <StatCard icon="💰" label="Platform Volume" value={fmtL(data.contracts?.total_volume)} sub="settled contracts" color="yellow" />
            </div>

            <div className="anl-charts">
              {/* User growth */}
              <div className="anl-card">
                <h2 className="anl-card__title">📈 User Growth</h2>
                {data.user_growth?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.user_growth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="users" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="anl-empty">No data yet</p>}
              </div>

              {/* Crop breakdown */}
              <div className="anl-card">
                <h2 className="anl-card__title">🌿 Platform Crop Breakdown</h2>
                {data.crop_breakdown?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.crop_breakdown.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="crop_name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="listings" fill="#16a34a" name="Listings" radius={[4,4,0,0]}>
                        {data.crop_breakdown.slice(0,8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="anl-empty">No data yet</p>}
              </div>
            </div>

            {/* Regional breakdown */}
            {data.regional?.length > 0 && (
              <div className="anl-list">
                <div className="anl-list__head">
                  <h2 className="anl-list__title">📍 Top Districts by Listings</h2>
                </div>
                <div className="anl-list__body">
                  {data.regional.map((r, i) => (
                    <div key={i} className="anl-list__row">
                      <div className="anl-rank">
                        <span className="anl-reg__rank">{i + 1}</span>
                        <p className="anl-reg__district">{r.district}</p>
                      </div>
                      <div className="anl-reg__metrics">
                        <div className="anl-reg__metric">
                          <p className="anl-muted-xs">Listings</p>
                          <p className="anl-reg__value">{r.listings}</p>
                        </div>
                        <div className="anl-reg__metric">
                          <p className="anl-muted-xs">Total Yield</p>
                          <p className="anl-reg__value anl-reg__value--green">{parseFloat(r.total_yield || 0).toFixed(1)} T</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
