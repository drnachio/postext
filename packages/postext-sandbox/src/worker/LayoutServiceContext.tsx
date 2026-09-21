'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createLayoutService, type LayoutService } from './LayoutService';

const LayoutServiceContext = createContext<LayoutService | null>(null);

/** Services created by a state initialiser that no provider has adopted
 *  yet (strict mode calls the initialiser twice and keeps one result). */
const unadopted = new Set<LayoutService>();

/** Owns the sandbox's one layout worker for as long as it is mounted. */
export function LayoutServiceProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<LayoutService>(() => {
    const created = createLayoutService();
    unadopted.add(created);
    return created;
  });
  useEffect(() => {
    unadopted.delete(service);
    for (const spare of unadopted) spare.dispose();
    unadopted.clear();
    // Strict mode runs the effect, its cleanup, then the effect again on
    // the same render: the service the cleanup disposed is replaced, and
    // the consumers re-render with the new one.
    if (service.disposed) {
      setService(createLayoutService());
      return;
    }
    return () => { service.dispose(); };
  }, [service]);
  return (
    <LayoutServiceContext.Provider value={service}>
      {children}
    </LayoutServiceContext.Provider>
  );
}

export function useLayoutService(): LayoutService {
  const service = useContext(LayoutServiceContext);
  if (!service) throw new Error('useLayoutService must be used inside <LayoutServiceProvider>');
  return service;
}
