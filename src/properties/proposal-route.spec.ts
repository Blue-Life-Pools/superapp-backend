import { getProposalDrivingDistance, proposalOfficeAddress } from './proposal-route';
import { PropertiesController } from './properties.controller';

const address = {
  addressLine1: '100 Example Drive', city: 'Tampa', state: 'FL', zipCode: '33612', latitude: null, longitude: null,
};

describe('Proposal driving distance', () => {
  afterEach(() => jest.restoreAllMocks());

  it('routes from the Tampa office, converts meters to miles, and limits the response to distance', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ routes: [{ distanceMeters: 16093.44 }] }));
    await expect(getProposalDrivingDistance(address, 'test-key')).resolves.toEqual({ oneWayMiles: 10 });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(options?.headers).toMatchObject({ 'X-Goog-FieldMask': 'routes.distanceMeters' });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      origin: { address: proposalOfficeAddress }, destination: { address: '100 Example Drive, Tampa, FL, 33612, USA' }, travelMode: 'DRIVE',
    });
    expect(Reflect.getMetadata('appRoles', PropertiesController.prototype.proposalRoute)).toEqual(['COMMERCIAL']);
  });

  it('uses CRM coordinates when the street address is incomplete', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ routes: [{ distanceMeters: 0 }] }));
    await expect(getProposalDrivingDistance({ ...address, addressLine1: null, latitude: '28.05', longitude: '-82.42' }, 'test-key')).resolves.toEqual({ oneWayMiles: 0 });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).destination).toEqual({ location: { latLng: { latitude: 28.05, longitude: -82.42 } } });
  });

  it('distinguishes a missing route, a provider error, and an absent API key from zero miles', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ routes: [] }))
      .mockResolvedValueOnce(Response.json({}, { status: 429 }));
    await expect(getProposalDrivingDistance(address, 'test-key')).rejects.toMatchObject({ status: 422 });
    await expect(getProposalDrivingDistance(address, 'test-key')).rejects.toMatchObject({ status: 502 });
    await expect(getProposalDrivingDistance(address, '')).rejects.toMatchObject({ status: 503 });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
