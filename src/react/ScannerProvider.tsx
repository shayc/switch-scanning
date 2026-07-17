import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Scanner } from "../core/index.ts";
import { ScannerContext, type ScannerContextValue } from "./context.ts";
import { createDomHost } from "./domHost.ts";
import { ScanRegistry } from "./registry.ts";

/** Props for {@link ScannerProvider}. */
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
    const attachment = scanner.attachHost(host);
    if (!attachment.attached) return () => attachment.detach();
    const detachRegistry = registry.attach(scanner);
    // An element replaced under a stable id changes no ids or labels, so the
    // scanner never re-reveals; the host has to re-decorate from the registry.
    const stopElementWatch = registry.observeElements(() => host.refresh());
    // Publish the initial tree synchronously so a mount-start rule can fire.
    registry.flush();

    return () => {
      scanner.stop();
      stopElementWatch();
      detachRegistry();
      attachment.detach();
    };
  }, [scanner, registry]);

  return (
    <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>
  );
}
