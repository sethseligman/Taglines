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
        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-500/50"
      />
      {state?.error && (
        <p className="text-sm text-rose-400">{state.error}</p>
      )}
      <button
        type="submit"
        className="w-full rounded-lg bg-amber-500 py-3 font-medium text-zinc-900 hover:bg-amber-400"
      >
        Log in
      </button>
    </form>
  );
}
