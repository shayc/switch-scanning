import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createTheme,
  MantineProvider,
  type CSSVariablesResolver,
} from "@mantine/core";
import "@mantine/core/styles.css";
import "@shayc/switch-scanning/styles.css";
import { App } from "./App.tsx";
import "./Demo.module.css";

const container = document.getElementById("root");
if (!container) throw new Error("demo: #root container is missing");

const theme = createTheme({
  autoContrast: true,
  primaryShade: 8,
  respectReducedMotion: true,
});

const cssVariablesResolver: CSSVariablesResolver = (resolvedTheme) => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": resolvedTheme.colors.gray[7],
  },
  dark: {
    "--mantine-color-dimmed": resolvedTheme.colors.dark[1],
  },
});

createRoot(container).render(
  <StrictMode>
    <MantineProvider
      defaultColorScheme="auto"
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
    >
      <App />
    </MantineProvider>
  </StrictMode>,
);
