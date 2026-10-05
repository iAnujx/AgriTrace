import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/Register";

export const Route = createFileRoute("/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Register Batch — AgriTrace" },
      { name: "description", content: "AgriTrace Register Batch: blockchain-backed farm-to-table produce traceability." },
      { property: "og:title", content: "Register Batch — AgriTrace" },
      { property: "og:description", content: "AgriTrace Register Batch: blockchain-backed farm-to-table produce traceability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
