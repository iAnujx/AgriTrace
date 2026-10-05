import { useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardLayout from "@/components/DashboardLayout";
import { Addr, Empty, ErrorNote, Loading, fmtDate } from "@/components/chain/ui";
import { useAsync } from "@/components/chain/useAsync";
import { WalletGate, useReady } from "@/components/chain/WalletGate";
import { fetchPartners } from "@/chain/api";
import { ADDRESSES, isAddress } from "@/chain/config";

const storedRole = (): string => {
  try {
    return JSON.parse(localStorage.getItem("agritrace-user") ?? "{}").role ?? "";
  } catch {
    return "";
  }
};

function PartnersBody() {
  const { c, account } = useReady();
  const role = storedRole();
  const [query, setQuery] = useState("");

  const { data, loading, error } = useAsync(async () => {
    if (role !== "farmer" && role !== "distributor" && role !== "retailer") return [];
    const shop = [localStorage.getItem(`shop:${account.toLowerCase()}`), ADDRESSES.retailer].find(isAddress) ?? undefined;
    return fetchPartners(c, account, role, shop);
  }, [c, account, role]);

  const rows = (data ?? []).filter((p) => `${p.name} ${p.address} ${p.role}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Card className="card-modern">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Your trading partners
        </CardTitle>
        <CardDescription>Everyone you have sent offers to, or received offers from, read from the blockchain.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input value={query} placeholder="Search by name or address" onChange={(e) => setQuery(e.target.value)} />
        <ErrorNote message={error} />
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>{role === "consumer" ? "Consumers do not have trading partners." : "No partners yet. They appear after your first offer."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Offers</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={`${p.role}-${p.address}`}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      <Addr a={p.address} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {p.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.offers}</TableCell>
                    <TableCell>{p.kg} kg</TableCell>
                    <TableCell>{fmtDate(p.lastAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const Stakeholders = () => (
  <DashboardLayout title="Stakeholders">
    <div className="mx-auto max-w-4xl">
      <WalletGate>
        <PartnersBody />
      </WalletGate>
    </div>
  </DashboardLayout>
);

export default Stakeholders;
