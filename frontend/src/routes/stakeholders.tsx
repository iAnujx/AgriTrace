import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Stakeholders";

export const Route = createFileRoute("/stakeholders")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Stakeholders — AgriTrace" },
      { name: "description", content: "AgriTrace Stakeholders: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Stakeholders — AgriTrace" },
      { property: "og:description", content: "AgriTrace Stakeholders: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
