import { ArrowLeft, Edit3, Trash2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/catalog";
import { buildVendorHandoff, estimatedVendorCost, groupOrderByVendor, routeOrder, type LocalOrder, type OwnerVault, type VendorOrderStatus } from "@/lib/private-admin-vault";
import { CopyButton, getRoutingDecision, statusClass } from "./shared";

const ORDER_STATUSES = ["new", "paid", "processing", "shipped", "delivered", "cancelled"] as const;
const VENDOR_STATUSES: VendorOrderStatus[] = ["ready", "ordered", "confirmed", "shipped"];

export function OrderDetail({ order, vault, commit, onBack, onEdit }: { order: LocalOrder; vault: OwnerVault; commit: (next: OwnerVault) => void; onBack: () => void; onEdit: () => void }) {
  const { toast } = useToast();
  const groups = groupOrderByVendor(order, vault.vendors);
  const vendorCost = estimatedVendorCost(order, vault.vendors);
  const margin = order.total - vendorCost;

  const updateOrder = (next: LocalOrder) => commit({ ...vault, orders: vault.orders.map((candidate) => candidate.id === next.id ? next : candidate) });
  const assignVendor = (itemId: string, vendorId: string) => {
    const items = order.items.map((item) => item.id === itemId ? { ...item, assignedVendorId: vendorId, routeId: "", vendorStatus: vendorId ? "ready" as const : "unassigned" as const } : item);
    updateOrder(routeOrder({ ...order, items }, vault.routes, vault.vendors));
  };

  return (
    <Layout>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> Orders</Button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-display text-3xl">{order.id}</h1><p className="text-sm text-muted-foreground">{order.customerName} · {new Date(order.createdAt).toLocaleString()}</p></div><Badge className={`${statusClass(order.status)} border`}>{order.status}</Badge></div>
        <div className="mt-4 flex flex-wrap gap-2">{ORDER_STATUSES.map((status) => <Button key={status} size="sm" variant={order.status === status ? "default" : "outline"} onClick={() => updateOrder({ ...order, status })}>{status}</Button>)}</div>

        <section className="mt-5 rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl">Fulfillment decision</h2><p className="mt-1 text-sm font-medium">{getRoutingDecision(order, vault.vendors)}</p></div><Button variant="outline" onClick={() => updateOrder(routeOrder({ ...order, items: order.items.map((item) => ({ ...item, assignedVendorId: "", routeId: "", vendorStatus: "unassigned" })) }, vault.routes, vault.vendors))}>Re-run routes</Button></div>
          <div className="mt-4 space-y-2">{order.items.map((item) => <div key={item.id} className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[1fr_240px]"><div><div className="font-medium">{item.qty}× {item.name}{item.variant ? ` · ${item.variant}` : ""}</div><div className="text-xs text-muted-foreground">{item.vendorSku ? `Vendor SKU ${item.vendorSku} · ` : ""}cost {formatPrice(item.vendorUnitCost)} each</div></div><select className="h-10 rounded-md border bg-background px-3" value={item.assignedVendorId} onChange={(event) => assignVendor(item.id, event.target.value)}><option value="">Vendor needed</option>{vault.vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></div>)}</div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className="rounded-lg border bg-card p-5 lg:col-span-2"><h2 className="font-display text-xl">Customer and order</h2><div className="mt-3 space-y-1 text-sm"><p>{order.customerName}</p><p>{order.address.street}</p><p>{order.address.city}, {order.address.state} {order.address.zip}</p>{order.email && <p>{order.email}</p>}{order.phone && <p>{order.phone}</p>}</div><div className="mt-4 border-t pt-3 text-sm"><div className="flex justify-between"><span>Order total</span><strong>{formatPrice(order.total)}</strong></div><div className="flex justify-between"><span>Estimated vendor cost</span><span>{formatPrice(vendorCost)}</span></div><div className="flex justify-between"><span>Estimated gross margin</span><strong>{formatPrice(margin)}</strong></div></div>{order.paymentLink && <div className="mt-4"><CopyButton text={order.paymentLink} label="Copy Stripe link" /></div>}{order.notes && <p className="mt-4 whitespace-pre-wrap rounded bg-secondary/20 p-3 text-sm">{order.notes}</p>}</section>
          <section className="rounded-lg border bg-card p-5"><h2 className="font-display text-xl">Actions</h2><div className="mt-3 space-y-2"><Button className="w-full" variant="outline" onClick={onEdit}><Edit3 className="mr-1 h-4 w-4" /> Edit order</Button><Button className="w-full text-red-600" variant="outline" onClick={() => { if (confirm("Delete this order from the local owner vault?")) { commit({ ...vault, orders: vault.orders.filter((candidate) => candidate.id !== order.id) }); onBack(); toast({ title: "Order deleted" }); } }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button></div></section>
        </div>

        <section className="mt-5 space-y-4">
          <div><h2 className="font-display text-2xl">Vendor handoffs</h2><p className="mt-1 text-sm text-muted-foreground">Customer totals, payment links, internal notes, margins, and other vendors are excluded. Phone and email appear only when that assigned vendor requires them.</p></div>
          {groups.map((group) => group.vendor ? (
            <article key={group.key} className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-xl">Order from {group.vendor.name}</h3><p className="text-xs text-muted-foreground">{group.vendor.orderMethod} · estimated {group.vendor.defaultLeadDays} days</p></div><CopyButton text={buildVendorHandoff(order, group.vendor, group.items)} label="Copy minimum handoff" /></div>
              <pre className="mt-4 whitespace-pre-wrap rounded bg-secondary/10 p-3 text-xs">{buildVendorHandoff(order, group.vendor, group.items)}</pre>
              <div className="mt-3 flex flex-wrap gap-2">{VENDOR_STATUSES.map((status) => <Button key={status} size="sm" variant={group.items.every((item) => item.vendorStatus === status) ? "default" : "outline"} onClick={() => updateOrder({ ...order, items: order.items.map((item) => group.items.some((groupItem) => groupItem.id === item.id) ? { ...item, vendorStatus: status } : item) })}>{status}</Button>)}</div>
            </article>
          ) : <article key={group.key} className="rounded-lg border border-red-300 bg-red-50 p-5 text-red-950"><h3 className="font-display text-xl">Vendor needed</h3><p className="mt-1 text-sm">Assign a vendor before placing this portion of the order.</p></article>)}
        </section>
      </main>
    </Layout>
  );
}
