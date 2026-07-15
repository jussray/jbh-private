import { useState } from "react";
import { Edit3, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/catalog";
import { emptyRoute, emptyVendor, isRouteStale, vendorScore, type OwnerVault, type ProductRoute, type Vendor, type VendorOrderMethod } from "@/lib/private-admin-vault";

const ORDER_METHODS: VendorOrderMethod[] = ["portal", "email", "whatsapp", "wechat", "phone", "other"];

export function VendorManager({ vault, commit }: { vault: OwnerVault; commit: (next: OwnerVault) => void }) {
  const { toast } = useToast();
  const [vendorDraft, setVendorDraft] = useState<Vendor>(emptyVendor());
  const [routeDraft, setRouteDraft] = useState<ProductRoute>(emptyRoute());

  const saveVendor = () => {
    if (!vendorDraft.name.trim()) return;
    const vendor = { ...vendorDraft, name: vendorDraft.name.trim(), updatedAt: new Date().toISOString() };
    const exists = vault.vendors.some((candidate) => candidate.id === vendor.id);
    commit({ ...vault, vendors: exists ? vault.vendors.map((candidate) => candidate.id === vendor.id ? vendor : candidate) : [...vault.vendors, vendor] });
    setVendorDraft(emptyVendor());
    toast({ title: exists ? "Vendor updated" : "Vendor added" });
  };

  const saveRoute = () => {
    if (!routeDraft.productPattern.trim() || !routeDraft.vendorId) return;
    const exists = vault.routes.some((candidate) => candidate.id === routeDraft.id);
    const route = { ...routeDraft, productPattern: routeDraft.productPattern.trim() };
    commit({ ...vault, routes: exists ? vault.routes.map((candidate) => candidate.id === route.id ? route : candidate) : [...vault.routes, route] });
    setRouteDraft(emptyRoute());
    toast({ title: exists ? "Route updated" : "Route added" });
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-2xl">Approved vendors</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use private labels here. Keep proprietary contacts and documents in the private vault only.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><Label>Private vendor label *</Label><Input className="mt-1" value={vendorDraft.name} onChange={(event) => setVendorDraft({ ...vendorDraft, name: event.target.value })} /></div>
            <div><Label>Ordering method</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={vendorDraft.orderMethod} onChange={(event) => setVendorDraft({ ...vendorDraft, orderMethod: event.target.value as VendorOrderMethod })}>{ORDER_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
            <div className="sm:col-span-2"><Label>Private order destination / reference</Label><Input className="mt-1" value={vendorDraft.orderDestination} onChange={(event) => setVendorDraft({ ...vendorDraft, orderDestination: event.target.value })} /></div>
            <div><Label>Lead days</Label><Input className="mt-1" type="number" min="0" value={vendorDraft.defaultLeadDays} onChange={(event) => setVendorDraft({ ...vendorDraft, defaultLeadDays: Number(event.target.value) || 0 })} /></div>
            <div><Label>Estimated vendor shipping</Label><Input className="mt-1" type="number" min="0" step="0.01" value={vendorDraft.defaultShippingCost} onChange={(event) => setVendorDraft({ ...vendorDraft, defaultShippingCost: Number(event.target.value) || 0 })} /></div>
            {(["qualityScore", "reliabilityScore", "communicationScore"] as const).map((key) => <div key={key}><Label>{key.replace("Score", " score")}</Label><Input className="mt-1" type="number" min="1" max="5" value={vendorDraft[key]} onChange={(event) => setVendorDraft({ ...vendorDraft, [key]: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })} /></div>)}
            <div className="flex items-end gap-4 pb-2"><label className="text-sm"><input className="mr-2" type="checkbox" checked={vendorDraft.needsPhone} onChange={(event) => setVendorDraft({ ...vendorDraft, needsPhone: event.target.checked })} />Needs phone</label><label className="text-sm"><input className="mr-2" type="checkbox" checked={vendorDraft.needsEmail} onChange={(event) => setVendorDraft({ ...vendorDraft, needsEmail: event.target.checked })} />Needs email</label></div>
            <div className="sm:col-span-2"><Label>Private notes</Label><Textarea className="mt-1" value={vendorDraft.notes} onChange={(event) => setVendorDraft({ ...vendorDraft, notes: event.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={saveVendor}><Save className="mr-1 h-4 w-4" /> Save vendor</Button><Button variant="outline" onClick={() => setVendorDraft(emptyVendor())}>Clear</Button></div>
          <div className="mt-6 space-y-2">
            {vault.vendors.map((vendor) => (
              <div key={vendor.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{vendor.name}</div><div className="text-xs text-muted-foreground">{vendor.orderMethod} · {vendor.defaultLeadDays} days · score {vendorScore(vendor).toFixed(1)}/5</div></div><Badge variant={vendor.active ? "default" : "outline"}>{vendor.active ? "active" : "paused"}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setVendorDraft(vendor)}><Edit3 className="mr-1 h-3 w-3" /> Edit</Button><Button size="sm" variant="outline" onClick={() => commit({ ...vault, vendors: vault.vendors.map((candidate) => candidate.id === vendor.id ? { ...candidate, active: !candidate.active } : candidate) })}>{vendor.active ? "Pause" : "Activate"}</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (vault.routes.some((route) => route.vendorId === vendor.id) || vault.orders.some((order) => order.items.some((item) => item.assignedVendorId === vendor.id))) { toast({ title: "Vendor is in use", description: "Pause it instead of deleting it.", variant: "destructive" }); return; } commit({ ...vault, vendors: vault.vendors.filter((candidate) => candidate.id !== vendor.id) }); }}><Trash2 className="mr-1 h-3 w-3" /> Delete</Button></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-2xl">Product routing</h2>
          <p className="mt-1 text-sm text-muted-foreground">Highest priority active match wins. More-specific matches break ties.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><Label>Product contains *</Label><Input className="mt-1" value={routeDraft.productPattern} onChange={(event) => setRouteDraft({ ...routeDraft, productPattern: event.target.value })} /></div>
            <div><Label>Variant contains</Label><Input className="mt-1" value={routeDraft.variantPattern} onChange={(event) => setRouteDraft({ ...routeDraft, variantPattern: event.target.value })} /></div>
            <div><Label>Vendor *</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={routeDraft.vendorId} onChange={(event) => setRouteDraft({ ...routeDraft, vendorId: event.target.value })}><option value="">Select vendor</option>{vault.vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></div>
            <div><Label>Vendor SKU</Label><Input className="mt-1" value={routeDraft.vendorSku} onChange={(event) => setRouteDraft({ ...routeDraft, vendorSku: event.target.value })} /></div>
            <div><Label>Unit cost</Label><Input className="mt-1" type="number" min="0" step="0.01" value={routeDraft.unitCost} onChange={(event) => setRouteDraft({ ...routeDraft, unitCost: Number(event.target.value) || 0 })} /></div>
            <div><Label>Priority 0–100</Label><Input className="mt-1" type="number" min="0" max="100" value={routeDraft.priority} onChange={(event) => setRouteDraft({ ...routeDraft, priority: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /></div>
            <div><Label>Last verified</Label><Input className="mt-1" type="date" value={routeDraft.lastVerifiedAt} onChange={(event) => setRouteDraft({ ...routeDraft, lastVerifiedAt: event.target.value })} /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={saveRoute}><Save className="mr-1 h-4 w-4" /> Save route</Button><Button variant="outline" onClick={() => setRouteDraft(emptyRoute())}>Clear</Button></div>
          <div className="mt-6 space-y-2">
            {vault.routes.map((route) => {
              const vendor = vault.vendors.find((candidate) => candidate.id === route.vendorId);
              return <div key={route.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{route.productPattern}{route.variantPattern ? ` · ${route.variantPattern}` : ""}</div><div className="text-xs text-muted-foreground">{vendor?.name ?? "Missing vendor"} · priority {route.priority} · {formatPrice(route.unitCost)}</div></div>{isRouteStale(route) ? <Badge className="border-amber-300 bg-amber-100 text-amber-900">verify</Badge> : <Badge variant="outline">current</Badge>}</div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setRouteDraft(route)}><Edit3 className="mr-1 h-3 w-3" /> Edit</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => commit({ ...vault, routes: vault.routes.filter((candidate) => candidate.id !== route.id) })}><Trash2 className="mr-1 h-3 w-3" /> Delete</Button></div></div>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
