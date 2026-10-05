import { useEffect, useState } from "react";
import { Copy, LogOut, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChain } from "@/ContractContext";
import { useNavigate } from "@/lib/router-compat";
import { endSession, getSession, scopedKey, type Role } from "@/lib/session";

type Field = { key: string; label: string; placeholder?: string };

/** Extra fields that only make sense for one role. Farmer details never appear on a distributor's profile, and so on. */
const EXTRA: Record<Role, Field[]> = {
  farmer: [
    { key: "farmSize", label: "Farm size (acres)", placeholder: "5" },
    { key: "certification", label: "Certification", placeholder: "Organic, Hydroponic…" },
  ],
  distributor: [
    { key: "coverageArea", label: "Coverage area", placeholder: "Pan India / Maharashtra" },
    { key: "vehicles", label: "Number of vehicles", placeholder: "10" },
  ],
  retailer: [
    { key: "storeCount", label: "Number of stores", placeholder: "3" },
    { key: "storeType", label: "Store type", placeholder: "Supermarket, organic store…" },
  ],
  consumer: [],
};
const ORG_LABEL: Record<Role, string> = {
  farmer: "Farm name",
  distributor: "Company name",
  retailer: "Shop name",
  consumer: "Organisation (optional)",
};

const Profile = () => {
  const navigate = useNavigate();
  const { account } = useChain();
  const session = getSession();
  const role: Role = session?.role ?? "consumer";
  const key = scopedKey("agritrace-profile", session);
  const [data, setData] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      setData(saved ?? { displayName: session?.name ?? "" });
    } catch {
      setData({ displayName: session?.name ?? "" });
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: string) => setData((d) => ({ ...d, [k]: v }));
  const save = () => {
    localStorage.setItem(key, JSON.stringify(data));
    toast.success("Profile saved");
  };
  const wallet = account ?? session?.address ?? "";

  return (
    <DashboardLayout title="Profile">
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="card-modern">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Your {role} profile</span>
              <Badge className="bg-primary/10 capitalize text-primary">{role}</Badge>
            </CardTitle>
            <CardDescription>
              Saved for this account in this role only. Switching to another role or account shows a
              different profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="pf-name">Name</Label>
                <Input
                  id="pf-name"
                  className="mt-1"
                  value={data["displayName"] ?? ""}
                  onChange={(e) => set("displayName", e.target.value)}
                />
              </div>
              {role !== "consumer" && (
                <div>
                  <Label htmlFor="pf-org">{ORG_LABEL[role]}</Label>
                  <Input
                    id="pf-org"
                    className="mt-1"
                    value={data["organization"] ?? ""}
                    onChange={(e) => set("organization", e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="pf-loc">Location</Label>
                <Input
                  id="pf-loc"
                  className="mt-1"
                  value={data["location"] ?? ""}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
              {role !== "consumer" && (
                <div>
                  <Label htmlFor="pf-phone">Contact number</Label>
                  <Input
                    id="pf-phone"
                    type="tel"
                    className="mt-1"
                    value={data["contactNumber"] ?? session?.phone ?? ""}
                    onChange={(e) => set("contactNumber", e.target.value)}
                  />
                </div>
              )}
              {EXTRA[role].map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`pf-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`pf-${f.key}`}
                    className="mt-1"
                    placeholder={f.placeholder}
                    value={data[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div>
              <Label htmlFor="pf-bio">About</Label>
              <Textarea
                id="pf-bio"
                className="mt-1"
                value={data["bio"] ?? ""}
                onChange={(e) => set("bio", e.target.value)}
              />
            </div>
            <Button className="btn-primary" onClick={save}>
              <Save className="mr-2 h-4 w-4" />
              Save profile
            </Button>
          </CardContent>
        </Card>

        <Card className="card-modern">
          <CardHeader>
            <CardTitle>Sign-in details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Signed in with:</span>{" "}
              <span className="capitalize">{session?.method ?? "wallet"}</span>
            </p>
            {session?.email && (
              <p>
                <span className="text-muted-foreground">Email:</span> {session.email}
              </p>
            )}
            {session?.phone && (
              <p>
                <span className="text-muted-foreground">Phone:</span> {session.phone}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3">
              <span className="flex min-w-0 items-center gap-2">
                <Wallet className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate font-mono">
                  {wallet ||
                    "No wallet connected (connect one from the top bar to use blockchain features)"}
                </span>
              </span>
              {wallet && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy address"
                  onClick={() => {
                    void navigator.clipboard?.writeText(wallet);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => void endSession().then(() => navigate("/login"))}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
