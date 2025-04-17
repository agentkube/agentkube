import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { HashRouter } from 'react-router-dom';
import { PostHogProvider } from "./contexts/useAnalytics";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PostHogProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </PostHogProvider>
  </React.StrictMode>
);
