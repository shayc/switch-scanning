import { useEffect, useRef, useState, type ReactNode } from "react";
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
export function ScannerProvider({ scanner, children }: ScannerProviderProps): ReactNode {
  const [value] = useState<ScannerContextValue>(() => ({
    scanner,
    registry: new ScanRegistry(),
  }));

  // If the scanner prop identity changes, surface it rather than silently
  // binding to a stale instance.
  const scannerRef = useRef<Scanner>(scanner);
  if (scannerRef.current !== scanner) {
    scannerRef.current = scanner;
  }

  useEffect(() => {
    const { registry } = value;
    const host = createDomHost(registry, (groupId) => registry.exitLabelFor(groupId));
    const detachHost = scanner.attachHost(host);
    const detachRegistry = registry.attach(scanner);
    // Publish the initial tree synchronously so a mount-start rule can fire.
    registry.flush();

    return () => {
      detachRegistry();
      detachHost();
      scanner.stop();
    };
  }, [scanner, value]);

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
}
