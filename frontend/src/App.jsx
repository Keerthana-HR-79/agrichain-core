import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import Marketplace from "@/pages/Marketplace";
import MarketPrices from "@/pages/MarketPrices";
import Watchlist from "@/pages/Watchlist";
import Notifications from "@/pages/Notifications";
import FarmerDashboard from "@/pages/FarmerDashboard";
import BuyerDashboard from "@/pages/BuyerDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import Analytics from "@/pages/Analytics";
import CreateListing from "@/pages/CreateListing";
import MyListings from "@/pages/MyListings";
import FarmerContracts from "@/pages/FarmerContracts";
import BuyerContracts from "@/pages/BuyerContracts";
import Escrow from "@/pages/Escrow";
import ListingDetail from "@/pages/ListingDetail";
import ListingEdit from "@/pages/ListingEdit";
import ListingAddStage from "@/pages/ListingAddStage";
import StageDetail from "@/pages/StageDetail";
import StageAddUpdate from "@/pages/StageAddUpdate";
import ProfileView from "@/pages/ProfileView";
import ProfileEdit from "@/pages/ProfileEdit";

// NOTE: reset-password and verify-otp had empty page.js-less folders in the
// original Next.js project (no code inside) — login/signup handle OTP entry
// inline, so there was nothing to migrate for those two routes.

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/market-prices" element={<MarketPrices />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/notifications" element={<Notifications />} />

        <Route path="/farmer-dashboard" element={<FarmerDashboard />} />
        <Route path="/buyer-dashboard" element={<BuyerDashboard />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />

        <Route path="/analytics" element={<Analytics />} />

        <Route path="/create-listing" element={<CreateListing />} />
        <Route path="/my-listings" element={<MyListings />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/listing/:id/edit" element={<ListingEdit />} />
        <Route path="/listing/:id/add-stage" element={<ListingAddStage />} />

        <Route path="/stage/:id" element={<StageDetail />} />
        <Route path="/stage/:id/add-update" element={<StageAddUpdate />} />

        <Route path="/farmer-contracts" element={<FarmerContracts />} />
        <Route path="/buyer-contracts" element={<BuyerContracts />} />
        <Route path="/escrow" element={<Escrow />} />

        <Route path="/profile/:id" element={<ProfileView />} />
        <Route path="/profile/edit" element={<ProfileEdit />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="notfound">
      <div>
        <p className="notfound__icon">🌾</p>
        <h1 className="notfound__title">Page not found</h1>
        <a href="/" className="notfound__link">← Back home</a>
      </div>
    </div>
  );
}
