import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@shayc/switch-scanning/styles.css";
import { App } from "./App.tsx";
import "./demo.css";

const container = document.getElementById("root");
if (!container) throw new Error("demo: #root container is missing");

const theme = createTheme({
  autoContrast: true,
  primaryShade: 8,
  respectReducedMotion: true,
});

createRoot(container).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto" theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
);
