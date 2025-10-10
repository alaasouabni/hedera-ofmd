import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { WalletProvider } from "./components/wallet/WalletProvider";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
      <WalletProvider>
        <App />
      </WalletProvider>
  </React.StrictMode>
);
