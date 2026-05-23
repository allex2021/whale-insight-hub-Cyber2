import { useEffect, useState, useCallback } from "react";

export type CustomAlertOp = ">" | "<";
export type CustomAlertMetric = "price" | "trade_size";

export type CustomAlert = {
  id: string;
  asset: string; // BTC, ETH, etc.
  metric: CustomAlertMetric;
  op: CustomAlertOp;
  value: number;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
};

const KEY = "custom-alerts:v1";

function read(): CustomAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(alerts: CustomAlert[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(alerts));
  window.dispatchEvent(new CustomEvent("custom-alerts-changed"));
}

export function useCustomAlerts() {
  const [alerts, setAlerts] = useState<CustomAlert[]>([]);

  useEffect(() => {
    setAlerts(read());
    const onChange = () => setAlerts(read());
    window.addEventListener("custom-alerts-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("custom-alerts-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const add = useCallback((a: Omit<CustomAlert, "id" | "createdAt">) => {
    const next = [...read(), {
      ...a,
      id: Math.random().toString(36).slice(2, 10),
      createdAt: Date.now(),
    }];
    write(next);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((a) => a.id !== id));
  }, []);

  const toggle = useCallback((id: string) => {
    write(read().map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a));
  }, []);

  const markTriggered = useCallback((id: string) => {
    write(read().map((a) => a.id === id ? { ...a, lastTriggeredAt: Date.now() } : a));
  }, []);

  return { alerts, add, remove, toggle, markTriggered };
}
