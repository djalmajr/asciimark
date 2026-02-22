import { createFileRoute } from "@tanstack/solid-router";
import { PrivacyPage } from "../pages/privacy-page.tsx";

function PrivacyRouteComponent() {
  return <PrivacyPage />;
}

export const Route = createFileRoute("/privacy")({
  component: PrivacyRouteComponent,
});
