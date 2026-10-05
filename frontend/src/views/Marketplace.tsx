import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CropNeedsPanel, MarketBoard } from "@/components/extras/DistributorExtras";
import { SharedNotice } from "@/components/extras/SharedNotice";
import { useChain } from "@/ContractContext";

const role = (): string => {
  try {
    return JSON.parse(localStorage.getItem("agritrace-user") ?? "{}").role ?? "";
  } catch {
    return "";
  }
};

/** Crops farmers have listed, and what distributors need. Distributors can bid; stock only moves through on-chain offers. */
const Marketplace = () => {
  const { account } = useChain();
  const isDistributor = role() === "distributor";
  return (
    <DashboardLayout title="Marketplace">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Crop marketplace</h2>
          <p className="text-muted-foreground">
            {isDistributor
              ? "Browse crops from farmers and place a bid. If the farmer accepts, you receive an on-chain offer to accept."
              : "See what is listed and what distributors are looking for."}
          </p>
        </div>
        <SharedNotice />
        <Tabs defaultValue="listings">
          <TabsList>
            <TabsTrigger value="listings">Crop listings</TabsTrigger>
            <TabsTrigger value="needs">Crop needed</TabsTrigger>
          </TabsList>
          <TabsContent value="listings" className="mt-4">
            <MarketBoard account={account ?? undefined} canBid={isDistributor} />
          </TabsContent>
          <TabsContent value="needs" className="mt-4">
            <CropNeedsPanel account={account ?? undefined} readOnly={!isDistributor} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Marketplace;
