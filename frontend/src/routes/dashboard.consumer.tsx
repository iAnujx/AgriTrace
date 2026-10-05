import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/ConsumerDashboard";

export const Route = createFileRoute("/dashboard/consumer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Consumer Access — AgriTrace" },
      { name: "description", content: "AgriTrace Consumer Access: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Consumer Access — AgriTrace" },
      { property: "og:description", content: "AgriTrace Consumer Access: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
