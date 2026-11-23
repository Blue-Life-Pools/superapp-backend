import { BadGatewayException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';

export const proposalOfficeAddress = '811 E 131st Ave, Tampa, FL 33612-4424, USA';
const metersPerMile = 1609.344;

type PropertyLocation = {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  latitude: unknown;
  longitude: unknown;
};

function destinationFor(property: PropertyLocation) {
  const [street, city, state, zip] = [property.addressLine1, property.city, property.state, property.zipCode].map(value => value?.trim());
  if (street && (zip || (city && state))) {
    return { address: [street, city, state, zip, 'USA'].filter(Boolean).join(', ') };
  }
  const latitude = Number(property.latitude);
  const longitude = Number(property.longitude);
  if (property.latitude != null && property.longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)) {
    return { location: { latLng: { latitude, longitude } } };
  }
  throw new UnprocessableEntityException('The property needs a street address or map coordinates.');
}

export async function getProposalDrivingDistance(property: PropertyLocation, apiKey = process.env.GOOGLE_ROUTES_API_KEY?.trim()) {
  const destination = destinationFor(property);
  if (!apiKey) throw new ServiceUnavailableException('Automatic driving distance is unavailable.');

  let result: { routes?: { distanceMeters?: number }[] };
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters' },
      body: JSON.stringify({
        origin: { address: proposalOfficeAddress }, destination, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE',
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('Routing request failed');
    result = await response.json();
  } catch {
    throw new BadGatewayException('Driving distance could not be calculated.');
  }
  const meters = result?.routes?.[0]?.distanceMeters;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
    throw new UnprocessableEntityException('No driving distance was found for the property.');
  }
  return { oneWayMiles: Math.round(meters / metersPerMile * 100) / 100 };
}
