import { lazy } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";

// Lazy load the Guide page so its long-form copy + the related
// i18n keys ship as a separate chunk. Visitors landing on `/`
// don't pay for Guide content. Wrapped in a plain component so the
// TanStack `RouteComponent` type stays clean (Solid's `lazy()`
// attaches its own `preload` that doesn't match Router's signature).
const LazyGuide = lazy(() =>
  import("../pages/guide-page.tsx").then((mod) => ({ default: mod.GuidePage })),
);

function GuideRouteComponent() {
  return <LazyGuide />;
}

export const Route = createFileRoute("/guide")({
  component: GuideRouteComponent,
});
