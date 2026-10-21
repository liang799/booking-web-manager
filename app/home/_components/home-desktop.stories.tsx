import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { exampleBookings, exampleWeather, longVenueBooking, overnightBooking } from "./home-fixtures";
import { HomeView } from "./home-view";

const meta = {
  title: "Home/Desktop dashboard",
  component: HomeView,
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/" } },
    docs: { description: { component: "Desktop Home pairs a court hero and session actions with personal upcoming bookings in two columns. An empty diary offers Find and Host actions and a compact Singapore forecast, with its period, update time, source, and licence available by opening the forecast. View all opens the hosted-session list. Filters and public session results live on Discover. These synchronous HomeView fixtures have no database, authentication, or weather-service dependency." } },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story) => <AppShell user={{ name: "Marcus Lim", reliabilityScore: 96 }} logoutAction={fn()}><Story /></AppShell>],
  args: { state: { status: "ready", bookings: exampleBookings }, onRetry: fn() },
} satisfies Meta<typeof HomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole("heading", { name: /Make time to play\./, level: 1 })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Upcoming bookings", level: 2 })).toBeVisible());
    await expect(canvas.getAllByRole("article")).toHaveLength(2);
    await expect(canvas.getByRole("link", { name: "Find a session" })).toHaveAttribute("href", "/discover?returnTo=%2F");
    await expect(canvas.getByRole("link", { name: "Host a session" })).toHaveAttribute("href", "/sessions/create");
    const sessionsLink = canvas.getByRole("link", { name: "View all hosted sessions" });
    await expect(sessionsLink).toHaveTextContent("View all");
    await expect(sessionsLink).toHaveAttribute("href", "/sessions");
    await expect(canvas.queryByRole("heading", { name: "Singapore weather" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /filter/i })).not.toBeInTheDocument();
    await expect(canvas.getByRole("navigation", { name: "Main" }).querySelector('[aria-current="page"]')).toHaveTextContent("Home");
    await expect(canvas.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover?returnTo=%2F");
  },
};
export const NoBookingsWeather: Story = {
  args: { state: { status: "empty", weather: exampleWeather } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText("You have no upcoming bookings.")).toBeVisible());
    await expect(canvas.getAllByRole("link", { name: "Find a session" })).toHaveLength(2);
    await expect(canvas.getAllByRole("link", { name: "Host a session" })).toHaveLength(2);
    await expect(canvas.getByText("Thundery showers")).toBeVisible();
  },
};
export const WeatherUnavailable: Story = { args: { state: { status: "empty", weather: { status: "unavailable" } } } };
export const Loading: Story = { args: { state: { status: "loading" } } };
export const Unavailable: Story = { args: { state: { status: "error", kind: "unavailable" } } };
export const UnexpectedFailure: Story = { args: { state: { status: "error", kind: "unexpected" } } };
export const LongVenueName: Story = { args: { state: { status: "ready", bookings: [longVenueBooking, exampleBookings[1]] } } };
export const Overnight: Story = { args: { state: { status: "ready", bookings: [overnightBooking] } } };
export const Dark: Story = { globals: { theme: "dark" } };
export const DarkWeather: Story = { args: { state: { status: "empty", weather: exampleWeather } }, globals: { theme: "dark" } };
