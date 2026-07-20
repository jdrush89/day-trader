import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/game.css";
import "./styles/restaurant.css";
import "./styles/fishing.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
