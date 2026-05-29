import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { setApiKey, setLocalProfile } from "@/lib/api-key";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { mcpRegister } from "@/lib/mcp/mcp.functions";

export const Route = createFileRoute("/register")({ component: RegisterPage });

function RegisterPage() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const register = useServerFn(mcpRegister);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const r = await register({ data: { email, password, full_name: name } });
      if (!r.ok) throw new Error(r.error ?? "Registration failed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = r.data as any;
      const key: string = data?.api_key ?? data?.apiKey ?? "";
      if (!key) throw new Error("Account created but sign-in failed — please sign in manually.");
      setApiKey(key);
      setLocalProfile({ email, name: name || undefined });
      toast.success("Account created — welcome!");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
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
            <h1 className="text-xl font-semibold">Create account</h1>
            <p className="text-sm text-muted-foreground">Start tracking your expenses</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rahul Sharma"
              autoComplete="name"
              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
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
                minLength={8}
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
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
          <div>
            <label className="text-sm font-medium">Confirm password</label>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              className="w-full mt-1 h-10 px-3 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <button
            disabled={busy}
            className="w-full h-10 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-muted-foreground mt-5 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
