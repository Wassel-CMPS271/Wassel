"use client";

// Bridges the offline queue (built in page.tsx — see useOfflineQueue.ts) to the
// sidebar's UserBlock in layout.tsx, which is a sibling of the page content, not a
// parent or child of it. The queue itself lives in exactly one place (page.tsx);
// this only carries one boolean signal up to the layout, so UserBlock's "warn
// before signing out" has something true to check without a second queue
// instance (a second OfflineQueue reading the same localStorage key would go
// stale: the `storage` event it relies on to notice other writers doesn't fire
// for the same tab's own writes).

import { createContext, useContext, useState, type ReactNode } from "react";

interface DriverOfflineContextValue {
  hasUnsentConfirmations: boolean;
  setHasUnsentConfirmations: (value: boolean) => void;
}

const DriverOfflineContext = createContext<DriverOfflineContextValue>({
  hasUnsentConfirmations: false,
  setHasUnsentConfirmations: () => {},
});

export function useDriverOfflineContext(): DriverOfflineContextValue {
  return useContext(DriverOfflineContext);
}

export function DriverOfflineProvider({ children }: { children: ReactNode }) {
  const [hasUnsentConfirmations, setHasUnsentConfirmations] = useState(false);
  return (
    <DriverOfflineContext.Provider value={{ hasUnsentConfirmations, setHasUnsentConfirmations }}>
      {children}
    </DriverOfflineContext.Provider>
  );
}
