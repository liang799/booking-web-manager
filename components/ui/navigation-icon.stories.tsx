import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";
import { NavigationIcon, type NavigationIconName } from "./navigation-icon";

const destinations: ReadonlyArray<{ name: NavigationIconName; label: string }> = [
  { name: "home", label: "Home" },
  { name: "search", label: "Discover" },
  { name: "sessions", label: "Sessions" },
  { name: "wallet", label: "Wallet" },
  { name: "groups", label: "Groups" },
  { name: "settings", label: "Settings" },
];

function IconSelectionPreview() {
  const [selected, setSelected] = useState<NavigationIconName>("home");

  return (
    <section className="max-w-xl space-y-5 p-4" aria-label="Icon selection preview">
      <div>
        <h1 className="text-lg font-semibold">Navigation icons</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select another icon to preview its arrival motion at its actual navigation size.
          These buttons demonstrate icon selection; they do not navigate to another page.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {destinations.map(({ name, label }) => (
          <button
            key={name}
            type="button"
            aria-pressed={selected === name}
            onClick={() => setSelected(name)}
            className={`flex min-h-[52px] items-center gap-3 rounded-lg border px-4 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${selected === name ? "bg-accent font-semibold" : ""}`}
          >
            <NavigationIcon name={name} active={selected === name} />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

const meta = {
  title: "Design system/Navigation icons",
  component: IconSelectionPreview,
  parameters: {
    docs: {
      description: {
        component: "An icon-selection preview of the shared 20px, 1.8px-stroke navigation icons. Selecting a different icon plays its motion once; selecting the current icon leaves it settled. The browser's reduced-motion preference disables motion. AppShell stories show the real route-derived selection and Next links.",
      },
    },
  },
} satisfies Meta<typeof IconSelectionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selection: Story = {
  play: async ({ canvas, canvasElement }) => {
    const reducedMotion = canvasElement.ownerDocument.defaultView
      ?.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sessions = canvas.getByRole("button", { name: "Sessions" });
    const wallet = canvas.getByRole("button", { name: "Wallet" });
    const sessionsIcon = sessions.querySelector("svg")!;

    await expect(canvas.getAllByRole("button")).toHaveLength(6);
    await expect(sessionsIcon.getAnimations()).toHaveLength(0);

    await userEvent.click(sessions);
    await expect(sessions).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getAllByRole("button", { pressed: true })).toHaveLength(1);
    await expect(sessionsIcon.getAnimations().length).toBe(reducedMotion ? 0 : 1);
    await waitFor(() => expect(sessionsIcon.getAnimations()).toHaveLength(0));

    // Reselecting the current destination does not restart a completed animation.
    await userEvent.click(sessions);
    await expect(sessionsIcon.getAnimations()).toHaveLength(0);

    await userEvent.click(wallet);
    await expect(sessions).toHaveAttribute("aria-pressed", "false");
    await expect(sessionsIcon.getAnimations()).toHaveLength(0);
    await userEvent.click(sessions);
    await expect(sessionsIcon.getAnimations().length).toBe(reducedMotion ? 0 : 1);
    await waitFor(() => expect(sessionsIcon.getAnimations()).toHaveLength(0));
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
