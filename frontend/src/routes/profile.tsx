import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Profile";

export const Route = createFileRoute("/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Profile — AgriTrace" },
      { name: "description", content: "AgriTrace Profile: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Profile — AgriTrace" },
      { property: "og:description", content: "AgriTrace Profile: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
