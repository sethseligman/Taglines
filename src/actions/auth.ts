"use server";

import { redirect } from "next/navigation";
import { verifyAdminPassword, clearAdminCookie } from "@/lib/adminAuth";

export async function loginAdmin(_prev: unknown, formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const password = formData.get("password");
  if (typeof password !== "string") return { error: "Invalid input" };
  const ok = await verifyAdminPassword(password);
  if (!ok) return { error: "Invalid password" };
  return { success: true };
}

export async function logoutAdmin() {
  await clearAdminCookie();
  redirect("/admin");
}
