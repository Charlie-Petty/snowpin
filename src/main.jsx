// File: src/main.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import HomePage from "./components/HomePage.jsx";
import MapPage from "./components/MapPage.jsx";
import ProfilePage from "./components/ProfilePage.jsx";
import SubmitPin from "./components/SubmitPin.jsx";
import LoginPage from "./components/LoginPage.jsx";
import SignupPage from "./components/SignupPage.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import PinDetail from "./components/PinDetail.jsx";
import HitReviewPage from "./components/HitReviewPage.jsx";
import HitItBetterPage from "./components/HitItBetterPage.jsx";
import PublicProfile from "./components/PublicProfile.jsx";
import CreateProfilePage from "./components/CreateProfilePage.jsx"; 
// NEW: Import the beta feedback page
import BetaFeedbackPage from "./components/BetaFeedbackPage.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<HomePage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="submit-pin" element={<SubmitPin />} />
          <Route path="pin/:pinId" element={<PinDetail />} />
          <Route path="pin/:pinId/review" element={<HitReviewPage />} />
          <Route path="pin/:pinId/challenge" element={<HitItBetterPage />} />
          <Route path="/user/:userId" element={<PublicProfile />} />
          <Route path="create-profile" element={<CreateProfilePage />} />
          {/* NEW: Add the route for the beta feedback page */}
          <Route path="beta-feedback" element={<BetaFeedbackPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);