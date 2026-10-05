import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Settings";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Settings — AgriTrace" },
      { name: "description", content: "AgriTrace Settings: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Settings — AgriTrace" },
      { property: "og:description", content: "AgriTrace Settings: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
