import { createFileRoute } from "@tanstack/solid-router";
import { HomePage } from "../pages/home-page.tsx";

function HomeRouteComponent() {
  return <HomePage />;
}

export const Route = createFileRoute("/")({
  component: HomeRouteComponent,
});
