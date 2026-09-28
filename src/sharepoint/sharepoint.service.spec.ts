import { ConfigService } from '@nestjs/config';

import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { SharePointService } from './sharepoint.service';

describe('SharePoint property folder routing', () => {
  const configValues: Record<string, string> = {
    SHAREPOINT_SITE_HOSTNAME: 'example.sharepoint.com',
    SHAREPOINT_SITE_PATH: '/sites/BlueLife',
    SHAREPOINT_LIBRARY_NAME: 'Documents',
    SHAREPOINT_PARENT_FOLDER: 'Properties',
  };

  function setup(categoryName: string) {
    const config = {
      get: jest.fn((name: string) => configValues[name]),
    } as unknown as ConfigService;
    const request = jest.fn((path: string, init?: RequestInit) => {
      if (path === '/sites/example.sharepoint.com:/sites/BlueLife') {
        return { id: 'site-id' };
      }
      if (path === '/sites/site-id/drives') {
        return { value: [{ id: 'drive-id', name: 'Documents' }] };
      }
      if (path.includes('Test%20Property%20-%20(abc1234)')) {
        throw new Error('Property folder not found');
      }
      if (
        path.endsWith(`/root:/Properties/${encodeURIComponent(categoryName)}`)
      ) {
        return {
          id: 'category-id',
          name: categoryName,
          webUrl: 'category-url',
        };
      }
      if (path === '/drives/drive-id/items/category-id/children') {
        expect(init?.method).toBe('POST');
        return {
          id: 'property-folder-id',
          name: 'Property - (abc1234)',
          webUrl: 'property-url',
        };
      }
      throw new Error(`Unexpected Microsoft Graph request: ${path}`);
    });
    const graph = { request } as unknown as MicrosoftGraphService;
    return { service: new SharePointService(config, graph), request };
  }

  it.each([
    ['COMMERCIAL', '01 Propiedades Comerciales'],
    ['RESIDENTIAL', '02 Propiedades Residenciales'],
  ])('creates %s properties inside %s', async (propertyType, categoryName) => {
    const { service, request } = setup(categoryName);

    const folder = await service.createPropertyFolder(
      'abc12345-property-id',
      'Test Property',
      propertyType,
    );

    expect(folder.webUrl).toBe('property-url');
    expect(request).toHaveBeenCalledWith(
      `/drives/drive-id/root:/Properties/${encodeURIComponent(categoryName)}/Test%20Property%20-%20(abc1234)`,
      undefined,
    );
    expect(request).toHaveBeenCalledWith(
      '/drives/drive-id/items/category-id/children',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not guess a category when the property type is missing', async () => {
    const { service } = setup('01 Propiedades Comerciales');

    await expect(
      service.createPropertyFolder(
        'abc12345-property-id',
        'Test Property',
        null,
      ),
    ).rejects.toThrow('property type must be Commercial or Residential');
  });
});
