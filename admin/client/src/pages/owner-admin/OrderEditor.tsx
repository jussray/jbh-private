import { useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emptyOrderItem, routeOrder, suggestRoute, type LocalOrder, type OrderItem, type OrderSource, type ProductRoute, type Vendor } from "@/lib/private-admin-vault";

export function OrderEditor({
  initial,
  vendors,
  routes,
  onCancel,
  onSave,
}: {
  initial: LocalOrder;
  vendors: Vendor[];
  routes: ProductRoute[];
  onCancel: () => void;
  onSave: (order: LocalOrder) => void;
}) {
  const [draft, setDraft] = useState<LocalOrder>(initial);
  const activeVendors = vendors.filter((vendor) => vendor.active);

  const updateItem = (index: number, patch: Partial<OrderItem>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const save = () => {
    const items = draft.items.filter((item) => item.name.trim());
    if (!draft.customerName.trim() || items.length === 0) return;
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const normalized: LocalOrder = {
      ...draft,
      customerName: draft.customerName.trim(),
      items,
      subtotal,
      total: subtotal + draft.shipping,
    };
    onSave(routeOrder(normalized, routes, vendors));
  };

  return (
    <Layout>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <h1 className="mt-3 font-display text-3xl">{initial.customerName ? "Edit order" : "Log order"}</h1>
        <div className="mt-6 space-y-5">
          <section className="grid gap-3 rounded-lg border bg-card p-5 sm:grid-cols-2">
            <div><Label>Customer name *</Label><Input className="mt-1" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} /></div>
            <div><Label>Source</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as OrderSource })}>{(["website", "instagram", "whatsapp", "email", "other"] as OrderSource[]).map((source) => <option key={source}>{source}</option>)}</select></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></div>
            <div><Label>Phone</Label><Input className="mt-1" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Street</Label><Input className="mt-1" value={draft.address.street} onChange={(event) => setDraft({ ...draft, address: { ...draft.address, street: event.target.value } })} /></div>
            <div><Label>City</Label><Input className="mt-1" value={draft.address.city} onChange={(event) => setDraft({ ...draft, address: { ...draft.address, city: event.target.value } })} /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>State</Label><Input className="mt-1" value={draft.address.state} onChange={(event) => setDraft({ ...draft, address: { ...draft.address, state: event.target.value } })} /></div><div><Label>ZIP</Label><Input className="mt-1" value={draft.address.zip} onChange={(event) => setDraft({ ...draft, address: { ...draft.address, zip: event.target.value } })} /></div></div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-display text-xl">Items and vendor route</h2><Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, items: [...draft.items, emptyOrderItem()] })}><Plus className="mr-1 h-3 w-3" /> Item</Button></div>
            <div className="mt-4 space-y-4">
              {draft.items.map((item, index) => {
                const suggestion = suggestRoute(item, routes, vendors);
                return (
                  <div key={item.id} className="rounded-lg border p-4">
                    <div className="grid gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-4"><Label>Product *</Label><Input className="mt-1" value={item.name} onChange={(event) => updateItem(index, { name: event.target.value, assignedVendorId: "", routeId: "", vendorStatus: "unassigned" })} /></div>
                      <div className="sm:col-span-3"><Label>Variant</Label><Input className="mt-1" value={item.variant} onChange={(event) => updateItem(index, { variant: event.target.value, assignedVendorId: "", routeId: "", vendorStatus: "unassigned" })} /></div>
                      <div className="sm:col-span-2"><Label>Sale price</Label><Input className="mt-1" type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(index, { price: Number(event.target.value) || 0 })} /></div>
                      <div className="sm:col-span-1"><Label>Qty</Label><Input className="mt-1" type="number" min="1" value={item.qty} onChange={(event) => updateItem(index, { qty: Math.max(1, Number(event.target.value) || 1) })} /></div>
                      <div className="flex items-end sm:col-span-2"><Button className="w-full" variant="ghost" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })} disabled={draft.items.length === 1}><Trash2 className="mr-1 h-4 w-4" /> Remove</Button></div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div><Label>Vendor override</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={item.assignedVendorId} onChange={(event) => updateItem(index, { assignedVendorId: event.target.value, routeId: "", vendorStatus: event.target.value ? "ready" : "unassigned" })}><option value="">Auto-route</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></div>
                      <div className="rounded-md bg-secondary/20 p-3 text-sm">
                        {item.assignedVendorId ? "Manual vendor selected." : suggestion ? `Suggested: ${suggestion.vendor.name}${suggestion.route.vendorSku ? ` · SKU ${suggestion.route.vendorSku}` : ""}` : <span className="font-medium text-red-700">No active route matches this product. Add a rule or choose a vendor.</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border bg-card p-5 sm:grid-cols-2">
            <div><Label>Shipping charged</Label><Input className="mt-1" type="number" min="0" step="0.01" value={draft.shipping} onChange={(event) => setDraft({ ...draft, shipping: Number(event.target.value) || 0 })} /></div>
            <div><Label>Stripe payment link</Label><Input className="mt-1" value={draft.paymentLink} onChange={(event) => setDraft({ ...draft, paymentLink: event.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Private notes</Label><Textarea className="mt-1" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
          </section>
          <div className="flex gap-2"><Button className="flex-1" onClick={save}><Save className="mr-1 h-4 w-4" /> Save and route</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
        </div>
      </main>
    </Layout>
  );
}
