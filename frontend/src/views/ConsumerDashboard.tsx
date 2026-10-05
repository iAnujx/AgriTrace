import DashboardLayout from "@/components/DashboardLayout";
import { Catalog } from "@/components/extras/Catalog";
import { ProductLookup } from "@/components/chain/ProductLookup";

const ConsumerDashboard = () => (
  <DashboardLayout title="Consumer Access">
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Fresh, traceable produce</h2>
        <p className="text-muted-foreground">Browse verified crops, then follow any pack from the farm to the shop. No farmer names or phone numbers are shown.</p>
      </div>
      <Catalog />
      <div className="mx-auto max-w-3xl space-y-3">
        <h3 className="text-lg font-semibold">Have a pack in your hand?</h3>
        <ProductLookup />
      </div>
    </div>
  </DashboardLayout>
);

export default ConsumerDashboard;
