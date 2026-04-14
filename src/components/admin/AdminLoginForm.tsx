"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAdmin } from "@/actions/auth";

export function AdminLoginForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(loginAdmin, null as { error?: string; success?: boolean } | null);

  useEffect(() => {
    if (state?.success) router.push("/admin");
  }, [state?.success, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input
        type="password"
        name="password"
        placeholder="Admin password"
        autoComplete="current-password"
        className="w-full rounded-lg border border-white/20 bg-surface px-4 py-3 text-foreground placeholder:text-muted outline-none focus:ring-2 focus:ring-gold/50"
      />
      {state?.error && (
        <p className="text-sm text-rose-400">{state.error}</p>
      )}
      <button
        type="submit"
        className="w-full rounded-lg bg-gold py-3 font-semibold text-background hover:bg-gold/90"
      >
        Log in
      </button>
    </form>
  );
}
