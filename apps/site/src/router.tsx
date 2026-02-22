import { createBrowserHistory } from "@tanstack/history";
import { createRouter } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen.ts";

const basepath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL.slice(0, -1) || "/"
  : import.meta.env.BASE_URL;

const history = createBrowserHistory({
  window,
});

export const router = createRouter({
  routeTree,
  history,
  basepath,
  defaultPreload: "intent",
});

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
