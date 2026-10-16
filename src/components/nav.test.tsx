import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, onNavigate: _onNavigate, ...props }: import("react").ComponentProps<"a"> & { onNavigate?: unknown }) => { void _onNavigate; return <a {...props}>{children}</a>; },
  useLinkStatus: () => ({ pending: false }),
}));

import { Nav } from "./nav";

describe("workspace navigation", () => {
  it.each([
    ["/", "/"], ["/studio/genesis-1", "/studio"],
    ["/library/genesis", "/library"], ["/assets", "/assets"],
    ["/calendar", "/calendar"], ["/analytics", "/analytics"],
    ["/operations", "/operations"], ["/settings", "/settings"],
  ])("highlights only the current section for %s", (pathname, href) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(<Nav/>);
    const active = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map((match) => match[0]);
    expect(active).toHaveLength(1);
    expect(active[0]).toContain(`href="${href}"`);
    expect(active[0]).toContain("nav-item-active");
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-controls="primary-navigation"');
  });
});
