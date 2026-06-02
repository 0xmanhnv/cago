"use client";

import { create } from "zustand";
import type { Product, ProductCard } from "@/lib/types";

export interface ChatMsg {
  id?: number; // stable React key; survives the slice(-50) cap so rows don't re-key
  who: "user" | "bot";
  text: string;
  cards?: ProductCard[];
  warnings?: string[];
  needStaff?: boolean;
}

// Date.now base (unique across reloads) + counter (unique within a tick) → never collides
// with ids restored from sessionStorage.
let msgSeq = 0;
const nextMsgId = () => Date.now() * 1000 + (++msgSeq % 1000);

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
  const empty = { sessionId: newId(), phone: "", history: [] as ChatMsg[], cart: {} as Record<string, CartLine> };
  if (!SS) return empty;
  const last = parseInt(SS.getItem("cago_chat_active") || "0", 10);
  if (!SS.getItem("cago_chat_session") || now() - last > IDLE_MS) {
    const id = newId();
    SS.setItem("cago_chat_session", id);
    SS.removeItem("cago_chat_history");
    SS.removeItem("cago_chat_phone");
    SS.removeItem("cago_cart");
    SS.setItem("cago_chat_active", String(now()));
    return { ...empty, sessionId: id };
  }
  let history: ChatMsg[] = [];
  let cart: Record<string, CartLine> = {};
  try {
    history = JSON.parse(SS.getItem("cago_chat_history") || "[]");
  } catch {
    history = [];
  }
  try {
    cart = JSON.parse(SS.getItem("cago_cart") || "{}");
  } catch {
    cart = {};
  }
  return { sessionId: SS.getItem("cago_chat_session") || newId(), phone: SS.getItem("cago_chat_phone") || "", history, cart };
}

const touch = () => SS?.setItem("cago_chat_active", String(now()));
// Persist the cart so a hard refresh / PWA cold start mid-selection doesn't lose it.
const saveCart = (cart: Record<string, CartLine>) => {
  touch();
  SS?.setItem("cago_cart", JSON.stringify(cart));
};

export const useKiosk = create<KioskState>((set, get) => {
  const initial = typeof window !== "undefined" ? loadSession() : { sessionId: "ssr", phone: "", history: [], cart: {} };
  return {
    cart: initial.cart,
    addToCart: (p) =>
      set((s) => {
        const line = s.cart[p.item_code] || { product: p, qty: 0 };
        const cart = { ...s.cart, [p.item_code]: { product: p, qty: line.qty + 1 } };
        saveCart(cart);
        return { cart };
      }),
    setCartQty: (p, qty) =>
      set((s) => {
        const next = { ...s.cart };
        if (qty <= 0) delete next[p.item_code];
        else next[p.item_code] = { product: p, qty };
        saveCart(next);
        return { cart: next };
      }),
    setQty: (code, qty) =>
      set((s) => {
        const next = { ...s.cart };
        if (qty <= 0) delete next[code];
        else if (next[code]) next[code] = { ...next[code], qty };
        saveCart(next);
        return { cart: next };
      }),
    clearCart: () => {
      saveCart({});
      return set({ cart: {} });
    },
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
        const history = [...s.history, { ...m, id: m.id ?? nextMsgId() }].slice(-50);
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
      SS?.removeItem("cago_cart");
      touch();
      set({ sessionId: id, phone: "", history: [], cart: {} });
    },

    callStaffOpen: false,
    openCallStaff: () => set({ callStaffOpen: true }),
    closeCallStaff: () => set({ callStaffOpen: false }),
  };
});
