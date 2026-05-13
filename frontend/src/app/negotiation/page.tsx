"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  GitBranch,
  Home,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type SettingsForm = {
  enabled: boolean;
  auto_finalize: boolean;
  min_price: string;
  max_price: string;
  target_price: string;
  max_offer: string;
  min_bedrooms: string;
  min_bathrooms: string;
  property_type: string;
  area_terms: string;
  must_have_features: string;
  tone: string;
  max_active_workflows: string;
};

const emptySettings: SettingsForm = {
  enabled: false,
  auto_finalize: false,
  min_price: "",
  max_price: "",
  target_price: "",
  max_offer: "",
  min_bedrooms: "",
  min_bathrooms: "",
  property_type: "All",
  area_terms: "",
  must_have_features: "",
  tone: "warm",
  max_active_workflows: "8",
};

const statusStyles: Record<string, string> = {
  waiting_for_seller: "bg-amber-50 text-amber-700 border-amber-200",
  awaiting_buyer_approval: "bg-blue-50 text-blue-700 border-blue-200",
  needs_buyer_input: "bg-orange-50 text-orange-700 border-orange-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  finalized: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const stageOrder = ["outreach_sent", "counter_sent", "buyer_review", "deal_approved", "deal_finalized"];

function money(value?: number | null) {
  if (!value) return "-";
  return `$${Math.round(value).toLocaleString()}`;
}

function splitCSV(value: string) {
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function settingsToForm(settings: any): SettingsForm {
  return {
    enabled: Boolean(settings.enabled),
    auto_finalize: Boolean(settings.auto_finalize),
    min_price: settings.min_price ? String(Math.round(settings.min_price)) : "",
    max_price: settings.max_price ? String(Math.round(settings.max_price)) : "",
    target_price: settings.target_price ? String(Math.round(settings.target_price)) : "",
    max_offer: settings.max_offer ? String(Math.round(settings.max_offer)) : "",
    min_bedrooms: settings.min_bedrooms != null ? String(settings.min_bedrooms) : "",
    min_bathrooms: settings.min_bathrooms != null ? String(settings.min_bathrooms) : "",
    property_type: settings.property_type || "All",
    area_terms: Array.isArray(settings.area_terms) ? settings.area_terms.join(", ") : "",
    must_have_features: Array.isArray(settings.must_have_features) ? settings.must_have_features.join(", ") : "",
    tone: settings.tone || "warm",
    max_active_workflows: settings.max_active_workflows ? String(settings.max_active_workflows) : "8",
  };
}

function formToPayload(form: SettingsForm) {
  const numberOrNull = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
  };

  return {
    enabled: form.enabled,
    auto_finalize: form.auto_finalize,
    min_price: numberOrNull(form.min_price),
    max_price: numberOrNull(form.max_price),
    target_price: numberOrNull(form.target_price),
    max_offer: numberOrNull(form.max_offer),
    min_bedrooms: numberOrNull(form.min_bedrooms),
    min_bathrooms: numberOrNull(form.min_bathrooms),
    property_type: form.property_type === "All" ? null : form.property_type,
    area_terms: splitCSV(form.area_terms),
    must_have_features: splitCSV(form.must_have_features),
    tone: form.tone,
    max_active_workflows: Number(form.max_active_workflows) || 8,
  };
}

function friendlyStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default function NegotiationPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<SettingsForm>(emptySettings);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  const enabled = settings.enabled;

  const loadSettings = useCallback(async (userId: string) => {
    const res = await fetch(`${API_URL}/api/negotiation/settings/${userId}`);
    if (!res.ok) throw new Error("Failed to load settings");
    const data = await res.json();
    setSettings(settingsToForm(data));
  }, []);

  const loadWorkflows = useCallback(async (userId: string) => {
    const res = await fetch(`${API_URL}/api/negotiation/workflows?buyer_id=${userId}`);
    if (!res.ok) throw new Error("Failed to load workflows");
    const data = await res.json();
    setWorkflows(Array.isArray(data) ? data : []);
  }, []);

  const syncAgent = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/negotiation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_id: user.id }),
      });
      if (!res.ok) throw new Error("Failed to sync agent");
      const data = await res.json();
      setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
      if (!silent) {
        setNotice(`Synced: ${data.created_workflows || 0} new, ${data.advanced_workflows || 0} advanced.`);
      }
    } catch (err) {
      console.error(err);
      if (!silent) setNotice("Agent sync failed. Make sure the backend is running.");
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);
      try {
        await loadSettings(session.user.id);
        await loadWorkflows(session.user.id);
      } catch (err) {
        console.error(err);
        setNotice("Could not load negotiation data.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [loadSettings, loadWorkflows]);

  useEffect(() => {
    if (!user?.id || !enabled) return;
    const id = window.setInterval(() => {
      syncAgent(true);
    }, 30000);
    return () => window.clearInterval(id);
  }, [enabled, syncAgent, user?.id]);

  const saveSettings = async () => {
    if (!user?.id) return;
    setSaving(true);
    setNotice("");
    try {
      const res = await fetch(`${API_URL}/api/negotiation/settings/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(settings)),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      const data = await res.json();
      setSettings(settingsToForm(data));
      await syncAgent(true);
      setNotice("Negotiation settings saved.");
    } catch (err) {
      console.error(err);
      setNotice("Could not save negotiation settings.");
    } finally {
      setSaving(false);
    }
  };

  const approveWorkflow = async (workflowId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/negotiation/workflows/${workflowId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Approval failed");
      const updated = await res.json();
      setWorkflows(prev => prev.map(item => item.id === workflowId ? updated : item));
      setNotice("Deal approved.");
    } catch (err) {
      console.error(err);
      setNotice("Could not approve this workflow.");
    }
  };

  const activeCount = useMemo(() => workflows.filter(w => ["waiting_for_seller", "awaiting_buyer_approval", "needs_buyer_input"].includes(w.status)).length, [workflows]);

  return (
    <ProtectedRoute>
      <div className="flex flex-col xl:flex-row min-h-[calc(100vh-64px)] bg-gray-50">
        <aside className="w-full xl:w-96 bg-white border-r p-5 overflow-y-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-gray-900 text-white flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Negotiation Agent</h1>
              <p className="text-xs text-gray-500">{activeCount} active workflows</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 border rounded-lg p-3 cursor-pointer">
              <span className="text-sm font-semibold text-gray-800">Enabled</span>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                className="h-5 w-5 accent-black"
              />
            </label>

            <label className="flex items-center justify-between gap-4 border rounded-lg p-3 cursor-pointer">
              <span className="text-sm font-semibold text-gray-800">Agent can finalize</span>
              <input
                type="checkbox"
                checked={settings.auto_finalize}
                onChange={e => setSettings(prev => ({ ...prev, auto_finalize: e.target.checked }))}
                className="h-5 w-5 accent-black"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Min price" value={settings.min_price} onChange={value => setSettings(prev => ({ ...prev, min_price: value }))} />
              <Field label="Max price" value={settings.max_price} onChange={value => setSettings(prev => ({ ...prev, max_price: value }))} />
              <Field label="Target offer" value={settings.target_price} onChange={value => setSettings(prev => ({ ...prev, target_price: value }))} />
              <Field label="Max offer" value={settings.max_offer} onChange={value => setSettings(prev => ({ ...prev, max_offer: value }))} />
              <Field label="Min beds" value={settings.min_bedrooms} onChange={value => setSettings(prev => ({ ...prev, min_bedrooms: value }))} />
              <Field label="Min baths" value={settings.min_bathrooms} onChange={value => setSettings(prev => ({ ...prev, min_bathrooms: value }))} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Property type</label>
              <select
                value={settings.property_type}
                onChange={e => setSettings(prev => ({ ...prev, property_type: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg bg-white text-sm"
              >
                <option value="All">Any</option>
                <option value="House">House</option>
                <option value="Apartment">Apartment</option>
                <option value="Condo">Condo</option>
                <option value="Townhouse">Townhouse</option>
              </select>
            </div>

            <TextField label="Areas" value={settings.area_terms} placeholder="San Jose, Willow Glen" onChange={value => setSettings(prev => ({ ...prev, area_terms: value }))} />
            <TextField label="Must haves" value={settings.must_have_features} placeholder="modern, views, park" onChange={value => setSettings(prev => ({ ...prev, must_have_features: value }))} />
            <Field label="Max active workflows" value={settings.max_active_workflows} onChange={value => setSettings(prev => ({ ...prev, max_active_workflows: value }))} />

            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full py-3 rounded-lg bg-primary text-white font-bold hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {saving ? "Saving" : "Save Settings"}
            </button>
          </div>
        </aside>

        <section className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900">Workflow Tree</h2>
              <p className="text-sm text-gray-500 mt-1">{enabled ? "This console syncs every 30 seconds." : "Agent is paused."}</p>
            </div>
            <button
              onClick={() => syncAgent(false)}
              disabled={syncing || loading}
              className="px-4 py-2.5 bg-white border rounded-lg shadow-sm font-bold text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2 w-fit"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              Sync Now
            </button>
          </div>

          {notice && (
            <div className="mb-5 border bg-white px-4 py-3 rounded-lg text-sm text-gray-700">
              {notice}
            </div>
          )}

          <div className="bg-white border rounded-lg p-4 md:p-5 mb-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              <Bot className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-gray-900">Dwellera Negotiator</h3>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {enabled ? "enabled" : "paused"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{workflows.length} property branches started</p>
            </div>
            <GitBranch className="w-5 h-5 text-gray-400" />
          </div>

          <div className="ml-4 md:ml-6 border-l-2 border-gray-200 pl-4 md:pl-8 space-y-4">
            {loading ? (
              <div className="bg-white border rounded-lg p-8 text-center text-gray-500">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="bg-white border border-dashed rounded-lg p-8 text-center text-gray-500">
                No negotiation branches yet.
              </div>
            ) : (
              workflows.map(workflow => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  onOpenChat={() => router.push(`/messages?listing_id=${workflow.listing_id}&receiver_id=${workflow.seller_id}`)}
                  onApprove={() => approveWorkflow(workflow.id)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </ProtectedRoute>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm"
      />
    </div>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm"
      />
    </div>
  );
}

function WorkflowCard({ workflow, onOpenChat, onApprove }: { workflow: any; onOpenChat: () => void; onApprove: () => void }) {
  const listing = workflow.listing || {};
  const statusClass = statusStyles[workflow.status] || "bg-gray-50 text-gray-700 border-gray-200";
  const activeStage = stageOrder.indexOf(workflow.current_stage);
  const isAwaitingApproval = workflow.status === "awaiting_buyer_approval";
  const isWaiting = workflow.status === "waiting_for_seller";

  return (
    <div className="relative bg-white border rounded-lg shadow-sm">
      <div className="absolute -left-[42px] md:-left-[58px] top-8 w-8 md:w-12 h-px bg-gray-200"></div>
      <div className="p-4 md:p-5">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-44 h-36 bg-gray-100 rounded-lg overflow-hidden shrink-0">
            {listing.image_urls?.[0] ? (
              <img src={listing.image_urls[0]} alt={listing.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <Home className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-900 line-clamp-1">{listing.title || `Property #${workflow.listing_id}`}</h3>
                <p className="text-sm text-gray-500 mt-1">{listing.property_type || "Property"} - {listing.bedrooms ?? "-"} beds - {listing.bathrooms ?? "-"} baths</p>
              </div>
              <div className="md:text-right">
                <p className="text-xl font-black text-blue-600">{money(listing.price)}</p>
                <span className={`inline-block mt-1 text-xs font-bold px-2 py-1 rounded-full border ${statusClass}`}>
                  {friendlyStatus(workflow.status)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              <Metric label="Initial" value={money(workflow.initial_offer)} />
              <Metric label="Current" value={money(workflow.current_offer)} />
              <Metric label="Seller" value={money(workflow.seller_counter)} />
              <Metric label="Final" value={money(workflow.final_offer)} />
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {stageOrder.map((stage, index) => {
                const reached = activeStage >= index || workflow.current_stage === stage || workflow.status === "approved";
                return (
                  <div key={stage} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${reached ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${reached ? "bg-white" : "bg-gray-300"}`}></span>
                    {stage.replaceAll("_", " ")}
                  </div>
                );
              })}
            </div>

            {workflow.last_agent_action && (
              <p className="text-sm text-gray-600 mt-4">{workflow.last_agent_action}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid lg:grid-cols-[1fr_auto] gap-3 items-start">
          <details className="border rounded-lg bg-gray-50">
            <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between text-sm font-bold text-gray-800">
              <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Chat preview</span>
              <ChevronDown className="w-4 h-4" />
            </summary>
            <div className="px-4 pb-4 space-y-2 max-h-56 overflow-y-auto">
              {workflow.messages?.length ? workflow.messages.map((message: any) => (
                <div key={message.id} className={`rounded-lg px-3 py-2 text-sm ${message.sender_id === workflow.buyer_id ? "bg-white border text-gray-800" : "bg-gray-900 text-white"}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="text-[10px] opacity-60 mt-1">{new Date(message.created_at).toLocaleString()}</p>
                </div>
              )) : (
                <p className="text-sm text-gray-500">No messages yet.</p>
              )}
            </div>
          </details>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
            <button
              onClick={onOpenChat}
              className="px-4 py-2.5 bg-white border rounded-lg font-bold text-sm hover:bg-gray-50 transition flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Open Chat
            </button>

            {isAwaitingApproval ? (
              <button
                onClick={onApprove}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve Deal
              </button>
            ) : (
              <div className="px-4 py-2.5 bg-gray-50 border rounded-lg text-sm font-bold text-gray-500 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                {isWaiting ? "Awaiting seller" : friendlyStatus(workflow.current_stage)}
              </div>
            )}
          </div>
        </div>

        <details className="mt-3 border rounded-lg">
          <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between text-sm font-bold text-gray-800">
            <span>Offer finalized</span>
            <ChevronDown className="w-4 h-4" />
          </summary>
          <div className="px-4 pb-4 text-sm text-gray-600 space-y-2">
            <p>Final offer: <span className="font-bold text-gray-900">{money(workflow.final_offer)}</span></p>
            <p>Approval mode: <span className="font-bold text-gray-900">{workflow.requires_buyer_approval ? "Needs your approval" : "Agent can finalize"}</span></p>
            {isAwaitingApproval && <p className="text-blue-700 font-semibold">Awaiting approval.</p>}
          </div>
        </details>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 border rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase font-bold text-gray-400">{label}</p>
      <p className="text-sm font-black text-gray-900">{value}</p>
    </div>
  );
}
