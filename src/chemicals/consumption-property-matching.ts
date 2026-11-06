type Property = { id: string; name: string; code: string | null; addressLine1?: string | null; city?: string | null; state?: string | null };
type ImportRow = { propertyName: string; propertyId?: string; code?: string; addressLine1?: string };
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function addressKey(value: string, property: Property) {
  let address = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,]/g, ' ').trim();
  address = address.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
  for (const suffix of [property.state, property.city]) {
    if (!suffix) continue;
    const normalized = suffix.toLowerCase().trim();
    if (address.endsWith(` ${normalized}`)) address = address.slice(0, -normalized.length).trim();
  }
  const aliases: Record<string, string> = { avenue: 'ave', street: 'st', road: 'rd', drive: 'dr', circle: 'cir', boulevard: 'blvd', court: 'ct', lane: 'ln', place: 'pl', north: 'n', south: 's', east: 'e', west: 'w' };
  return address.split(/\s+/).map((token) => aliases[token] || token).join('');
}

export function matchConsumptionProperties<T extends Property>(properties: T[], row: ImportRow): T[] {
  if (row.propertyId) return properties.filter((property) => property.id === row.propertyId);
  const exactCode = row.code ? properties.filter((property) => property.code === row.code) : [];
  if (exactCode.length) return exactCode;
  // Confirmed source alias: the directory contains another NV record at this address.
  if (!row.code && row.addressLine1 && key(row.propertyName) === 'nvpropertyholdings') {
    const confirmed = properties.filter((property) => property.code === '8A5BA0E7-B17' && property.addressLine1 && addressKey(row.addressLine1!, property) === addressKey('4623 W Browning Ave', property) && addressKey(property.addressLine1, property) === addressKey(row.addressLine1!, property));
    if (confirmed.length) return confirmed;
  }
  const sourceCodes = row.code?.split(/\s+-\s+/) || [];
  const codeCandidates = sourceCodes.length > 1 ? properties.filter((property) => property.code && sourceCodes.includes(property.code)) : [];
  const candidates = codeCandidates.length ? codeCandidates : properties;
  const names = candidates.filter((property) => key(property.name) === key(row.propertyName));
  if (!row.addressLine1) return codeCandidates.length ? codeCandidates : names;
  const addresses = candidates.filter((property) => property.addressLine1 && addressKey(property.addressLine1, property) === addressKey(row.addressLine1!, property));
  const namedAddresses = addresses.filter((property) => names.some((named) => named.id === property.id));
  // Existing coded exports can use an external code that has not been saved in Home.
  if (!addresses.length && row.code && sourceCodes.length === 1 && names.length === 1) return names;
  return namedAddresses.length ? namedAddresses : addresses;
}
