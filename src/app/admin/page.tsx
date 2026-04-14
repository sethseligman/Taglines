import { isAdmin } from "@/lib/adminAuth";
import { getSchedule, listMovies } from "@/actions/movies";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authorized = await isAdmin();
  if (!authorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-foreground mb-6 text-center">Admin</h1>
          <AdminLoginForm />
        </div>
      </div>
    );
  }
  const [movies, schedule] = await Promise.all([listMovies(), getSchedule(60)]);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminPanel initialMovies={movies} initialSchedule={schedule} />
    </div>
  );
}
