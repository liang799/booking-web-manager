import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BookingLogo } from "./booking-logo";

const meta = {
  title: "Foundations/Booking logo",
  component: BookingLogo,
  parameters: {
    docs: { description: { component: "The shared Booking. wordmark owns Inter Black (900), casing and zero letter spacing. The default navigation size is 20px with normal line height; size=display is 48px, increasing to 60px on large screens, with compact line height for a page's main brand heading. The default adaptive tone follows the app theme; tone=inherit uses the surrounding text colour for fixed-colour artwork such as the landing page and auth backdrop. Keep navigation links and their hit targets in the calling layout." } },
  },
} satisfies Meta<typeof BookingLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Display: Story = { args: { size: "display" } };
export const InheritedOnLightSurface: Story = {
  args: { tone: "inherit" },
  globals: { theme: "dark" },
  decorators: [(Story) => <div className="bg-[#f6f5f1] p-8 text-[#141716]"><Story /></div>],
};
