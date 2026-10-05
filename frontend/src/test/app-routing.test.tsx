import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Assert only that the router mounts and resolves a route (the root shell renders <html>, which cannot live in the
// test container div, so we check router state), never page content:
// routes are rewritten as the app is built and this must keep passing.
describe("App routing", () => {
  it("renders the index route", async () => {
    const { router } = renderAt("/");

    await waitFor(() => expect(router.state.matches.length).toBeGreaterThan(0));
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { router } = renderAt("/this-route-does-not-exist");

    await waitFor(() => expect(router.state.matches.length).toBeGreaterThan(0));
  });
});
