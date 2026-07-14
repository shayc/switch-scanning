import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";

const demoBlue: MantineColorsTuple = [
  "#f2f5ff",
  "#e3e9ff",
  "#c5d3ff",
  "#a2b9ff",
  "#83a2ff",
  "#6f93ff",
  "#235ee7",
  "#1d50ca",
  "#1743ad",
  "#113691",
];

export const demoTheme = createTheme({
  colors: { demoBlue },
  primaryColor: "demoBlue",
  primaryShade: { light: 6, dark: 3 },
  autoContrast: true,
  defaultRadius: "md",
  cursorType: "pointer",
  respectReducedMotion: true,
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
});

export const demoCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": "var(--mantine-color-gray-7)",
  },
  dark: {
    "--mantine-color-dimmed": "var(--mantine-color-dark-2)",
  },
});
