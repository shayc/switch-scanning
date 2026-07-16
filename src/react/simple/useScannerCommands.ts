import { useMemo } from "react";
import type { Scanner } from "../../core/types.ts";
import { useScannerContext } from "../context.ts";

/** Safe lifecycle commands exposed to ordinary React components. */
export type ScannerCommands = Pick<
  Scanner,
  "start" | "pause" | "resume" | "stop" | "restart"
>;

/** Read stable lifecycle commands without exposing host/tree/input internals. */
export function useScannerCommands(): ScannerCommands {
  const { scanner } = useScannerContext("useScannerCommands");
  return useMemo(
    () => ({
      start: () => scanner.start(),
      pause: () => scanner.pause(),
      resume: () => scanner.resume(),
      stop: () => scanner.stop(),
      restart: () => scanner.restart(),
    }),
    [scanner],
  );
}
