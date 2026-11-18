
export type GstDetails = {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: string;
  address: string;
  state: string;
  pincode: string;
  verifiedAt: string;
  source: "api" | "manual";
  cached: boolean;
};

export type GstLookupResponse =
  | { success: true; data: GstDetails }
  | { success: false; error: string };
