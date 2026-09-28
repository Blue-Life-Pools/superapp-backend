import { PropertiesService } from './properties.service';

describe('PropertiesService', () => {
  it('persists a water-body-only update including size and gallons', async () => {
    const transaction = {
      property: { update: jest.fn().mockResolvedValue({ id: 'property-1' }) },
      propertyContact: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      contact: { update: jest.fn(), create: jest.fn() },
      waterBody: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      property: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'property-1',
          contacts: [],
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
    };
    const service = new PropertiesService(
      prisma as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service, 'provisionSharePointFolder')
      .mockResolvedValue({} as never);
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 'property-1' } as never);

    await service.update('property-1', {
      waterBodies: [
        {
          name: 'Pool',
          type: 'SWIMMING_POOL',
          size: 'LARGE',
          gallons: 40000,
          active: true,
        },
        {
          name: 'Fountain',
          type: 'DECORATIVE_WATER_FEATURE',
          active: true,
        },
      ],
    });

    expect(transaction.waterBody.deleteMany).toHaveBeenCalledWith({
      where: { propertyId: 'property-1' },
    });
    expect(transaction.waterBody.createMany).toHaveBeenCalledWith({
      data: [
        {
          propertyId: 'property-1',
          name: 'Pool',
          type: 'SWIMMING_POOL',
          size: 'LARGE',
          gallons: 40000,
          active: true,
        },
        {
          propertyId: 'property-1',
          name: 'Fountain',
          type: 'DECORATIVE_WATER_FEATURE',
          size: null,
          gallons: null,
          active: true,
        },
      ],
    });
    expect(transaction.propertyContact.deleteMany).not.toHaveBeenCalled();
  });
});
