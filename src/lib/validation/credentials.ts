import { z } from "zod";

export const credentialSchema = z
  .object({
    typeCode: z.enum(["DEGREE", "PROFESSIONAL_LICENCE", "CERTIFICATION"]),
    title: z.string().trim().min(2, "Enter the credential title.").max(250),
    issuingOrganization: z
      .string()
      .trim()
      .min(2, "Enter the issuing organization.")
      .max(250),
    countryCode: z.string().length(2),
    issueDate: z.iso.date("Enter the issue date."),
    expiryDate: z.union([z.iso.date(), z.literal("")]).optional(),
  })
  .refine(
    (value) => !value.expiryDate || value.expiryDate > value.issueDate,
    { message: "Expiry date must be after issue date.", path: ["expiryDate"] },
  )
  .transform((value) => ({
    ...value,
    expiryDate: value.expiryDate || undefined,
  }));
