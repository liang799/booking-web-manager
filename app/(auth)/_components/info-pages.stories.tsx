import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import HelpPage from "@/app/profile/help/page";
import PrivacyPage from "../privacy/page";
import TermsPage from "../terms/page";

/** The Terms, Privacy and Help pages, which replace the "Coming soon" Settings rows. */
function InfoPages({ page }: { readonly page: "terms" | "privacy" | "help" }) {
  if (page === "terms") return <TermsPage />;
  if (page === "privacy") return <PrivacyPage />;
  return (
    <AppShell user={{ name: "Joseph", reliabilityScore: 100 }} logoutAction={fn()}>
      <HelpPage />
    </AppShell>
  );
}

const meta = {
  title: "Account/Information pages",
  component: InfoPages,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "phone", isRotated: false } },
  args: { page: "terms" },
} satisfies Meta<typeof InfoPages>;

export default meta;
type Story = StoryObj<typeof meta>;

const fitsPhone = () => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

/** Public, so it can be read before registering; fits a 390px phone. */
export const Terms: Story = {
  parameters: { nextjs: { navigation: { pathname: "/terms" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Terms and conditions" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Withdrawing" })).toBeVisible();
    await expect(canvas.getByRole("navigation", { name: "Policies" })).toBeVisible();
    await fitsPhone();
  },
};

export const Privacy: Story = {
  args: { page: "privacy" },
  parameters: { nextjs: { navigation: { pathname: "/privacy" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Privacy and security" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Delete your account" })).toHaveAttribute("href", "/profile/delete");
    await fitsPhone();
  },
};

/** Each answer opens from its question; the questions are reachable by keyboard. */
export const Help: Story = {
  args: { page: "help" },
  parameters: { nextjs: { navigation: { pathname: "/profile/help" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Help and support" })).toBeVisible();
    const answer = canvas.getByText(/Withdraw as early as you can/);
    await expect(answer).not.toBeVisible();
    await userEvent.click(canvas.getByText("What happens if I can't make it?"));
    await expect(answer).toBeVisible();
    // Each question is a native <summary>: reachable with Tab, and opened with Enter or Space by the browser.
    await userEvent.tab();
    await expect(document.activeElement?.tagName).toBe("SUMMARY");
    await expect(document.activeElement).toHaveTextContent("How does the waitlist work?");
    await fitsPhone();
  },
};

export const HelpOnDesktop: Story = {
  args: { page: "help" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  parameters: { nextjs: { navigation: { pathname: "/profile/help" } } },
  play: async ({ canvas }) => { await expect(canvas.getByRole("heading", { name: "Sessions and payments" })).toBeVisible(); },
};
