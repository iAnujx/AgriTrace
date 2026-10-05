import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Route,
  Settings,
  Sprout,
  Store,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useChain } from "@/ContractContext";
import { fetchIncomingOffers, shortAddr } from "@/chain/api";
import { listRecs, type Bid } from "@/lib/extras";
import { applyAppearance } from "@/lib/appearance";
import { useNavigate } from "@/lib/router-compat";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import type { Role, Session as UserData } from "@/lib/session";

/** Where each role's own dashboard lives. */
const HOME: Record<Role, string> = {
  farmer: "/dashboard/farmer",
  distributor: "/dashboard/distributor",
  retailer: "/dashboard/retailer",
  consumer: "/dashboard/consumer",
};

const DashboardLayout = ({ children, title }: { children: ReactNode; title: string }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const navigate = useNavigate();
  const chain = useChain();

  useEffect(() => {
    applyAppearance();
    try {
      const raw = localStorage.getItem("agritrace-user");
      if (!raw) return void navigate("/login");
      const u: UserData = JSON.parse(raw);
      // keep each role on its own pages
      const path = window.location.pathname;
      if (
        (path.startsWith("/dashboard/") && path !== HOME[u.role]) ||
        (path === "/register" && u.role !== "farmer")
      )
        return void navigate(HOME[u.role] ?? "/login");
      setUser(u);
    } catch {
      navigate("/login");
    }
  }, [navigate]);

  // Bell badge: farmers = open bids, distributors = farmer offers waiting for an answer.
  useEffect(() => {
    if (!user?.address) return;
    let live = true;
    const run = async () => {
      try {
        if (user.role === "farmer") {
          const bids = await listRecs<Bid>("bid");
          if (live)
            setPending(
              bids.filter(
                (b) =>
                  b.data.status === "open" &&
                  b.data.farmer.toLowerCase() === user.address.toLowerCase(),
              ).length,
            );
        } else if (user.role === "distributor" && chain.read) {
          const offers = await fetchIncomingOffers(chain.read, user.address);
          if (live) setPending(offers.filter((o) => o.status === "pending").length);
        }
      } catch {
        /* the bell is a convenience, never an error */
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [user, chain.read]);

  const items = useMemo(() => {
    if (!user) return [];
    const home = { icon: LayoutDashboard, label: "Dashboard", to: HOME[user.role] ?? "/dashboard" };
    const trace = { icon: Route, label: "Traceability", to: "/traceability" };
    const settings = { icon: Settings, label: "Settings", to: "/settings" };
    if (user.role === "consumer") return [home, trace, settings];
    const list = [home];
    if (user.role === "farmer")
      list.push({ icon: Package, label: "Register Batch", to: "/register" });
    list.push(
      trace,
      { icon: Store, label: "Marketplace", to: "/marketplace" },
      { icon: Users, label: "Stakeholders", to: "/stakeholders" },
      settings,
    );
    return list;
  }, [user]);

  const logout = async () => {
    await endSession();
    navigate("/login");
  };

  if (!user) return null;
  const wallet = chain.account ?? user.address;

  const nav = (
    <nav className="space-y-1" aria-label="Main">
      {items.map((item) => (
        <Button
          key={item.to + item.label}
          variant="ghost"
          className={cn(
            "w-full justify-start",
            location.pathname === item.to && "bg-primary/10 text-primary",
          )}
          onClick={() => {
            navigate(item.to);
            setOpen(false);
          }}
        >
          <item.icon className="mr-3 h-4 w-4" />
          {item.label}
        </Button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader className="mb-4">
                  <SheetTitle>AgriTrace</SheetTitle>
                </SheetHeader>
                {nav}
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-primary">
                <Sprout className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold leading-tight">AgriTrace</h1>
                <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.role !== "consumer" && (
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-2 sm:inline-flex"
                onClick={() => void chain.connect().catch(() => undefined)}
              >
                <Wallet className="h-4 w-4" />
                {chain.account ? shortAddr(chain.account) : "Connect wallet"}
              </Button>
            )}
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="Notifications"
              onClick={() => navigate(HOME[user.role])}
            >
              <Bell className="h-5 w-5" />
              {pending > 0 && (
                <Badge className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center px-1 text-[10px]">
                  {pending}
                </Badge>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                      {user.role.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left sm:block">
                    <p className="text-sm font-medium">
                      {wallet
                        ? shortAddr(wallet)
                        : user.name || user.email || user.phone || "Guest"}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className="hidden min-h-[calc(100vh-65px)] w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
          <div className="p-4">{nav}</div>
        </aside>
        <main className="min-w-0 flex-1">
          <div className="p-4 md:p-6">
            <h1 className="mb-6 text-3xl font-bold">{title}</h1>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
