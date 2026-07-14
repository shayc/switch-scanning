import { expectTypeOf, it } from "vitest";
import type { Scanner, ScannerSnapshot } from "../../core/index.ts";
import { useScannerSnapshot } from "./useScannerSnapshot.ts";

it("types explicit-scanner snapshot and selector calls accurately", () => {
  const useSnapshotTypeAssertions = (scanner: Scanner): void => {
    const snapshot = useScannerSnapshot(scanner);
    expectTypeOf(snapshot).toEqualTypeOf<ScannerSnapshot>();

    const status = useScannerSnapshot(scanner, (current) => current.status);
    expectTypeOf(status).toEqualTypeOf<ScannerSnapshot["status"]>();
  };

  // Type-check the calls above without invoking React hooks in this test.
  expectTypeOf(useSnapshotTypeAssertions).toBeFunction();
});
