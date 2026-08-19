import { useEffect, useMemo, useState } from "react";
import {
  Lock,
  Package,
  Mail,
  Phone,
  MapPin,
  Copy,
  Check,
  Plus,
  Trash2,
  Download,
  Upload,
  Search,
  ArrowLeft,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatPrice, BRAND } from "@/lib/catalog";

// ============================================================================
// Local storage-backed admin dashboard.
// No backend required — orders are stored in your browser.
// Use "Export" regularly to back up to a file.
// ============================================================================

type OrderStatus = "new" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

interface OrderItem {
  name: string;
  variant: string;
  price: number;
  qty: number;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface LocalOrder {
  id: string;
  createdAt: string; // ISO
  source: "instagram" | "whatsapp" | "email" | "website" | "other";
  customerName: string;
  email: string;
  phone: string;
  address: Address;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  notes: string;
  paymentLink: string;
}

const STORAGE_KEY = "jbh.orders.v1";
const AUTH_KEY = "jbh.admin.auth.v1";
// Set your admin password via the JBH_ADMIN_PASSWORD environment variable
// in Cloudflare Pages → Settings → Environment variables.
// Never hardcode the password in this file — the source is public on GitHub.
const ADMIN_PASSWORD = (import.meta as any).env?.VITE_ADMIN_PASSWORD ?? "";

function loadOrders(): LocalOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalOrder[];
  } catch {
    return [];
  }
}

function saveOrders(orders: LocalOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function newOrderId(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `JBH-${stamp}${rand}`;
}

function statusColor(status: OrderStatus) {
  switch (status) {
    case "new":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "paid":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "processing":
      return "bg-blue-100 text-blue-900 border-blue-300";
    case "shipped":
      return "bg-purple-100 text-purple-900 border-purple-300";
    case "delivered":
      return "bg-emerald-200 text-emerald-900 border-emerald-400";
    case "cancelled":
      return "bg-red-100 text-red-900 border-red-300";
    default:
      return "bg-gray-100 text-gray-900 border-gray-300";
  }
}

const STATUS_ORDER: OrderStatus[] = ["new", "paid", "processing", "shipped", "delivered", "cancelled"];

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 mr-1" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3 mr-1" /> {label}
        </>
      )}
    </Button>
  );
}

function MissingOrderState({ onBack }: { onBack: () => void }) {
  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-20" data-testid="missing-order-state">
        <div className="rounded-lg border border-card-border bg-card p-8 text-center">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="font-display text-2xl text-foreground mb-2">Order unavailable</h1>
          <p className="text-sm text-muted-foreground mb-5">
            This order is no longer available. It may have been deleted or replaced since this view was opened.
          </p>
          <Button onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to orders
          </Button>
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------
function LoginScreen({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-20">
        <div className="rounded-lg border border-card-border bg-card p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/30">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-2xl text-center text-foreground mb-2">
            Admin Dashboard
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-6">
            {BRAND.name}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pw === ADMIN_PASSWORD) {
                sessionStorage.setItem(AUTH_KEY, "1");
                onAuth();
              } else {
                setErr(true);
              }
            }}
          >
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setErr(false);
              }}
              className="mt-1.5"
              autoFocus
            />
            {err && (
              <p className="text-sm text-red-600 mt-2">Incorrect password.</p>
            )}
            <Button type="submit" className="w-full mt-4">
              Unlock
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// New / Edit Order form
// ---------------------------------------------------------------------------
function OrderForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: LocalOrder;
  onSave: (o: LocalOrder) => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [source, setSource] = useState<LocalOrder["source"]>(initial?.source ?? "instagram");
  const [name, setName] = useState(initial?.customerName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [street, setStreet] = useState(initial?.address.street ?? "");
  const [city, setCity] = useState(initial?.address.city ?? "");
  const [state, setState] = useState(initial?.address.state ?? "");
  const [zip, setZip] = useState(initial?.address.zip ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [paymentLink, setPaymentLink] = useState(initial?.paymentLink ?? "");
  const [shipping, setShipping] = useState(initial?.shipping ?? 9.99);
  const [items, setItems] = useState<OrderItem[]>(
    initial?.items ?? [{ name: "", variant: "", price: 0, qty: 1 }],
  );

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + shipping;

  const updateItem = (idx: number, patch: Partial<OrderItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanItems = items.filter((i) => i.name.trim());
    if (cleanItems.length === 0 || !name.trim()) {
      return;
    }
    const order: LocalOrder = {
      id: initial?.id ?? newOrderId(),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      source,
      customerName: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: { street: street.trim(), city: city.trim(), state: state.trim(), zip: zip.trim() },
      items: cleanItems,
      subtotal,
      shipping,
      total,
      status: initial?.status ?? "new",
      notes: notes.trim(),
      paymentLink: paymentLink.trim(),
    };
    onSave(order);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Button variant="ghost" size="sm" onClick={onCancel} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="font-display text-3xl text-foreground mb-6">
          {isEdit ? "Edit Order" : "Log New Order"}
        </h1>

        <form onSubmit={submit} className="space-y-6">
          {/* Source */}
          <section className="rounded-lg border border-card-border bg-card p-5">
            <Label className="mb-2 block">Order came in from</Label>
            <div className="flex flex-wrap gap-2">
              {(["instagram", "whatsapp", "email", "website", "other"] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSource(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </section>

          {/* Customer */}
          <section className="rounded-lg border border-card-border bg-card p-5 space-y-3">
            <h2 className="font-display text-lg">Customer</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cn">Name *</Label>
                <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="ce">Email</Label>
                <Input id="ce" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="cp">Phone / IG handle</Label>
                <Input id="cp" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5" placeholder="@handle or 555-1234" />
              </div>
            </div>
          </section>

          {/* Address */}
          <section className="rounded-lg border border-card-border bg-card p-5 space-y-3">
            <h2 className="font-display text-lg">Ship to</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="st">Street</Label>
                <Input id="st" value={street} onChange={(e) => setStreet(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="ct">City</Label>
                <Input id="ct" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="stt">State</Label>
                  <Input id="stt" value={state} onChange={(e) => setState(e.target.value)} className="mt-1.5" maxLength={2} />
                </div>
                <div>
                  <Label htmlFor="zp">Zip</Label>
                  <Input id="zp" value={zip} onChange={(e) => setZip(e.target.value)} className="mt-1.5" />
                </div>
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="rounded-lg border border-card-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Items</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setItems((p) => [...p, { name: "", variant: "", price: 0, qty: 1 }])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add item
              </Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5">
                  <Label className="text-xs">Product</Label>
                  <Input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} className="mt-1" placeholder="e.g. Edge Control" />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <Label className="text-xs">Variant</Label>
                  <Input value={it.variant} onChange={(e) => updateItem(i, { variant: e.target.value })} className="mt-1" placeholder="size/color" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Label className="text-xs">Price</Label>
                  <Input type="number" step="0.01" value={it.price} onChange={(e) => updateItem(i, { price: parseFloat(e.target.value) || 0 })} className="mt-1" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" min="1" value={it.qty} onChange={(e) => updateItem(i, { qty: parseInt(e.target.value) || 1 })} className="mt-1" />
                </div>
                <div className="col-span-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} disabled={items.length === 1}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="border-t pt-3 mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Shipping</span>
                <Input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(parseFloat(e.target.value) || 0)} className="w-24 h-8" />
              </div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
          </section>

          {/* Payment & notes */}
          <section className="rounded-lg border border-card-border bg-card p-5 space-y-3">
            <div>
              <Label htmlFor="pl">Stripe payment link (paste once created)</Label>
              <Input id="pl" value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} className="mt-1.5" placeholder="https://buy.stripe.com/..." />
            </div>
            <div>
              <Label htmlFor="nt">Notes</Label>
              <Textarea id="nt" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" placeholder="Anything to remember" />
            </div>
          </section>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1">
              {isEdit ? "Save changes" : "Save order"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Order detail
// ---------------------------------------------------------------------------
function OrderDetail({
  order,
  onUpdate,
  onDelete,
  onBack,
  onEdit,
}: {
  order: LocalOrder;
  onUpdate: (o: LocalOrder) => void;
  onDelete: () => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const placedAt = new Date(order.createdAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const dropshipBlock = `=== DROPSHIP / VENDOR ORDER ===
Customer ship-to:
  ${order.customerName}
  ${order.address.street}
  ${order.address.city}, ${order.address.state} ${order.address.zip}
  Phone: ${order.phone || "(none)"}

Items:
${order.items.map((i) => `  - ${i.qty}x ${i.name}${i.variant ? ` — ${i.variant}` : ""}`).join("\n")}

Customer email for tracking: ${order.email || "(none)"}`;

  const paymentMessage = `Hi ${order.customerName.split(" ")[0]}! Here's your secure payment link for order ${order.id} (${formatPrice(order.total)}):

${order.paymentLink || "[paste Stripe link here]"}

Thank you for shopping with Juss Beautiful Hair 💜`;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> All orders
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="font-display text-2xl text-foreground">{order.id}</h1>
            <p className="text-sm text-muted-foreground">{placedAt} · via {order.source}</p>
          </div>
          <Badge className={`${statusColor(order.status)} border`}>{order.status}</Badge>
        </div>

        {/* Status buttons */}
        <div className="flex flex-wrap gap-2 mt-4 mb-6">
          {STATUS_ORDER.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={order.status === s ? "default" : "outline"}
              onClick={() => {
                onUpdate({ ...order, status: s });
                toast({ title: `Marked as ${s}` });
              }}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
        </div>

        {/* Customer + address */}
        <section className="rounded-lg border border-card-border bg-card p-5 mb-4">
          <h2 className="font-display text-lg mb-3">Customer</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /> {order.customerName}</div>
            {order.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> <a className="underline" href={`mailto:${order.email}`}>{order.email}</a></div>}
            {order.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {order.phone}</div>}
            {(order.address.street || order.address.city) && (
              <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  {order.address.street}<br />
                  {order.address.city}, {order.address.state} {order.address.zip}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Items */}
        <section className="rounded-lg border border-card-border bg-card p-5 mb-4">
          <h2 className="font-display text-lg mb-3">Items</h2>
          <ul className="space-y-2 text-sm">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between">
                <span>{it.qty}× {it.name}{it.variant ? ` (${it.variant})` : ""}</span>
                <span>{formatPrice(it.price * it.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{formatPrice(order.shipping)}</span></div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatPrice(order.total)}</span></div>
          </div>
        </section>

        {/* Payment link */}
        <section className="rounded-lg border border-card-border bg-card p-5 mb-4">
          <h2 className="font-display text-lg mb-3">Payment</h2>
          {order.paymentLink ? (
            <div className="space-y-3">
              <div className="rounded bg-secondary/20 px-3 py-2 text-sm break-all">{order.paymentLink}</div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={order.paymentLink} label="Copy link" />
                <CopyButton text={paymentMessage} label="Copy DM template" />
                <a href={order.paymentLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm underline ml-1">Open link →</a>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Stripe payment link added yet. When Stripe approves your account, create a Payment Link in your Stripe dashboard for {formatPrice(order.total)} and paste it here using "Edit order."
            </p>
          )}
        </section>

        {/* Vendor handoff */}
        <section className="rounded-lg border border-card-border bg-card p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg">Vendor handoff block</h2>
            <CopyButton text={dropshipBlock} />
          </div>
          <pre className="text-xs bg-secondary/10 rounded p-3 overflow-auto whitespace-pre-wrap">{dropshipBlock}</pre>
        </section>

        {/* Notes */}
        {order.notes && (
          <section className="rounded-lg border border-card-border bg-card p-5 mb-4">
            <h2 className="font-display text-lg mb-2">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </section>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onEdit}>Edit order</Button>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={() => {
              if (confirm("Delete this order? This cannot be undone.")) {
                onDelete();
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Main admin dashboard
// ---------------------------------------------------------------------------
export default function Admin() {
  const { toast } = useToast();
  const [authed, setAuthed] = useState<boolean>(false);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [view, setView] = useState<{ mode: "list" } | { mode: "new" } | { mode: "detail"; id: string } | { mode: "edit"; id: string }>({ mode: "list" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === "1") setAuthed(true);
    setOrders(loadOrders());
  }, []);

  const persist = (next: LocalOrder[]) => {
    setOrders(next);
    saveOrders(next);
  };

  const stats = useMemo(() => {
    const totalRevenue = orders
      .filter((o) => o.status === "paid" || o.status === "processing" || o.status === "shipped" || o.status === "delivered")
      .reduce((s, o) => s + o.total, 0);
    return {
      total: orders.length,
      newCount: orders.filter((o) => o.status === "new").length,
      paidCount: orders.filter((o) => o.status === "paid" || o.status === "processing").length,
      shippedCount: orders.filter((o) => o.status === "shipped").length,
      revenue: totalRevenue,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders
      .filter((o) => statusFilter === "all" || o.status === statusFilter)
      .filter((o) => {
        if (!q) return true;
        return (
          o.id.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.email.toLowerCase().includes(q) ||
          o.phone.toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, search, statusFilter]);

  if (!authed) return <LoginScreen onAuth={() => setAuthed(true)} />;

  // New order form
  if (view.mode === "new") {
    return (
      <OrderForm
        onCancel={() => setView({ mode: "list" })}
        onSave={(o) => {
          persist([o, ...orders]);
          toast({ title: "Order saved", description: o.id });
          setView({ mode: "detail", id: o.id });
        }}
      />
    );
  }

  // Edit order form
  if (view.mode === "edit") {
    const target = orders.find((o) => o.id === view.id);
    if (!target) return <MissingOrderState onBack={() => setView({ mode: "list" })} />;
    return (
      <OrderForm
        initial={target}
        onCancel={() => setView({ mode: "detail", id: target.id })}
        onSave={(updated) => {
          persist(orders.map((o) => (o.id === updated.id ? updated : o)));
          toast({ title: "Saved" });
          setView({ mode: "detail", id: updated.id });
        }}
      />
    );
  }

  // Order detail
  if (view.mode === "detail") {
    const target = orders.find((o) => o.id === view.id);
    if (!target) return <MissingOrderState onBack={() => setView({ mode: "list" })} />;
    return (
      <OrderDetail
        order={target}
        onBack={() => setView({ mode: "list" })}
        onEdit={() => setView({ mode: "edit", id: target.id })}
        onUpdate={(updated) => persist(orders.map((o) => (o.id === updated.id ? updated : o)))}
        onDelete={() => {
          persist(orders.filter((o) => o.id !== target.id));
          toast({ title: "Order deleted" });
          setView({ mode: "list" });
        }}
      />
    );
  }

  // List view
  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-3xl text-foreground">Orders</h1>
            <p className="text-sm text-muted-foreground">Logged from DMs, WhatsApp, email & the website.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setView({ mode: "new" })}>
              <Plus className="h-4 w-4 mr-1" /> New order
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "All orders", value: stats.total },
            { label: "New", value: stats.newCount },
            { label: "Paid / Processing", value: stats.paidCount },
            { label: "Revenue", value: formatPrice(stats.revenue) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-card-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className="font-display text-2xl mt-1">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, item, or order #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", ...STATUS_ORDER] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-card-border bg-card/50 p-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-xl mb-2">
              {orders.length === 0 ? "No orders yet" : "No orders match"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {orders.length === 0
                ? "When a DM, WhatsApp, or email order comes in, click “New order” to log it."
                : "Try a different filter or search."}
            </p>
            {orders.length === 0 && (
              <Button onClick={() => setView({ mode: "new" })}>
                <Plus className="h-4 w-4 mr-1" /> Log first order
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => setView({ mode: "detail", id: o.id })}
                className="w-full text-left rounded-lg border border-card-border bg-card p-4 hover:bg-secondary/10 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-foreground">{o.customerName} <span className="text-muted-foreground font-normal text-sm">· {o.id}</span></div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(o.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} · {o.source} · {o.items.length} item{o.items.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatPrice(o.total)}</span>
                    <Badge className={`${statusColor(o.status)} border capitalize`}>{o.status}</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Export / Import */}
        <div className="mt-10 pt-6 border-t flex flex-wrap gap-2 justify-between items-center">
          <div className="text-xs text-muted-foreground">
            Orders stored locally in this browser. Export regularly to back up.
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(orders, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `jbh-orders-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            <label className="inline-flex items-center gap-1 text-sm rounded-md border border-input bg-background px-3 py-1.5 cursor-pointer hover:bg-secondary/20">
              <Upload className="h-3 w-3" /> Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const data = JSON.parse(reader.result as string) as LocalOrder[];
                      if (!Array.isArray(data)) throw new Error("bad");
                      persist(data);
                      toast({ title: "Imported", description: `${data.length} orders` });
                    } catch {
                      toast({ title: "Import failed", description: "Not a valid orders file.", variant: "destructive" });
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                sessionStorage.removeItem(AUTH_KEY);
                setAuthed(false);
              }}
            >
              Lock
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
