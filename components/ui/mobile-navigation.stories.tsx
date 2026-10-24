import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { MobileNavigation, MobileNavigationProvider } from "./mobile-navigation";

const destinations = [
  { label: "Home", href: "/" },
  { label: "Sessions", href: "/sessions" },
  { label: "Wallet", href: "/wallet" },
  { label: "Settings", href: "/profile" },
] as const;

/** Storybook-only history remounts the navbar just as the separate signed-in layouts do. */
function NavigationDemo({ width = 390 }: { readonly width?: number }) {
  const [history, setHistory] = useState({ entries: ["/"], position: 0 });
  const pathname = history.entries[history.position]!;
  const pageLabel = destinations.find(({ href }) => href === pathname)!.label;

  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    const href = link?.getAttribute("href");
    if (!href || !destinations.some((destination) => destination.href === href)) return;
    event.preventDefault();
    setHistory((current) => current.entries[current.position] === href ? current : {
      entries: [...current.entries.slice(0, current.position + 1), href],
      position: current.position + 1,
    });
  }

  return (
    <main className="min-h-72 bg-card px-6 py-6" style={{ width, maxWidth: "100%" }} aria-label="Mobile navigation preview">
      <h1 className="mb-6 text-lg font-semibold">Find your next game.</h1>
      <MobileNavigationProvider>
        <div onClickCapture={navigate}>
          <MobileNavigation key={pathname} pathname={pathname} compact={pathname === "/wallet"} />
        </div>
      </MobileNavigationProvider>
      <p className="mt-7 text-sm" role="status">{pageLabel} page</p>
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="min-h-11 rounded border px-4 text-sm disabled:opacity-40"
          disabled={history.position === 0}
          onClick={() => setHistory((current) => ({ ...current, position: current.position - 1 }))}
        >
          Back
        </button>
        <button
          type="button"
          className="min-h-11 rounded border px-4 text-sm disabled:opacity-40"
          disabled={history.position === history.entries.length - 1}
          onClick={() => setHistory((current) => ({ ...current, position: current.position + 1 }))}
        >
          Forward
        </button>
      </div>
    </main>
  );
}

/** Focused forms hide the header; returning to a normal page starts with its own selection. */
function FocusedFlowDemo() {
  const [pathname, setPathname] = useState("/");
  const focused = pathname === "/sessions/create";

  return (
    <main className="min-h-72 bg-card px-6 py-6" style={{ width: 390, maxWidth: "100%" }}>
      <h1 className="mb-6 text-lg font-semibold">Focused-flow navigation</h1>
      <MobileNavigationProvider>
        <div hidden={focused}>
          <MobileNavigation key={pathname} pathname={pathname} enabled={!focused} compact={pathname === "/wallet"} />
        </div>
      </MobileNavigationProvider>
      <button
        type="button"
        className="mt-6 min-h-11 rounded border px-4 text-sm"
        onClick={() => setPathname(focused ? "/wallet" : "/sessions/create")}
      >
        {focused ? "Return to Wallet" : "Open focused flow"}
      </button>
    </main>
  );
}

const meta = {
  title: "Design system/MobileNavigation",
  component: MobileNavigation,
  args: { pathname: "/" },
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/" } },
    docs: {
      description: {
        component: "A travelling selection pill and expanding label connect the four mobile destinations. " +
          "This preview remounts the navigation for every route change while keeping its continuity provider mounted, " +
          "matching the application's separate signed-in layouts. Click the tabs or use Back and Forward. " +
          "Links keep their accessible names and current-page state throughout the motion; reduced-motion settings settle immediately.",
      },
    },
  },
  globals: { viewport: { value: "phone", isRotated: false } },
  render: () => <NavigationDemo />,
} satisfies Meta<typeof MobileNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Manual preview without the automated interaction sequence. */
export const Playground: Story = {};

async function expectSelection(nav: HTMLElement, selectedLabel: string) {
  const navigation = within(nav);
  const selected = navigation.getByRole("link", { name: selectedLabel });
  await expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(navigation.getAllByRole("link")).toHaveLength(4);

  await waitFor(async () => {
    const navBounds = nav.getBoundingClientRect();
    for (const { label, href } of destinations) {
      const link = navigation.getByRole("link", { name: label });
      const bounds = link.getBoundingClientRect();
      const visibleLabel = within(link).getByText(label, { exact: true }).closest('[aria-hidden="true"]')!;
      await expect(link).toHaveAccessibleName(label);
      await expect(link).toHaveAttribute("href", href);
      await expect(bounds.height).toBeGreaterThanOrEqual(44);
      await expect(bounds.width).toBeGreaterThanOrEqual(44);
      await expect(bounds.left).toBeGreaterThanOrEqual(navBounds.left);
      await expect(bounds.right).toBeLessThanOrEqual(navBounds.right);
      await expect(getComputedStyle(visibleLabel).opacity).toBe(label === selectedLabel ? "1" : "0");
      if (label === selectedLabel) {
        await expect(visibleLabel.getBoundingClientRect().width).toBeGreaterThan(20);
      } else {
        await expect(visibleLabel.getBoundingClientRect().width).toBeLessThan(0.5);
        await expect(link).not.toHaveAttribute("aria-current");
        await expect(bounds.width).toBeLessThan(selected.getBoundingClientRect().width);
      }
    }
    // The decorative background should finish directly behind the selected touch target.
    const pill = nav.querySelector('[aria-hidden="true"]')!;
    const pillBounds = pill.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    await expect(Math.abs(pillBounds.left - selectedBounds.left)).toBeLessThan(1);
    await expect(Math.abs(pillBounds.width - selectedBounds.width)).toBeLessThan(1);
    await expect(nav.scrollWidth).toBeLessThanOrEqual(nav.clientWidth);
  });
}

function selectionPill(nav: HTMLElement) {
  return nav.querySelector<HTMLElement>('[aria-hidden="true"]')!;
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Switching routes, history and interrupted motion all preserve the actual current page. */
export const Interactive: Story = {
  play: async ({ canvas }) => {
    const navigation = () => canvas.getByRole("navigation", { name: "Main" });
    await expectSelection(navigation(), "Home");
    for (const { label } of [...destinations.slice(1), destinations[0]!]) {
      const previousNav = navigation();
      await userEvent.click(within(previousNav).getByRole("link", { name: label }));
      await expect(navigation()).not.toBe(previousNav);
      await expectSelection(navigation(), label);
      await expect(canvas.getByRole("status")).toHaveTextContent(`${label} page`);
    }

    const homeNav = navigation();
    await userEvent.click(within(homeNav).getByRole("link", { name: "Home" }));
    await expect(navigation()).toBe(homeNav);
    await expectSelection(navigation(), "Home");

    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expectSelection(navigation(), "Settings");
    await userEvent.click(canvas.getByRole("button", { name: "Forward" }));
    await expectSelection(navigation(), "Home");

    const homePosition = selectionPill(navigation()).getBoundingClientRect().left;
    await userEvent.click(within(navigation()).getByRole("link", { name: "Settings" }));
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await nextPaint();
      const intermediatePosition = selectionPill(navigation()).getBoundingClientRect().left;
      await expect(intermediatePosition).toBeGreaterThan(homePosition + 5);
      await expect(intermediatePosition).toBeLessThan(within(navigation()).getByRole("link", { name: "Settings" }).getBoundingClientRect().left - 5);
      // Compare the same painted instant across the route commit, without elapsed animation frames.
      const beforeReverse = selectionPill(navigation()).getBoundingClientRect().left;
      flushSync(() => within(navigation()).getByRole("link", { name: "Home" }).click());
      const afterReverse = selectionPill(navigation()).getBoundingClientRect().left;
      await expect(Math.abs(afterReverse - beforeReverse)).toBeLessThan(20);
    } else {
      await userEvent.click(within(navigation()).getByRole("link", { name: "Home" }));
    }
    await expectSelection(navigation(), "Home");

    // Do not wait for a transition between taps: the latest route must win.
    for (const label of ["Sessions", "Wallet", "Settings", "Home", "Wallet"]) {
      await userEvent.click(within(navigation()).getByRole("link", { name: label }));
    }
    await expectSelection(navigation(), "Wallet");

    within(navigation()).getByRole("link", { name: "Home" }).focus();
    await expect(within(navigation()).getByRole("link", { name: "Home" })).toHaveFocus();
    await userEvent.tab();
    await expect(within(navigation()).getByRole("link", { name: "Sessions" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expectSelection(navigation(), "Sessions");
    await expect(canvas.getByRole("status")).toHaveTextContent("Sessions page");
  },
};

/** Wallet changes the shell padding while the provider carries the rendered selection between shells. */
export const WalletTransitions: Story = {
  play: async ({ canvas }) => {
    const navigation = () => canvas.getByRole("navigation", { name: "Main" });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function transition(action: () => void, selectedLabel: string) {
      const previousNav = navigation();
      const before = selectionPill(previousNav).getBoundingClientRect();
      flushSync(action);
      const nav = navigation();
      const pill = selectionPill(nav);
      // Sample the same painted instant: elapsed test-runner time must not count as a jump.
      const after = pill.getBoundingClientRect();
      const animations = pill.getAnimations();
      await expect(nav).not.toBe(previousNav);
      await expect(getComputedStyle(nav).padding).toBe(selectedLabel === "Wallet" ? "7px" : "10px");
      await expect(within(nav).getByRole("link", { name: selectedLabel })).toHaveAttribute("aria-current", "page");
      if (reducedMotion) {
        await expect(animations).toHaveLength(0);
        await expectSelection(nav, selectedLabel);
      } else {
        await expect(animations).toHaveLength(1);
        await expect(Math.abs(after.left - before.left)).toBeLessThan(1);
        await expect(Math.abs(after.width - before.width)).toBeLessThan(1);
      }
      return nav;
    }

    const select = (label: string) => () => within(navigation()).getByRole("link", { name: label }).click();
    await expectSelection(navigation(), "Home");
    await transition(select("Wallet"), "Wallet");
    await expectSelection(navigation(), "Wallet");
    await transition(select("Settings"), "Settings");
    await expectSelection(navigation(), "Settings");
    await transition(select("Home"), "Home");
    await expectSelection(navigation(), "Home");

    const homePosition = selectionPill(navigation()).getBoundingClientRect().left;
    const walletNav = await transition(select("Wallet"), "Wallet");
    if (!reducedMotion) {
      // Seek a rendered frame so the reverse-tap assertion is independent of machine speed.
      for (const animation of walletNav.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 100;
      }
      await expect(selectionPill(walletNav).getBoundingClientRect().left).toBeGreaterThan(homePosition + 5);
    }
    await transition(select("Home"), "Home");
    await expectSelection(navigation(), "Home");

    await transition(() => canvas.getByRole("button", { name: "Back" }).click(), "Wallet");
    await expectSelection(navigation(), "Wallet");
    await transition(() => canvas.getByRole("button", { name: "Forward" }).click(), "Home");
    await expectSelection(navigation(), "Home");
  },
};

/** A real resize still settles the selection instead of replaying stale geometry. */
export const ResizingStopsWalletTransition: Story = {
  play: async ({ canvas }) => {
    const preview = canvas.getByRole("main", { name: "Mobile navigation preview" });
    const navigation = () => canvas.getByRole("navigation", { name: "Main" });
    await expectSelection(navigation(), "Home");
    flushSync(() => within(navigation()).getByRole("link", { name: "Wallet" }).click());
    const pill = selectionPill(navigation());
    const animations = pill.getAnimations();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await expect(animations).toHaveLength(1);
      // Hold an in-flight frame so natural completion cannot satisfy the resize assertion.
      animations[0]!.pause();
      animations[0]!.currentTime = 100;
    }
    const originalWidth = preview.style.width;
    try {
      preview.style.width = "360px";
      await nextPaint();
      await expect(preview.getBoundingClientRect().width).toBe(360);
      await expect(pill.getAnimations()).toHaveLength(0);
      await expectSelection(navigation(), "Wallet");
    } finally {
      preview.style.width = originalWidth;
    }
  },
};

/** The longest label still fits alongside three 44px targets at 320px. */
export const Compact: Story = {
  render: () => <NavigationDemo width={320} />,
  play: async ({ canvas }) => {
    for (const label of ["Home", "Settings", "Sessions", "Wallet"]) {
      await userEvent.click(canvas.getByRole("link", { name: label }));
      await expectSelection(canvas.getByRole("navigation", { name: "Main" }), label);
    }
    const preview = canvas.getByRole("main", { name: "Mobile navigation preview" });
    await expect(preview.getBoundingClientRect().width).toBe(320);
    await expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth);
  },
};

export const Dark: Story = {
  globals: { theme: "dark", viewport: { value: "phone", isRotated: false } },
};

export const FocusedFlowResetsSelection: Story = {
  render: () => <FocusedFlowDemo />,
  play: async ({ canvas }) => {
    await expectSelection(canvas.getByRole("navigation", { name: "Main" }), "Home");
    await userEvent.click(canvas.getByRole("button", { name: "Open focused flow" }));
    await expect(canvas.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    flushSync(() => canvas.getByRole("button", { name: "Return to Wallet" }).click());
    const nav = canvas.getByRole("navigation", { name: "Main" });
    const wallet = within(nav).getByRole("link", { name: "Wallet" });
    // A previously hidden navbar must not briefly replay an earlier visible selection.
    await expect(Math.abs(selectionPill(nav).getBoundingClientRect().left - wallet.getBoundingClientRect().left)).toBeLessThan(1);
    await expectSelection(nav, "Wallet");
  },
};
