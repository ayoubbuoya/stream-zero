"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { connect as connectWallet } from "@/lib/wallet";

interface WalletCtx {
  address: string | null;
  busy: boolean;
  connect: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { readonly children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      setAddress(await connectWallet());
    } catch {
      /* cancelled */
    } finally {
      setBusy(false);
    }
  }, []);

  return <Ctx.Provider value={{ address, busy, connect }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
