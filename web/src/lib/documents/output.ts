import { z } from "zod";
import type { DocumentSnapshot } from "./generate";

const bankDetails = z
  .object({
    bankName: z.string().default(""),
    accountNumber: z.string().default(""),
    branch: z.string().default(""),
    bankAddress: z.string().default(""),
    ifsc: z.string().default(""),
    swift: z.string().default(""),
  })
  .default({
    bankName: "",
    accountNumber: "",
    branch: "",
    bankAddress: "",
    ifsc: "",
    swift: "",
  });

const issuedSnapshot = z.object({
  type: z.string(),
  number: z.string(),
  issuedAt: z.string(),
  currency: z.string().length(3).default("INR"),
  taxLabel: z.string(),
  taxablePaise: z.string(),
  taxPaise: z.string(),
  totalPaise: z.string(),
  tdsPaise: z.string().default("0"),
  netReceivablePaise: z.string().optional(),
  notes: z.string().default(""),
  stallNumber: z.string().default(""),
  organization: z.object({
    name: z.string(),
    legalName: z.string().optional(),
    registeredAddress: z.string().optional(),
    corporateAddress: z.string().optional(),
    gstRegisteredAddress: z.string().optional(),
    gstin: z.string().optional(),
    pan: z.string().optional(),
    cin: z.string().optional(),
    accountsEmail: z.string().optional(),
    bankDetails: bankDetails.optional(),
    signatureImageBase64: z.string().min(1).optional(),
  }),
  client: z.object({
    legalName: z.string(),
    billingAddress: z.string(),
    gstin: z.string().nullable(),
  }),
  event: z
    .object({
      name: z.string(),
      edition: z.string().nullable(),
      startsOn: z.string().optional(),
      endsOn: z.string().optional(),
      venue: z.string(),
      city: z.string(),
      stateRegion: z.string().nullable().optional(),
      countryCode: z.string(),
    })
    .optional(),
  taxBreakdown: z
    .array(
      z.object({
        label: z.string(),
        ratePercent: z.string(),
        amountPaise: z.string(),
      }),
    )
    .optional(),
  lines: z.array(
    z.object({
      description: z.string(),
      classification: z.string(),
      unit: z.string().default("NOS"),
      quantity: z.string(),
      unitPricePaise: z.string(),
      amountPaise: z.string(),
    }),
  ),
});

export function toOutputSnapshot(raw: unknown): DocumentSnapshot {
  const value = issuedSnapshot.parse(raw);
  const organization = value.organization;
  const totalPaise = BigInt(value.totalPaise);
  const tdsPaise = BigInt(value.tdsPaise);
  return {
    title:
      value.type === "PROFORMA"
        ? "Proforma Invoice"
        : value.type.replaceAll("_", " "),
    number: value.number,
    issueDate: value.issuedAt.slice(0, 10),
    companyName: organization.legalName ?? organization.name,
    companyGstin: organization.gstin,
    companyPan: organization.pan,
    companyCin: organization.cin,
    accountsEmail: organization.accountsEmail,
    registeredAddress: organization.registeredAddress,
    corporateAddress: organization.corporateAddress,
    gstRegisteredAddress: organization.gstRegisteredAddress,
    bankDetails: organization.bankDetails,
    signatureImageBase64: organization.signatureImageBase64,
    event: value.event,
    stallNumber: value.stallNumber,
    customerName: value.client.legalName,
    customerAddress: value.client.billingAddress,
    customerGstin: value.client.gstin ?? undefined,
    currency: value.currency,
    lines: value.lines.map((line) => ({
      ...line,
      unitPricePaise: BigInt(line.unitPricePaise),
      amountPaise: BigInt(line.amountPaise),
    })),
    taxablePaise: BigInt(value.taxablePaise),
    taxLabel: value.taxLabel,
    taxBreakdown: value.taxBreakdown?.map((tax) => ({
      ...tax,
      amountPaise: BigInt(tax.amountPaise),
    })),
    taxPaise: BigInt(value.taxPaise),
    totalPaise,
    tdsPaise,
    netReceivablePaise: value.netReceivablePaise
      ? BigInt(value.netReceivablePaise)
      : totalPaise - tdsPaise,
    notes: value.notes,
  };
}
