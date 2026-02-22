import { createFileRoute } from "@tanstack/solid-router";
import { GuidePage } from "../pages/guide-page.tsx";

function GuideRouteComponent() {
  return <GuidePage />;
}

export const Route = createFileRoute("/guide")({
  component: GuideRouteComponent,
});
