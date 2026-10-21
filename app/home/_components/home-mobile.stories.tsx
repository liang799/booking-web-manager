import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { exampleBookings, exampleWeather, longVenueBooking, overnightBooking } from "./home-fixtures";
import { HomeView } from "./home-view";

const meta = {
  title: "Home/Mobile dashboard",
  component: HomeView,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/" } },
    docs: { description: { component: "The signed-in Home at 390px adapts its court hero, Find and Host actions, and personal upcoming bookings to a single column. Its synchronous states are loading, ready (bookings), empty (with a compact Singapore forecast or unavailable fallback), and error. Forecast details disclose the period, update time, source, and licence. Results stay in server props; Retry starts a navigation transition. Forecast fixtures are deterministic and do not make network requests." } },
  },
  globals: { viewport: { value: "phone", isRotated: false } },
  decorators: [(Story) => <AppShell user={{ name: "Marcus Lim", reliabilityScore: 96 }} logoutAction={fn()}><Story /></AppShell>],
  args: { state: { status: "ready", bookings: exampleBookings }, onRetry: fn() },
} satisfies Meta<typeof HomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByRole("heading", { name: /Make time to play\./, level: 1 })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Upcoming bookings", level: 2 })).toBeVisible());
    await expect(canvas.getAllByRole("article", { name: "Tennis booking at Bukit Timah CC" })).toHaveLength(2);
    await expect(canvas.queryByRole("button", { name: /filter/i })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Discover sessions" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Singapore weather" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Search sessions" })).toHaveAttribute("href", "/discover?returnTo=%2F");
    await expect(canvas.getByRole("link", { name: "Find a session" })).toHaveAttribute("href", "/discover?returnTo=%2F");
    await expect(canvas.getByRole("link", { name: "Host a session" })).toHaveAttribute("href", "/sessions/create");
    const sessionsLink = canvas.getByRole("link", { name: "View all hosted sessions" });
    await expect(sessionsLink).toHaveTextContent("View all");
    await expect(sessionsLink).toHaveAttribute("href", "/sessions");
    await expect(canvas.getByRole("navigation", { name: "Main" }).querySelector('[aria-current="page"]')).toHaveTextContent("Home");
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
};

export const NoBookingsWeather: Story = {
  args: { state: { status: "empty", weather: exampleWeather } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText("You have no upcoming bookings.")).toBeVisible());
    await expect(canvas.getByRole("heading", { name: "Singapore weather" })).toBeInTheDocument();
    await expect(canvas.getByText("Thundery showers")).toBeVisible();
    await expect(canvas.getByText(/25–32/)).toBeVisible();
    await expect(canvas.getByText(/Source: NEA/)).not.toBeVisible();
    await userEvent.click(canvas.getByLabelText(/^Forecast details:/));
    await expect(canvas.getByText("Forecast period (SGT)", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Updated", { exact: true })).toBeVisible();
    await expect(canvas.getByRole("link", { name: /Source: NEA/ })).toHaveAttribute("href", "https://data.gov.sg/datasets/d_ce2eb1e307bda31993c533285834ef2b/view");
    await expect(canvas.getByRole("link", { name: /Singapore Open Data Licence/ })).toBeVisible();
    const findLinks = canvas.getAllByRole("link", { name: "Find a session" });
    const hostLinks = canvas.getAllByRole("link", { name: "Host a session" });
    await expect(findLinks).toHaveLength(2);
    await expect(hostLinks).toHaveLength(2);
    for (const link of findLinks) await expect(link).toHaveAttribute("href", "/discover?returnTo=%2F");
    for (const link of hostLinks) await expect(link).toHaveAttribute("href", "/sessions/create");
  },
};

export const WeatherUnavailable: Story = {
  args: { state: { status: "empty", weather: { status: "unavailable" } } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText(/Weather is unavailable right now/)).toBeVisible());
    await expect(canvas.queryByText(/°C/)).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("link", { name: "Find a session" })).toHaveLength(2);
    await expect(canvas.getAllByRole("link", { name: "Host a session" })).toHaveLength(2);
  },
};

export const Loading: Story = {
  args: { state: { status: "loading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading your bookings");
    await expect(canvas.getByRole("region", { name: "Upcoming bookings" })).toHaveAttribute("aria-busy", "true");
    await expect(canvas.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Singapore weather" })).not.toBeInTheDocument();
  },
};
export const Unavailable: Story = { args: { state: { status: "error", kind: "unavailable" } } };
export const UnexpectedFailure: Story = {
  args: { state: { status: "error", kind: "unexpected" } },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("We couldn't load your bookings");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const LongVenueName: Story = { args: { state: { status: "ready", bookings: [longVenueBooking] } } };
export const Overnight: Story = {
  args: { state: { status: "ready", bookings: [overnightBooking] } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByLabelText("31 Dec 2035")).toBeVisible());
    await expect(canvas.getByText(/1 Jan 2036/, { selector: "time" })).toBeVisible();
  },
};
export const AccountMenu: Story = {
  play: async ({ canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Open account menu" });
    await userEvent.click(trigger);
    await expect(page.getByRole("dialog", { name: "Your account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
export const DarkWeather: Story = { args: { state: { status: "empty", weather: exampleWeather } }, globals: { theme: "dark" } };
