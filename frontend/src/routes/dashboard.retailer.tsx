import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/RetailerDashboard";

export const Route = createFileRoute("/dashboard/retailer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Retailer Dashboard — AgriTrace" },
      { name: "description", content: "AgriTrace Retailer Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Retailer Dashboard — AgriTrace" },
      { property: "og:description", content: "AgriTrace Retailer Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
