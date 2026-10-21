import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { emptyFilters, examplePage } from "./discovery-fixtures";
import { DiscoveryFormController } from "./discovery-form-controller";

const meta = {
  title: "Discover/Desktop search page",
  component: DiscoveryFormController,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/discover" } },
    docs: { description: { component: "Desktop Discover keeps the Booking sidebar and a distinct active Discover destination. From 768px the view follows the SC2006 Desktop Home frame: a dark court banner, sport chips, the search bar directly above a bold results heading, and two photo cards per row when the results column has room. It shares the mobile form, disclosure, state transitions and labels. Home shows only personal upcoming bookings or the weather fallback." } },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story) => <AppShell mobileVariant="focused" user={{ name: "Marcus Lim", reliabilityScore: 96 }} logoutAction={fn()}><Story /></AppShell>],
  args: { returnTo: "/", filters: emptyFilters, outcome: { status: "ready", page: examplePage }, pending: false, onNavigate: fn(), onRefresh: fn() },
} satisfies Meta<typeof DiscoveryFormController>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("navigation", { name: "Main" }).querySelector('[aria-current="page"]')).toHaveTextContent("Discover");
    await expect(canvas.getByRole("heading", { name: "Find Your Next Game" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Badminton session" })).toBeVisible();
    const chips = canvas.getByRole("group", { name: "Choose a sport" }).getBoundingClientRect();
    const search = canvas.getByRole("searchbox", { name: "Search sessions by sport or venue" }).getBoundingClientRect();
    const results = canvas.getByRole("region", { name: "Upcoming sessions" }).getBoundingClientRect();
    await expect(chips.bottom).toBeLessThanOrEqual(search.top);
    await expect(search.bottom).toBeLessThanOrEqual(results.top);
    const [first, second] = within(canvas.getByRole("region", { name: "Upcoming sessions" })).getAllByRole("listitem").map((card) => card.getBoundingClientRect());
    await expect(Math.abs(first!.top - second!.top)).toBeLessThan(2);
    await expect(first!.right).toBeLessThanOrEqual(second!.left);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const Empty: Story = { args: { outcome: { status: "ready", page: { items: [], nextCursor: null } } } };
export const Filtered: Story = { args: { filters: { ...emptyFilters, q: "Bishan", sport: "Badminton", region: "Central" }, outcome: { status: "ready", page: { items: [examplePage.items[0]!], nextCursor: null } } } };
export const Invalid: Story = { args: { filters: { ...emptyFilters, timeFrom: "18:00" }, outcome: { status: "invalid", fieldErrors: { date: ["Choose a date when filtering by time"] } } } };
export const Loading: Story = { args: { pending: true } };
export const Unavailable: Story = { args: { outcome: { status: "error", kind: "unavailable" } } };
export const LongVenueName: Story = { args: { outcome: { status: "ready", page: { items: [{ ...examplePage.items[0]!, venueName: "Singapore Community Sports and Recreation Centre — Indoor Multi-purpose Badminton Hall, Level 4, Court 12" }], nextCursor: null } } } };
export const Dark: Story = { globals: { theme: "dark" } };
