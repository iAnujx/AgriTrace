import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/FarmerDashboard";

export const Route = createFileRoute("/dashboard/farmer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Farmer Dashboard — AgriTrace" },
      { name: "description", content: "AgriTrace Farmer Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Farmer Dashboard — AgriTrace" },
      { property: "og:description", content: "AgriTrace Farmer Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
