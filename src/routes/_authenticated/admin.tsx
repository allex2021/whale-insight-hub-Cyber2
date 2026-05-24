import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { ArrowLeft, Radio, History } from "lucide-react";
import { checkIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · Whale Intelligence Pro" }] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const r = await checkIsAdmin();
      if (!r.isAdmin) throw redirect({ to: "/" });
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-3 lg:px-8">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="font-bold tracking-tight">⚙️ Admin Panel</h1>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              to="/admin"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-secondary"
              activeProps={{ className: "bg-secondary text-foreground" }}
              activeOptions={{ exact: true }}
            >
              <Radio className="h-4 w-4" /> Channels
            </Link>
            <Link
              to="/admin/broadcasts"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-secondary"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              <History className="h-4 w-4" /> History
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
