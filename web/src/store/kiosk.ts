"use client";

import { create } from "zustand";
import type { Product, ProductCard } from "@/lib/types";

export interface ChatMsg {
  who: "user" | "bot";
  text: string;
  cards?: ProductCard[];
  warnings?: string[];
  needStaff?: boolean;
}

interface CartLine {
  product: Product;
  qty: number;
}

const IDLE_MS = 3 * 60 * 1000; // a "session" = one customer; reset after inactivity
const SS = typeof window !== "undefined" ? window.sessionStorage : null;
const now = () => Date.now();
const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "s" + now();

interface KioskState {
  // cart
  cart: Record<string, CartLine>;
  addToCart: (p: Product) => void;
  setCartQty: (p: Product, qty: number) => void;
  setQty: (code: string, qty: number) => void;
  clearCart: () => void;
  cartCount: () => number;

  // what the customer is viewing (anchors the assistant)
  focusItem: string;
  focusName: string;
  focusCat: string;
  setFocusProduct: (code: string, name: string, cat?: string) => void;
  setFocusCategory: (cat: string) => void;
  clearFocus: () => void;

  // chat session
  sessionId: string;
  phone: string;
  history: ChatMsg[];
  setPhone: (p: string) => void;
  pushMsg: (m: ChatMsg) => void;
  ensureFreshSession: () => void;
  newSession: () => void;

  // transient "call seller" overlay (shown over any route)
  callStaffOpen: boolean;
  openCallStaff: () => void;
  closeCallStaff: () => void;
}

function loadSession() {
  if (!SS) return { sessionId: newId(), phone: "", history: [] as ChatMsg[] };
  const last = parseInt(SS.getItem("cago_chat_active") || "0", 10);
  if (!SS.getItem("cago_chat_session") || now() - last > IDLE_MS) {
    const id = newId();
    SS.setItem("cago_chat_session", id);
    SS.removeItem("cago_chat_history");
    SS.removeItem("cago_chat_phone");
    SS.setItem("cago_chat_active", String(now()));
    return { sessionId: id, phone: "", history: [] as ChatMsg[] };
  }
  let history: ChatMsg[] = [];
  try {
    history = JSON.parse(SS.getItem("cago_chat_history") || "[]");
  } catch {
    history = [];
  }
  return {
    sessionId: SS.getItem("cago_chat_session") || newId(),
    phone: SS.getItem("cago_chat_phone") || "",
    history,
  };
}

const touch = () => SS?.setItem("cago_chat_active", String(now()));

export const useKiosk = create<KioskState>((set, get) => {
  const initial = typeof window !== "undefined" ? loadSession() : { sessionId: "ssr", phone: "", history: [] };
  return {
    cart: {},
    addToCart: (p) =>
      set((s) => {
        const line = s.cart[p.item_code] || { product: p, qty: 0 };
        return { cart: { ...s.cart, [p.item_code]: { product: p, qty: line.qty + 1 } } };
      }),
    setCartQty: (p, qty) =>
      set((s) => {
        const next = { ...s.cart };
        if (qty <= 0) delete next[p.item_code];
        else next[p.item_code] = { product: p, qty };
        return { cart: next };
      }),
    setQty: (code, qty) =>
      set((s) => {
        const next = { ...s.cart };
        if (qty <= 0) delete next[code];
        else if (next[code]) next[code] = { ...next[code], qty };
        return { cart: next };
      }),
    clearCart: () => set({ cart: {} }),
    cartCount: () => Object.values(get().cart).reduce((a, x) => a + x.qty, 0),

    focusItem: "",
    focusName: "",
    focusCat: "",
    setFocusProduct: (code, name, cat) => set({ focusItem: code, focusName: name, focusCat: cat || "" }),
    setFocusCategory: (cat) => set({ focusItem: "", focusName: "", focusCat: cat || "" }),
    clearFocus: () => set({ focusItem: "", focusName: "", focusCat: "" }),

    sessionId: initial.sessionId,
    phone: initial.phone,
    history: initial.history,
    setPhone: (p) => {
      SS?.setItem("cago_chat_phone", p);
      touch();
      set({ phone: p });
    },
    pushMsg: (m) =>
      set((s) => {
        const history = [...s.history, m].slice(-50);
        SS?.setItem("cago_chat_history", JSON.stringify(history));
        touch();
        return { history };
      }),
    ensureFreshSession: () => {
      if (!SS) return;
      const last = parseInt(SS.getItem("cago_chat_active") || "0", 10);
      if (now() - last > IDLE_MS) get().newSession();
      else touch();
    },
    newSession: () => {
      const id = newId();
      SS?.setItem("cago_chat_session", id);
      SS?.removeItem("cago_chat_history");
      SS?.removeItem("cago_chat_phone");
      touch();
      set({ sessionId: id, phone: "", history: [] });
    },

    callStaffOpen: false,
    openCallStaff: () => set({ callStaffOpen: true }),
    closeCallStaff: () => set({ callStaffOpen: false }),
  };
});
