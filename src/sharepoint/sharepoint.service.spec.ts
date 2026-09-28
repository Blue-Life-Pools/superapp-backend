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

  function setup(
    categoryName: string,
    configuredParentFolder = configValues.SHAREPOINT_PARENT_FOLDER,
    configOverrides: Record<string, string> = {},
    childFolders: Array<{
      id: string;
      name: string;
      webUrl: string;
      folder: object;
    }> = [],
  ) {
    const values = { ...configValues, ...configOverrides };
    const config = {
      get: jest.fn((name: string) =>
        name === 'SHAREPOINT_PARENT_FOLDER'
          ? configuredParentFolder
          : values[name],
      ),
    } as unknown as ConfigService;
    const request = jest.fn((path: string, init?: RequestInit) => {
      if (path.startsWith('/sites/') && !path.endsWith('/drives')) {
        return { id: 'site-id' };
      }
      if (path === '/sites/site-id/drives') {
        return { value: [{ id: 'drive-id', name: 'Documents' }] };
      }
      if (path === '/drives/drive-id/root/children?$select=id,name,folder') {
        return {
          value: [
            {
              id: 'commercial-id',
              name: '01 Propiedades Comerciales',
              webUrl: 'commercial-url',
              folder: {},
            },
            {
              id: 'residential-id',
              name: '02 Propiedades Residenciales',
              webUrl: 'residential-url',
              folder: {},
            },
          ],
        };
      }
      if (path.includes('Test%20Property%20-%20(abc1234)')) {
        throw new Error('Property folder not found');
      }
      if (path.endsWith(`/${encodeURIComponent(categoryName)}`)) {
        return {
          id: 'category-id',
          name: categoryName,
          webUrl: 'category-url',
        };
      }
      if (
        path ===
        '/drives/drive-id/items/category-id/children?$select=id,name,webUrl,folder&$top=999'
      ) {
        return { value: childFolders };
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

  it('replaces a legacy Commercial parent with the Residential sibling', async () => {
    const categoryName = '02 Propiedades Residenciales';
    const { service, request } = setup(
      categoryName,
      '01 Propiedades Comerciales',
    );

    await service.createPropertyFolder(
      'abc12345-property-id',
      'Test Property',
      'RESIDENTIAL',
    );

    expect(request).toHaveBeenCalledWith(
      `/drives/drive-id/root:/${encodeURIComponent(categoryName)}/Test%20Property%20-%20(abc1234)`,
      undefined,
    );
    expect(request).toHaveBeenCalledWith(
      `/drives/drive-id/root:/${encodeURIComponent(categoryName)}`,
      undefined,
    );
  });

  it('normalizes a legacy SharePoint URL and infers its document library', async () => {
    const categoryName = '02 Propiedades Residenciales';
    const { service, request } = setup(categoryName, 'Properties', {
      SHAREPOINT_SITE_HOSTNAME: 'https://example.sharepoint.com',
      SHAREPOINT_SITE_PATH:
        '/BlueLife/Documents/Forms/AllItems.aspx?id=%2Fsites%2FBlueLife',
      SHAREPOINT_LIBRARY_NAME: '01 Propiedades Comerciales',
    });

    await service.createPropertyFolder(
      'abc12345-property-id',
      'Test Property',
      'RESIDENTIAL',
    );

    expect(request).toHaveBeenCalledWith(
      '/sites/example.sharepoint.com:/sites/BlueLife',
      undefined,
    );
    expect(request).toHaveBeenCalledWith('/sites/site-id/drives', undefined);
  });

  it('finds the document library that contains both category folders', async () => {
    const categoryName = '01 Propiedades Comerciales';
    const { service, request } = setup(categoryName, 'Properties', {
      SHAREPOINT_LIBRARY_NAME: '01 Propiedades Comerciales',
    });

    await service.createPropertyFolder(
      'abc12345-property-id',
      'Test Property',
      'COMMERCIAL',
    );

    expect(request).toHaveBeenCalledWith(
      '/drives/drive-id/root/children?$select=id,name,folder',
      undefined,
    );
  });

  it('uses the BlueLife SharePoint location when Vercel settings are empty', async () => {
    const categoryName = '02 Propiedades Residenciales';
    const { service, request } = setup(categoryName, '', {
      SHAREPOINT_SITE_HOSTNAME: '',
      SHAREPOINT_SITE_PATH: '',
      SHAREPOINT_LIBRARY_NAME: '',
    });

    await service.createPropertyFolder(
      'abc12345-property-id',
      'Test Property',
      'RESIDENTIAL',
    );

    expect(request).toHaveBeenCalledWith(
      '/sites/bluelifepools.sharepoint.com:/sites/finanzas',
      undefined,
    );
  });

  it('matches an existing folder using the normalized property name', async () => {
    const categoryName = '01 Propiedades Comerciales';
    const { service } = setup(categoryName, 'Properties', {}, [
      {
        id: 'central-apartments-folder',
        name: '1701 Central-Apartments',
        webUrl: 'https://sharepoint/1701-central-apartments',
        folder: {},
      },
    ]);

    const result = await service.matchExistingPropertyFolders([
      {
        id: 'central-apartments-property',
        name: '1701 CENTRAL APARTMENTS',
        propertyType: 'COMMERCIAL',
      },
      {
        id: 'different-property',
        name: '1701 CENTRAL APARTMENTS NORTH',
        propertyType: 'COMMERCIAL',
      },
    ]);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].propertyId).toBe('central-apartments-property');
    expect(result.matches[0].folder.id).toBe('central-apartments-folder');
  });

  it('does not match duplicate property names to the same folder', async () => {
    const categoryName = '01 Propiedades Comerciales';
    const { service } = setup(categoryName, 'Properties', {}, [
      {
        id: 'central-apartments-folder',
        name: '1701 CENTRAL APARTMENTS',
        webUrl: 'https://sharepoint/1701-central-apartments',
        folder: {},
      },
    ]);

    const result = await service.matchExistingPropertyFolders([
      {
        id: 'duplicate-1',
        name: '1701 CENTRAL APARTMENTS',
        propertyType: 'COMMERCIAL',
      },
      {
        id: 'duplicate-2',
        name: '1701 central apartments',
        propertyType: 'COMMERCIAL',
      },
    ]);

    expect(result.matches).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(2);
  });
});
