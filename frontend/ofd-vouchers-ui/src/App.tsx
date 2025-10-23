// App.tsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Dashboard } from "./pages/Dashboard";
import Positions from "./pages/Positions"; // ⬅ new page
import { AdminActions } from "./components/actions/AdminActions";
import PositionDetail from "./components/positions/PositionDetailsCard.backend";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <div className="h-3" />
        <Routes>
          <Route
            path="/"
            element={
              <>
                <Dashboard />
                <div className="h-6" />
                <AdminActions />
              </>
            }
          />
          <Route path="/positions" element={<Positions />} />
          <Route path="/position/:address" element={<PositionDetail />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
