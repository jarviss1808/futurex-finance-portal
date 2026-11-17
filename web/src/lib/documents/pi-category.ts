import type { PiCategory } from "@/generated/prisma/client";

export const PI_CATEGORIES: Array<{ value: PiCategory; label: string }> = [
  { value: "EXHIBITION_PARTICIPATION", label: "Exhibition Participation" },
  { value: "BRANDING_FLEX_FRAME", label: "Branding / Flex with Frame" },
  { value: "EXTRA_REQUIREMENTS", label: "Extra Requirements" },
  { value: "STALL_FABRICATION", label: "Stall Fabrication" },
];
