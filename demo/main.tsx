import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@shayc/switch-scanning/styles.css";
import { App } from "./App.tsx";
import "./demo.css";

const container = document.getElementById("root");
if (!container) throw new Error("demo: #root container is missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
