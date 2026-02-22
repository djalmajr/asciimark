import { createRootRoute } from "@tanstack/solid-router";
import { SiteLayout } from "../components/site-layout.tsx";

function RootRouteComponent() {
  return <SiteLayout />;
}

export const Route = createRootRoute({
  component: RootRouteComponent,
});
