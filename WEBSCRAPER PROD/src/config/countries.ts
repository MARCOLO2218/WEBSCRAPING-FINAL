export type CountryCode = 'GT' | 'HN' | 'SV' | 'NC';
export type CurrencyCode = 'GTQ' | 'HNL' | 'USD' | 'NIO';

export type CountryDefinition = Readonly<{
  code: CountryCode;
  name: string;
  currency: CurrencyCode;
  currencyName: string;
  operational: boolean;
}>;

export const COUNTRY_CATALOG: readonly CountryDefinition[] = Object.freeze([
  Object.freeze({ code: 'GT', name: 'Guatemala', currency: 'GTQ', currencyName: 'Quetzal', operational: true } as const),
  Object.freeze({ code: 'HN', name: 'Honduras', currency: 'HNL', currencyName: 'Lempira', operational: false } as const),
  Object.freeze({ code: 'SV', name: 'El Salvador', currency: 'USD', currencyName: 'Dólar estadounidense', operational: false } as const),
  Object.freeze({ code: 'NC', name: 'Nicaragua', currency: 'NIO', currencyName: 'Córdoba', operational: false } as const),
]);

// Códigos canónicos del negocio: NC no se sustituye por NI.
export function getCountry(code: unknown): CountryDefinition | undefined {
  return COUNTRY_CATALOG.find(country => country.code === code);
}

export function validateCountryCurrency(country: unknown, currency: unknown): CountryDefinition {
  const definition = getCountry(country);
  if (!definition) throw new Error('País no reconocido.');
  if (definition.currency !== currency) throw new Error('Moneda incompatible con el país.');
  return definition;
}
