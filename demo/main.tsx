import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@shayc/switch-scanning/styles.css";
import { App } from "./App.tsx";
import "./demo.css";
import { demoCssVariablesResolver, demoTheme } from "./theme.ts";

const container = document.getElementById("root");
if (!container) throw new Error("demo: #root container is missing");

createRoot(container).render(
  <StrictMode>
    <MantineProvider
      defaultColorScheme="auto"
      theme={demoTheme}
      cssVariablesResolver={demoCssVariablesResolver}
    >
      <App />
    </MantineProvider>
  </StrictMode>,
);
