import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Login";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Login — AgriTrace" },
      { name: "description", content: "AgriTrace Login: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Login — AgriTrace" },
      { property: "og:description", content: "AgriTrace Login: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
