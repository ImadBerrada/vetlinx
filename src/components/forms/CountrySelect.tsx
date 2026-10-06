import type { SelectHTMLAttributes } from "react";

// Keep the governed launch choices aligned with professional onboarding.
export const supportedCountryCodes = ["AE", "EG", "SA"] as const;

export function countryName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

export function CountrySelect({ includeAll = false, defaultValue, value, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { includeAll?: boolean }) {
  const existing = String(value ?? defaultValue ?? "").toUpperCase();
  const codes: string[] = [...supportedCountryCodes];
  if (/^[A-Z]{2}$/.test(existing) && !codes.includes(existing)) codes.push(existing);
  return <select {...props} defaultValue={defaultValue} value={value}>
    {includeAll ? <option value="">All countries</option> : null}
    {codes.map((code) => <option value={code} key={code}>{countryName(code)}</option>)}
  </select>;
}
