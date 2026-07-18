const COUNTRY_CODE = /^[A-Z]{2}$/;

export function normalizeCountryCode(value: string): string | undefined {
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE.test(code) ? code : undefined;
}

export function countryDisplayName(value: string, locales: Intl.LocalesArgument = "en"): string {
  const code = normalizeCountryCode(value);
  if (!code) return value || "Unknown";
  if (typeof Intl.DisplayNames !== "function") return code;

  try {
    return new Intl.DisplayNames(locales, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryFlagUrl(value: string): string | undefined {
  const code = normalizeCountryCode(value);
  return code ? `https://flag.vercel.app/s/${code}.svg` : undefined;
}

export function countrySearchValue(value: string, locales: Intl.LocalesArgument = "en"): string {
  const query = value.trim();
  const code = normalizeCountryCode(query);
  if (code || !query || typeof Intl.DisplayNames !== "function") return code ?? query;

  const displayNames = new Intl.DisplayNames(locales, { type: "region" });
  const normalizedQuery = query.toLocaleLowerCase();
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const candidate = String.fromCharCode(first, second);
      const displayName = displayNames.of(candidate);
      if (displayName !== candidate && displayName?.toLocaleLowerCase() === normalizedQuery) return candidate;
    }
  }

  return query;
}
