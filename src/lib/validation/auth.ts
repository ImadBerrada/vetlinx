import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(128, "Use no more than 128 characters."),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const professionalProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Enter the professional name people recognize.")
    .max(200),
  countryCode: z.string().length(2),
});

export type FieldErrors = Record<string, string[]>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  return error.flatten().fieldErrors as FieldErrors;
}

