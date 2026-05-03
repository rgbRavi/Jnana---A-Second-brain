import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./main.css"

if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
  window.location.replace(`${window.location.pathname}#/jnana`);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  
  <React.StrictMode>
    <div>
    <App />
    </div>
  </React.StrictMode>,
);
