import { useSearch } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import { ProductLookup } from "@/components/chain/ProductLookup";

const Traceability = () => {
  const { f } = useSearch({ from: "/traceability" });
  return (
    <DashboardLayout title="Traceability">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Traceability</h2>
          <p className="text-muted-foreground">Follow any product from the farm to the shop. Every step is read straight from the blockchain.</p>
        </div>
        <ProductLookup initial={f} />
      </div>
    </DashboardLayout>
  );
};

export default Traceability;
