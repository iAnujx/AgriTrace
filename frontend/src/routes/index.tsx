import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Login";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — AgriTrace" },
      { name: "description", content: "AgriTrace Sign in: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Sign in — AgriTrace" },
      { property: "og:description", content: "AgriTrace Sign in: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
