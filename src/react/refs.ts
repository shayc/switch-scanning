import type { Ref } from "react";

/** Assign a value to a callback ref or a ref object. */
export function applyRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as { current: T | null }).current = value;
}
