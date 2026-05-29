// Supabase client is no longer used for auth — authentication is handled via
// MCP API keys stored in localStorage. This file is kept as a stub so any
// residual imports don't break the build.
export const supabase = {
  auth: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onAuthStateChange: (_e: any, _cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
  },
} as const;
