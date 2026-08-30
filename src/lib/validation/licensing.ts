import { z } from "zod";

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]*$/);
const localizedName = z.string().trim().min(2).max(250);

export const isoCountryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Enter a valid calendar date.");

export const authorityReferenceSchema = z.string().trim().min(2).max(200);
export const credentialIdSchema = z.uuid();
export const externalApplicationStatusSchema = z.enum([
  "SUBMITTED",
  "UNDER_REVIEW",
  "REJECTED",
]);

export const ianaTimeZoneSchema = z.string().trim().min(1).max(80).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  },
  "Enter a valid IANA time zone.",
);

export const leadDaysSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(90),
  z.literal(120),
]);

export const linkRequirementCredentialSchema = z.object({
  credentialId: credentialIdSchema,
});

export const requirementProgressSchema = z.object({
  state: z.literal("IN_PROGRESS"),
  note: z.string().trim().max(2000).optional(),
});

export const createExternalApplicationSchema = z.object({
  authorityReference: authorityReferenceSchema,
  submittedAt: isoDateSchema,
  status: z.literal("SUBMITTED"),
});

export const updateExternalApplicationSchema = z
  .object({
    authorityReference: authorityReferenceSchema.optional(),
    submittedAt: isoDateSchema.optional(),
    status: externalApplicationStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export const licensingReminderPreferenceSchema = z.object({
  timeZone: ianaTimeZoneSchema,
  renewalEnabled: z.boolean(),
  leadDays: leadDaysSchema,
});

const verifiedCredentialRuleSchema = z.object({
  kind: z.literal("VERIFIED_CREDENTIAL"),
  credentialTypeCode: code.max(120),
  countryCode: isoCountryCodeSchema.optional(),
});

const pathwayRequirementSchema = z.object({
  code: code.max(120),
  titleEn: localizedName,
  titleAr: localizedName,
  descriptionEn: z.string().trim().min(2).max(4000),
  descriptionAr: z.string().trim().min(2).max(4000),
  position: z.number().int().min(1),
  required: z.boolean(),
  rule: verifiedCredentialRuleSchema,
});

const pathwayVersionContentObjectSchema = z.object({
  sourceUrl: z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS source URL."),
  sourceTitle: z.string().trim().min(2).max(300),
  effectiveFrom: isoDateSchema.optional(),
  effectiveTo: isoDateSchema.optional(),
  requirements: z.array(pathwayRequirementSchema).min(1),
});

const pathwayVersionContentSchema = pathwayVersionContentObjectSchema
  .refine(
    ({ effectiveFrom, effectiveTo }) =>
      !effectiveFrom || !effectiveTo || effectiveFrom <= effectiveTo,
    { message: "The effective end date cannot precede the start date.", path: ["effectiveTo"] },
  );

export const createLicensingJurisdictionSchema = z.object({
  code: isoCountryCodeSchema,
  nameEn: localizedName.max(200),
  nameAr: localizedName.max(200),
});

export const createLicensingAuthoritySchema = z.object({
  jurisdictionId: z.uuid(),
  code: code.max(100),
  nameEn: localizedName,
  nameAr: localizedName,
  websiteUrl: z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS website URL."),
});

export const createLicenceTypeSchema = z.object({
  code: code.max(100),
  nameEn: localizedName.max(200),
  nameAr: localizedName.max(200),
  professionalTitleCode: code.max(100),
});

export const createLicencePathwaySchema = pathwayVersionContentSchema.and(
  z.object({
    jurisdictionId: z.uuid(),
    authorityId: z.uuid(),
    licenceTypeId: z.uuid(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  }),
);

export const createPathwayVersionSchema = pathwayVersionContentSchema;
export const updatePathwayVersionSchema = pathwayVersionContentObjectSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one change.",
  )
  .refine(
    ({ effectiveFrom, effectiveTo }) =>
      !effectiveFrom || !effectiveTo || effectiveFrom <= effectiveTo,
    { message: "The effective end date cannot precede the start date.", path: ["effectiveTo"] },
  );
