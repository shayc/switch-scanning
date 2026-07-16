import { useEffect, useId, useRef } from "react";
import type { SwitchAction } from "../../core/input/switches.ts";
import { useScannerContext } from "../context.ts";
import {
  usePointerSwitch,
  type PointerSwitchProps,
  type UsePointerSwitchOptions,
} from "../hooks/usePointerSwitch.ts";
import {
  resolveSwitchBinding,
  useDeclareSwitchControl,
  type SwitchGesture,
} from "./SwitchScanner.tsx";

/** Options for a dedicated pointer/touch switch surface. */
export type UseSwitchOptions = Omit<UsePointerSwitchOptions, "switchId">;

/** Props spread directly onto a dedicated switch surface. */
export type SwitchProps = PointerSwitchProps;

/**
 * Operate one scanner control from a pointer/touch surface: either a plain
 * action (`useSwitch("select")`) or a stabilized gesture
 * (`useSwitch({ tap: "next", hold: { afterMs: 700, action: "select" } })`).
 * Give a gesture an `id` to share one logical switch with a keyboard binding.
 */
export function useSwitch(
  binding: SwitchAction | SwitchGesture,
  options: UseSwitchOptions = {},
): SwitchProps {
  const { scanner } = useScannerContext("useSwitch");
  const declare = useDeclareSwitchControl("useSwitch");
  const generatedId = useId();

  const resolved = resolveSwitchBinding(binding, generatedId, "useSwitch");
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

  const { switchId, signature } = resolved;
  useEffect(
    () => declare(switchId, resolvedRef.current.definition, signature),
    [declare, switchId, signature],
  );

  return usePointerSwitch(scanner, { ...options, switchId });
}
