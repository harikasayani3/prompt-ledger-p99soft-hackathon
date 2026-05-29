import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { setApiKey, setLocalProfile } from "@/lib/api-key";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { mcpLogin } from "@/lib/mcp/mcp.functions";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const login = useServerFn(mcpLogin);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await login({ data: { email, password } });
      if (!r.ok) throw new Error(r.error ?? "Invalid email or password");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = r.data as any;
      const key: string = data?.api_key ?? data?.apiKey ?? "";
      if (!key) throw new Error("Login failed — no session returned");
      setApiKey(key);
      setLocalProfile({
        email,
        name: data?.full_name ?? data?.name ?? undefined,
      });
      toast.success("Welcome back!");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md glass rounded-2xl p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="size-11 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center ring-glow">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AI Expense Assistant</h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="relative mt-1">
              <input
                required
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 pr-10 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <button
            disabled={busy}
            className="w-full h-10 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-sm text-muted-foreground mt-5 text-center">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
