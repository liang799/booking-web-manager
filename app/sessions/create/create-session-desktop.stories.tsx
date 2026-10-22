import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppShell } from "@/components/ui/app-shell";
import { CreateSessionWizard, type CreateSessionWizardProps } from "./create-session-wizard";
import { emptySessionDraft, pendingStorageKey, submissionPayload, type SessionDraft } from "./model";
import { saveDraft, savedDraftStorageKey } from "./saved-session-draft";
import type { CreationOutcome } from "./transport";

const complete = {
  ...emptySessionDraft, venueName: "Bukit Timah Community Club", region: "West", cost: "60.00", price: "7.50",
  startDate: "2045-06-17", startTime: "19:00", endDate: "2045-06-17", endTime: "20:00",
  selectedVenue: { venueName: "Bukit Timah Community Club", address: "20 Toh Yi Drive", postalCode: "596569", latitude: 1.34, longitude: 103.77, region: "West" },
} satisfies SessionDraft;

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[pendingStorageKey("desktop-storybook"), initial]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function staleVenueStepStorage() {
  const storage = memoryStorage();
  saveDraft(storage, "desktop-storybook", {
    ...emptySessionDraft, startDate: "2020-01-01", startTime: "19:00", endDate: "2020-01-01", endTime: "20:00",
  }, 2);
  return storage;
}

function Harness(props: CreateSessionWizardProps) {
  const storage = useMemo(() => memoryStorage(), []);
  return <CreateSessionWizard {...props} storage={props.storage ?? storage} />;
}

function ReloadSavedDraft(props: CreateSessionWizardProps) {
  const [generation, setGeneration] = useState(0);
  return <>
    <Harness {...props} key={generation} initialDraft={generation === 0 ? props.initialDraft : undefined} />
    <button type="button" className="m-4 rounded-md border bg-card px-4 py-3 text-sm" onClick={() => setGeneration((current) => current + 1)}>Reload saved draft</button>
  </>;
}

const meta = {
  title: "Sessions/Create session/Desktop", component: CreateSessionWizard,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/sessions/create" } } },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [(Story) => <AppShell mobileVariant="focused" user={{ name: "Neoh", reliabilityScore: 96 }} logoutAction={fn()}><Story /></AppShell>],
  render: (args) => <Harness {...args} />,
  args: {
    userId: "desktop-storybook", initialDraft: complete,
    create: fn<CreateSessionWizardProps["create"]>(async () => ({ status: "created" })),
    search: fn<CreateSessionWizardProps["search"]>(async () => ({ items: [], nextPage: null })), onCreated: fn(),
  },
} satisfies Meta<typeof CreateSessionWizard>;

export default meta;
type Story = StoryObj<typeof CreateSessionWizard>;
const portal = () => within(document.body);

export const Schedule: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "When do you want to play?" })).toBeVisible();
    await expect(canvas.getByRole("complementary", { name: "Your session at a glance" })).toBeVisible();
    await expect(canvas.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(canvas.queryByRole("heading", { name: "Booked Venue Details" })).not.toBeInTheDocument();
  },
};

export const EmptySchedule: Story = {
  args: { initialDraft: emptySessionDraft },
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "When do you want to play?" })).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent(/valid.*date|date.*valid/i);
    await waitFor(() => expect(canvas.getByLabelText("Date", { exact: true })).toHaveFocus());
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const VenueDetails: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "What are you playing?" })).toHaveFocus();
    await expect(canvas.getByRole("combobox", { name: "Venue" })).toHaveValue(complete.venueName);
    await expect(canvas.getByLabelText("Booked venue cost (SGD)")).toHaveValue("60.00");
  },
};

export const ManualVenueValidation: Story = {
  args: { initialDraft: { ...complete, venueName: "", region: "", cost: "", selectedVenue: null } },
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByText("Enter or select a venue.")).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("combobox", { name: "Venue" })).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Enter venue manually" }));
    await userEvent.type(canvas.getByRole("combobox", { name: "Venue" }), "Booked community court");
    await userEvent.click(canvas.getByRole("combobox", { name: "Region" }));
    await userEvent.click(portal().getByRole("option", { name: "West" }));
    await waitFor(() => expect(portal().queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.type(canvas.getByLabelText("Booked venue cost (SGD)"), "60.00");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "Make it your kind of game." })).toHaveFocus();
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const Settings: Story = {
  args: { initialStep: 2 },
  play: async ({ canvas }) => {
    const minimum = within(canvas.getByRole("group", { name: "Minimum viable headcount" }));
    for (let index = 0; index < 6; index++) await userEvent.click(canvas.getByRole("button", { name: "Decrease Number of slots" }));
    await expect(canvas.getByRole("button", { name: "Decrease Number of slots" })).toBeDisabled();
    await expect(minimum.getByRole("status")).toHaveTextContent("2");
    await expect(minimum.getByRole("button", { name: "Increase Minimum viable headcount" })).toBeDisabled();
    await expect(minimum.getByRole("button", { name: "Decrease Minimum viable headcount" })).toBeDisabled();
  },
};

export const SavedDraftRecovery: Story = {
  args: { storage: memoryStorage() },
  render: (args) => <ReloadSavedDraft {...args} />,
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    const venue = canvas.getByRole("combobox", { name: "Venue" });
    await userEvent.clear(venue); await userEvent.type(venue, "Saved community court");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(JSON.parse(args.storage?.getItem(savedDraftStorageKey("desktop-storybook")) ?? "null")).toMatchObject({
      desktopStep: 2, draft: { venueName: "Saved community court" },
    });
    await expect(args.storage?.getItem(pendingStorageKey("desktop-storybook"))).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved draft" }));
    await expect(await canvas.findByRole("heading", { name: "What are you playing?" })).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Venue" })).toHaveValue("Saved community court");
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const SavedStepChanges: Story = {
  args: { storage: memoryStorage() },
  render: (args) => <ReloadSavedDraft {...args} />,
  play: async ({ canvas, args }) => {
    const key = savedDraftStorageKey("desktop-storybook");
    await userEvent.click(await canvas.findByRole("button", { name: "Save draft" }));
    const scheduleSnapshot = args.storage?.getItem(key);
    await expect(canvas.getByText("Draft saved in this tab. You can come back to it later.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "What are you playing?" })).toHaveFocus();
    await expect(canvas.getByText("You have unsaved changes.")).toBeVisible();
    await expect(args.storage?.getItem(key)).toBe(scheduleSnapshot);
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(JSON.parse(args.storage?.getItem(key) ?? "null")).toMatchObject({ desktopStep: 2 });
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByText("You have unsaved changes.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved draft" }));
    await expect(await canvas.findByRole("heading", { name: "What are you playing?" })).toBeVisible();
    await expect(canvas.queryByText("You have unsaved changes.")).not.toBeInTheDocument();
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const SavedCustomPresetDuration: Story = {
  args: { storage: memoryStorage() },
  render: (args) => <ReloadSavedDraft {...args} />,
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("combobox", { name: "Duration" }));
    await userEvent.click(portal().getByRole("option", { name: "Custom duration" }));
    await waitFor(() => expect(portal().queryByRole("listbox")).not.toBeInTheDocument());
    const duration = canvas.getByLabelText("Duration (minutes)");
    await userEvent.clear(duration); await userEvent.type(duration, "120");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(JSON.parse(args.storage?.getItem(savedDraftStorageKey("desktop-storybook")) ?? "null")).toMatchObject({
      desktopStep: 1, duration: "120", durationMode: "custom", draft: { endTime: "21:00" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved draft" }));
    await expect(await canvas.findByRole("combobox", { name: "Duration" })).toHaveTextContent("Custom duration");
    await expect(canvas.getByLabelText("Duration (minutes)")).toHaveValue(120);
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const SavedUnfinishedSchedule: Story = {
  args: { initialDraft: emptySessionDraft, storage: memoryStorage() },
  render: (args) => <ReloadSavedDraft {...args} />,
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Duration" }));
    await userEvent.click(portal().getByRole("option", { name: "Custom duration" }));
    await waitFor(() => expect(portal().queryByRole("listbox")).not.toBeInTheDocument());
    const duration = canvas.getByLabelText("Duration (minutes)");
    await userEvent.clear(duration); await userEvent.type(duration, "75");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(JSON.parse(args.storage?.getItem(savedDraftStorageKey("desktop-storybook")) ?? "null")).toMatchObject({
      desktopStep: 1, duration: "75", draft: { startDate: "", startTime: "" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Reload saved draft" }));
    await expect(await canvas.findByLabelText("Duration (minutes)")).toHaveValue(75);
    await expect(canvas.getByLabelText("Date", { exact: true })).toHaveValue("");
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const StaleScheduleAndVenueErrors: Story = {
  args: { initialDraft: undefined, storage: staleVenueStepStorage() },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "What are you playing?" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "When do you want to play?" })).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent("Choose a start time in the future.");
    await waitFor(() => expect(canvas.getByLabelText("Date", { exact: true })).toHaveFocus());
    await expect(args.create).not.toHaveBeenCalled();
  },
};

export const FourStepCreation: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "What are you playing?" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "Make it your kind of game." })).toHaveFocus();
    await userEvent.click(canvas.getByRole("combobox", { name: "Room visibility" }));
    await userEvent.click(portal().getByRole("option", { name: "Public" }));
    await waitFor(() => expect(portal().queryByRole("listbox")).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "Set your price." })).toHaveFocus();
    const price = canvas.getByLabelText("Price per slot (SGD)", { exact: true });
    await userEvent.clear(price); await userEvent.type(price, "12.01");
    const slider = canvas.getByRole("slider", { name: "Price per slot slider" });
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(price).toHaveValue("12.02");
    await expect(within(canvas.getByRole("region", { name: "Session form" })).getByRole("status")).toHaveTextContent("S$96.16");
    await userEvent.click(canvas.getByRole("button", { name: "Create session" }));
    await expect(args.create).toHaveBeenCalledOnce();
    await expect(args.create).toHaveBeenCalledWith(expect.objectContaining({
      booking: expect.objectContaining({ totalCostCents: 6000, venueName: complete.venueName }),
      config: expect.objectContaining({ visibility: "PUBLIC", totalSlots: 8, minimumHeadcount: 4, pricePerSlotCents: 1202 }),
    }));
    await waitFor(() => expect(args.onCreated).toHaveBeenCalledOnce());
  },
};

export const PricingBounds: Story = {
  args: { initialStep: 3 },
  play: async ({ canvas, args }) => {
    const price = canvas.getByLabelText("Price per slot (SGD)", { exact: true });
    await userEvent.clear(price); await userEvent.type(price, "15.01");
    await userEvent.click(canvas.getByRole("button", { name: "Create session" }));
    await expect(canvas.getByText("Choose a price within the displayed range.")).toBeVisible();
    await waitFor(() => expect(price).toHaveFocus());
    await expect(args.create).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeEnabled();
  },
};

export const AmbiguousRetry: Story = {
  args: { initialStep: 3 },
  play: async ({ canvas, args }) => {
    const create = args.create as ReturnType<typeof fn<CreateSessionWizardProps["create"]>>;
    create.mockResolvedValueOnce({ status: "error", code: "UNKNOWN_RESULT", ambiguous: true, message: "Retry this submission to check safely." });
    await userEvent.click(canvas.getByRole("button", { name: "Create session" }));
    await expect(canvas.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(canvas.getByLabelText("Price per slot (SGD)", { exact: true })).toBeDisabled();
    await expect(canvas.getByRole("slider", { name: "Price per slot slider" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Retry submission" }));
    await expect(create).toHaveBeenCalledTimes(2);
    await expect(create.mock.calls[1]?.[0]).toEqual(create.mock.calls[0]?.[0]);
    await waitFor(() => expect(args.onCreated).toHaveBeenCalledOnce());
  },
};

export const PendingReload: Story = {
  args: { storage: memoryStorage(JSON.stringify({ version: 1, payload: submissionPayload(complete, "desktop-retained-key") })) },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "Set your price." })).toBeVisible();
    await expect(canvas.getByLabelText("Price per slot (SGD)", { exact: true })).toBeDisabled();
    await waitFor(() => expect(canvas.getByRole("alert").parentElement).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Retry submission" }));
    await expect(args.create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "desktop-retained-key" }));
    await expect(args.storage?.getItem(pendingStorageKey("desktop-storybook"))).toBeNull();
  },
};

export const ServerRejection: Story = {
  args: {
    initialStep: 3,
    create: fn(async (): Promise<CreationOutcome> => ({
      status: "error", code: "PAYOUT_ACCOUNT_NOT_READY", ambiguous: false,
      message: "Complete your payout account setup before creating a session.",
    })),
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Create session" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Complete your payout account setup");
    await expect(canvas.getByRole("alert").parentElement).toHaveFocus();
    await expect(canvas.getByLabelText("Price per slot (SGD)", { exact: true })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeEnabled();
  },
};
