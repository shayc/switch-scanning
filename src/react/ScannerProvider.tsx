import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Scanner } from "../core/index.ts";
import { ScannerContext, type ScannerContextValue } from "./context.ts";
import { createDomHost } from "./domHost.ts";
import { ScanRegistry } from "./registry.ts";

export interface ScannerProviderProps {
  scanner: Scanner;
  children?: ReactNode;
}

/**
 * Provides a scanner and its registry to descendant hooks and attaches the
 * default DOM host. Attachment is reversible: on unmount (including Strict
 * Mode's extra cleanup) the host detaches and the scanner stops, but the
 * scanner object is never terminally disposed.
 */
export function ScannerProvider({
  scanner,
  children,
}: ScannerProviderProps): ReactNode {
  const [registry] = useState(() => new ScanRegistry());
  const value = useMemo<ScannerContextValue>(
    () => ({ scanner, registry }),
    [scanner, registry],
  );

  useEffect(() => {
    const host = createDomHost(registry, (groupId) =>
      registry.exitLabelFor(groupId),
    );
    const detachHost = scanner.attachHost(host);
    if (!detachHost.attached) return detachHost;
    const detachRegistry = registry.attach(scanner);
    // Publish the initial tree synchronously so a mount-start rule can fire.
    registry.flush();

    return () => {
      scanner.stop();
      detachRegistry();
      detachHost();
    };
  }, [scanner, registry]);

  return (
    <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>
  );
}
