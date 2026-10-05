import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/DistributorDashboard";

export const Route = createFileRoute("/dashboard/distributor")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Distributor Dashboard — AgriTrace" },
      { name: "description", content: "AgriTrace Distributor Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Distributor Dashboard — AgriTrace" },
      { property: "og:description", content: "AgriTrace Distributor Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
