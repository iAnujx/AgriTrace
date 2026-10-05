import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Dashboard";

export const Route = createFileRoute("/dashboard/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — AgriTrace" },
      { name: "description", content: "AgriTrace Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Dashboard — AgriTrace" },
      { property: "og:description", content: "AgriTrace Dashboard: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
