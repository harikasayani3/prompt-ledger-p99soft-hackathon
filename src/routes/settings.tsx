import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { clearLocalUser, getLocalUser, setLocalProfile } from "@/lib/api-key";
import { LogOut, Save, Server } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: () => <AppShell><SettingsPage /></AppShell> });

const MCP_SERVER_URL = "https://expense-remote-mcp-server.onrender.com/mcp";

function SettingsPage() {
  const nav = useNavigate();
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");

  useEffect(() => {
    const u = getLocalUser();
    setDraftName(u?.name ?? "");
    setDraftEmail(u?.email ?? "");
  }, []);

  const save = () => {
    setLocalProfile({ email: draftEmail.trim(), name: draftName.trim() || undefined });
    toast.success("Profile updated");
  };

  const signOut = () => {
    clearLocalUser();
    nav({ to: "/login" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and account.</p>
      </div>

      {/* Profile */}
      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="text-sm font-semibold">Profile</div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Display name</label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Your name"
            className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Email</label>
          <input
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={save}
          className="h-10 px-4 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-2 text-sm hover:opacity-90"
        >
          <Save className="size-4" /> Save changes
        </button>
      </div>

      {/* Server info */}
      <div className="glass rounded-2xl p-6 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Server className="size-4 text-primary" /> Connected Server
        </div>
        <div className="font-mono text-xs text-muted-foreground break-all">{MCP_SERVER_URL}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="size-2 rounded-full bg-success inline-block" />
          <span className="text-xs text-muted-foreground">All tool calls route through this server</span>
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="h-10 px-4 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 inline-flex items-center gap-2 text-sm"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
