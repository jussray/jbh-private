import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

export interface CartItem {
  id: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
  image: string;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (id: string, variant: string) => void;
  updateQty: (id: string, variant: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  shipping: number;
  total: number;
}

const FREE_SHIP_THRESHOLD = 150;
const FLAT_SHIP = 9.99;

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback(
    (item: Omit<CartItem, "qty">, qty: number = 1) => {
      setItems((prev) => {
        const idx = prev.findIndex(
          (i) => i.id === item.id && i.variant === item.variant
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], qty: next[idx].qty + qty };
          return next;
        }
        return [...prev, { ...item, qty }];
      });
    },
    []
  );

  const removeItem = useCallback((id: string, variant: string) => {
    setItems((prev) =>
      prev.filter((i) => !(i.id === id && i.variant === variant))
    );
  }, []);

  const updateQty = useCallback((id: string, variant: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && i.variant === variant
          ? { ...i, qty: Math.max(1, qty) }
          : i
      )
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const shipping =
      subtotal === 0 || subtotal >= FREE_SHIP_THRESHOLD ? 0 : FLAT_SHIP;
    const total = subtotal + shipping;
    return {
      items,
      addItem,
      removeItem,
      updateQty,
      clear,
      count,
      subtotal,
      shipping,
      total,
    };
  }, [items, addItem, removeItem, updateQty, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export { FREE_SHIP_THRESHOLD, FLAT_SHIP };
