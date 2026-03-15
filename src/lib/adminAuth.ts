import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "taglines_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

export function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET;
}

/** Verify password and set admin cookie. Returns true if success. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret || secret.length < 8) return false;
  if (password !== secret) return false;
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return true;
}

/** Check if request has valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return token === secret;
}

/** Clear admin cookie (logout). */
export async function clearAdminCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}
