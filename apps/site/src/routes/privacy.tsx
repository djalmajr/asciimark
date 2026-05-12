import { lazy } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";

// Lazy: ship Privacy content + its i18n chunk only when the user
// navigates to `/privacy`. Initial Home load stays untouched.
const LazyPrivacy = lazy(() =>
  import("../pages/privacy-page.tsx").then((mod) => ({ default: mod.PrivacyPage })),
);

function PrivacyRouteComponent() {
  return <LazyPrivacy />;
}

export const Route = createFileRoute("/privacy")({
  component: PrivacyRouteComponent,
});
