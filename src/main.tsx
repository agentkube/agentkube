import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { HashRouter } from 'react-router-dom';
import { PostHogProvider } from 'posthog-js/react';

const options = {
  api_host: 'https://us.i.posthog.com',
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PostHogProvider
      apiKey="phc_75dl0rQZGU4jw7Fx64FW7k5bFA1TEUzGaNBMHRJhe0m"
      options={options}
    >
      <HashRouter>
        <App />
      </HashRouter>
    </PostHogProvider>
  </React.StrictMode>
);
