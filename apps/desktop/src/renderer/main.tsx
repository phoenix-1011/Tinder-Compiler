import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { setupMonacoEnvironment } from "./monaco/setup";
import "@vscode/codicons/dist/codicon.css";
import "./styles/global.css";

setupMonacoEnvironment();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container missing");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
