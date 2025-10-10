import React from "react";
import { AppShell } from "./components/layout/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { AdminActions } from "./components/actions/AdminActions";
// import { MismatchBanner } from "./components/wallet/MismatchBanner";

// Views now fetch their own data, so App stays lean.
export default function App() {
  return (
    <AppShell>
      {/* <MismatchBanner /> */}
      <div className="h-3" />
      <Dashboard />
      <div className="h-6" />
      <AdminActions />
    </AppShell>
  );
}
