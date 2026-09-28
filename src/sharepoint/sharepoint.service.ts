import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';

type GraphFolder = {
  id: string;
  name: string;
  webUrl: string;
  folder?: unknown;
};

type GraphChildrenResponse = {
  value: GraphFolder[];
};

type GraphDrive = {
  id: string;
  name: string;
};

const PROPERTY_CATEGORY_FOLDERS = {
  COMMERCIAL: '01 Propiedades Comerciales',
  RESIDENTIAL: '02 Propiedades Residenciales',
} as const;

const DEFAULT_SHAREPOINT_LOCATION = {
  hostname: 'bluelifepools.sharepoint.com',
  sitePath: '/sites/finanzas',
  libraryName: 'Documentos Propiedades',
} as const;

@Injectable()
export class SharePointService {
  private siteId: string | null = null;
  private driveId: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly microsoftGraph: MicrosoftGraphService,
  ) {}

  private async graph<T>(path: string, init?: RequestInit): Promise<T> {
    return this.microsoftGraph.request<T>(path, init);
  }

  private encodePath(path: string) {
    return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  private sanitizeFolderName(value: string, fallback: string) {
    return (
      value
        .replace(/["*:<>?/\\|#%]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '') || fallback
    );
  }

  private sharePointLocation() {
    const configuredHostname =
      this.config.get<string>('SHAREPOINT_SITE_HOSTNAME')?.trim() ||
      DEFAULT_SHAREPOINT_LOCATION.hostname;
    let hostname = configuredHostname.replace(/^https?:\/\//i, '');
    hostname = hostname.split('/')[0].trim();

    const configuredSitePath =
      this.config.get<string>('SHAREPOINT_SITE_PATH')?.trim() ||
      DEFAULT_SHAREPOINT_LOCATION.sitePath;
    let pathname = configuredSitePath;
    try {
      if (/^https?:\/\//i.test(configuredSitePath)) {
        pathname = new URL(configuredSitePath).pathname;
      }
    } catch {
      // Continue with the configured value so the validation below can report it.
    }

    pathname = pathname.split('?')[0].replace(/^\/+|\/+$/g, '');
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // Keep the original path if it contains a malformed escape sequence.
    }

    const segments = pathname.split('/').filter(Boolean);
    const siteRootIndex = segments.findIndex((segment) =>
      ['sites', 'teams'].includes(segment.toLocaleLowerCase()),
    );
    let sitePath: string;
    let inferredLibraryName: string | undefined;

    if (siteRootIndex >= 0 && segments[siteRootIndex + 1]) {
      sitePath = `/${segments[siteRootIndex]}/${segments[siteRootIndex + 1]}`;
      inferredLibraryName = segments[siteRootIndex + 2];
    } else {
      const formsIndex = segments.findIndex(
        (segment) => segment.toLocaleLowerCase() === 'forms',
      );
      if (formsIndex >= 2) {
        sitePath = `/sites/${segments[0]}`;
        inferredLibraryName = segments[1];
      } else {
        sitePath = `/${segments.join('/')}`;
      }
    }

    if (!hostname || sitePath === '/') {
      throw new Error('Invalid SharePoint site configuration.');
    }

    return { hostname, sitePath, inferredLibraryName };
  }

  private propertyCategoryFolder(propertyType: string | null | undefined) {
    const normalizedType = propertyType?.trim().toUpperCase();
    if (normalizedType !== 'COMMERCIAL' && normalizedType !== 'RESIDENTIAL') {
      throw new Error(
        'The property type must be Commercial or Residential before creating its SharePoint folder.',
      );
    }

    return PROPERTY_CATEGORY_FOLDERS[normalizedType];
  }

  private propertyCategoryPaths(
    configuredParentPath: string | undefined,
    categoryFolderName: string,
  ) {
    const parentSegments = (configuredParentPath ?? '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const categoryNames = new Set(
      Object.values(PROPERTY_CATEGORY_FOLDERS).map((name) =>
        name.toLocaleLowerCase(),
      ),
    );

    if (
      parentSegments.length > 0 &&
      categoryNames.has(
        parentSegments[parentSegments.length - 1].toLocaleLowerCase(),
      )
    ) {
      parentSegments.pop();
    }

    return {
      categoryParentPath: parentSegments.join('/'),
      categoryPath: [...parentSegments, categoryFolderName].join('/'),
    };
  }

  private async resolveDrive() {
    if (this.siteId && this.driveId) {
      return { siteId: this.siteId, driveId: this.driveId };
    }

    const { hostname, sitePath, inferredLibraryName } =
      this.sharePointLocation();
    const site = await this.graph<{ id: string }>(
      `/sites/${hostname}:${sitePath}`,
    );
    const drives = await this.graph<{
      value: GraphDrive[];
    }>(`/sites/${site.id}/drives`);
    const libraryName =
      this.config.get<string>('SHAREPOINT_LIBRARY_NAME')?.trim() ||
      DEFAULT_SHAREPOINT_LOCATION.libraryName;
    const categoryNames = new Set(
      Object.values(PROPERTY_CATEGORY_FOLDERS).map((name) =>
        name.toLocaleLowerCase(),
      ),
    );
    const isLegacyCategoryName = categoryNames.has(
      libraryName.toLocaleLowerCase(),
    );
    let drive = isLegacyCategoryName
      ? undefined
      : drives.value.find(
          (item) =>
            item.name.toLocaleLowerCase() === libraryName.toLocaleLowerCase(),
        );

    if (!drive && inferredLibraryName) {
      drive = drives.value.find(
        (item) =>
          item.name.toLocaleLowerCase() ===
          inferredLibraryName.toLocaleLowerCase(),
      );
    }

    if (!drive) {
      for (const candidate of drives.value) {
        try {
          const rootFolders = await this.graph<GraphChildrenResponse>(
            `/drives/${candidate.id}/root/children?$select=id,name,folder`,
          );
          const folderNames = new Set(
            rootFolders.value
              .filter((item) => Boolean(item.folder))
              .map((item) => item.name.toLocaleLowerCase()),
          );
          if (
            [...categoryNames].every((categoryName) =>
              folderNames.has(categoryName),
            )
          ) {
            drive = candidate;
            break;
          }
        } catch {
          // Continue looking in the other document libraries.
        }
      }
    }

    if (!drive && isLegacyCategoryName) {
      drive = drives.value.find(
        (item) =>
          item.name.toLocaleLowerCase() === libraryName.toLocaleLowerCase(),
      );
    }

    if (!drive) {
      throw new Error(`SharePoint library not found: ${libraryName}`);
    }

    this.siteId = site.id;
    this.driveId = drive.id;
    return { siteId: site.id, driveId: drive.id };
  }

  async createPropertyFolder(
    propertyId: string,
    propertyName: string,
    propertyType: string | null | undefined,
  ) {
    const { driveId } = await this.resolveDrive();
    const parentPath = this.config
      .get<string>('SHAREPOINT_PARENT_FOLDER')
      ?.trim()
      .replace(/^\/+|\/+$/g, '');
    const categoryFolderName = this.propertyCategoryFolder(propertyType);
    const { categoryParentPath, categoryPath } = this.propertyCategoryPaths(
      parentPath,
      categoryFolderName,
    );
    const safeName = this.sanitizeFolderName(propertyName, 'Property');
    const sku = propertyId.slice(0, 7).toLowerCase();
    const folderName = `${safeName} - (${sku})`;
    const fullPath = [categoryPath, folderName].filter(Boolean).join('/');

    try {
      return await this.graph<GraphFolder>(
        `/drives/${driveId}/root:/${this.encodePath(fullPath)}`,
      );
    } catch {
      // Continue to creation when the deterministic folder does not exist.
    }

    let categoryFolder: GraphFolder;
    try {
      categoryFolder = await this.graph<GraphFolder>(
        `/drives/${driveId}/root:/${this.encodePath(categoryPath)}`,
      );
    } catch {
      const parent = categoryParentPath
        ? await this.graph<GraphFolder>(
            `/drives/${driveId}/root:/${this.encodePath(categoryParentPath)}`,
          )
        : await this.graph<GraphFolder>(`/drives/${driveId}/root`);

      categoryFolder = await this.graph<GraphFolder>(
        `/drives/${driveId}/items/${parent.id}/children`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: categoryFolderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          }),
        },
      );
    }

    return this.graph<GraphFolder>(
      `/drives/${driveId}/items/${categoryFolder.id}/children`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
    );
  }

  async resolveFolderFromWebUrl(webUrl: string) {
    const shareId = `u!${Buffer.from(webUrl, 'utf8')
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\//g, '_')
      .replace(/\+/g, '-')}`;
    const folder = await this.graph<GraphFolder>(
      `/shares/${shareId}/driveItem?$select=id,name,webUrl,folder`,
    );

    if (!folder.folder) {
      throw new Error('The SharePoint URL does not point to a folder.');
    }
    return folder;
  }

  async ensureWaterBodyFolders(
    propertyFolderId: string,
    waterBodyNames: string[],
  ) {
    if (waterBodyNames.length === 0) return [];

    const { driveId } = await this.resolveDrive();
    const requestedNames = Array.from(
      new Set(
        waterBodyNames
          .map((name) => this.sanitizeFolderName(name, 'Water Body'))
          .filter(Boolean),
      ),
    );
    const children = await this.graph<GraphChildrenResponse>(
      `/drives/${driveId}/items/${propertyFolderId}/children?$select=id,name,webUrl,folder`,
    );
    const foldersByName = new Map(
      children.value
        .filter((item) => Boolean(item.folder))
        .map((item) => [item.name.toLocaleLowerCase(), item]),
    );

    for (const folderName of requestedNames) {
      const key = folderName.toLocaleLowerCase();
      if (foldersByName.has(key)) continue;

      const folder = await this.graph<GraphFolder>(
        `/drives/${driveId}/items/${propertyFolderId}/children`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          }),
        },
      );
      foldersByName.set(key, folder);
    }

    return requestedNames.map((folderName) =>
      foldersByName.get(folderName.toLocaleLowerCase()),
    );
  }

  async ensureProposalsFolder(propertyFolderId: string) {
    const [folder] = await this.ensureWaterBodyFolders(propertyFolderId, [
      'Proposals',
    ]);
    if (!folder) {
      throw new Error('The Proposals folder could not be created.');
    }
    return folder;
  }

  async ensureReportsFolder(propertyFolderId: string) {
    const [folder] = await this.ensureWaterBodyFolders(propertyFolderId, [
      'Reportes',
    ]);
    if (!folder) {
      throw new Error('The Reportes folder could not be created.');
    }
    return folder;
  }

  async createReportUploadSession(
    propertyFolderId: string,
    incidentId: string,
    originalFileName: string,
  ) {
    const { driveId } = await this.resolveDrive();
    const reportsFolder = await this.ensureReportsFolder(propertyFolderId);
    const safeFileName = this.sanitizeFolderName(
      originalFileName.split(/[\\/]/).pop() ?? '',
      'attachment',
    );
    const uploadFileName = `${incidentId.slice(0, 8)}-${Date.now()}-${safeFileName}`;
    const session = await this.graph<{
      uploadUrl: string;
      expirationDateTime: string;
    }>(
      `/drives/${driveId}/items/${reportsFolder.id}:/${encodeURIComponent(uploadFileName)}:/createUploadSession`,
      {
        method: 'POST',
        body: JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'rename' },
        }),
      },
    );
    return { ...session, uploadFileName };
  }

  async uploadReportChunk(
    uploadUrl: string,
    content: Buffer,
    start: number,
    total: number,
  ) {
    const end = start + content.length - 1;
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(content.length),
        'Content-Range': `bytes ${start}-${end}/${total}`,
      },
      body: content as unknown as BodyInit,
    });
    if (response.status === 202) return { complete: false as const };
    if (!response.ok) {
      throw new Error(
        `Microsoft Graph chunk upload failed (${response.status})`,
      );
    }
    return {
      complete: true as const,
      item: (await response.json()) as GraphFolder,
    };
  }

  private async uploadFile(
    folderId: string,
    fileName: string,
    content: Buffer,
    contentType: string,
  ) {
    const { driveId } = await this.resolveDrive();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${await this.microsoftGraph.getAccessToken()}`,
          'Content-Type': contentType,
        },
        body: content as unknown as BodyInit,
      },
    );

    if (!response.ok) {
      throw new Error(`Microsoft Graph upload failed (${response.status})`);
    }

    return (await response.json()) as GraphFolder;
  }

  async uploadWaterBodyPhoto(
    waterBodyFolderId: string,
    originalFileName: string,
    content: Buffer,
    contentType: string,
  ) {
    const safeFileName = this.sanitizeFolderName(
      originalFileName.split(/[\\/]/).pop() ?? '',
      'photo',
    );
    const uploadName = `${Date.now()}-${safeFileName}`;
    return this.uploadFile(waterBodyFolderId, uploadName, content, contentType);
  }

  async uploadProposalPdf(
    propertyFolderId: string,
    activityId: string,
    originalFileName: string,
    content: Buffer,
  ) {
    const proposalsFolder = await this.ensureProposalsFolder(propertyFolderId);
    const safeFileName = this.sanitizeFolderName(
      originalFileName.split(/[\\/]/).pop() ?? '',
      'proposal.pdf',
    );
    const baseName = safeFileName.toLowerCase().endsWith('.pdf')
      ? safeFileName.slice(0, -4)
      : safeFileName;
    const uploadName = `${baseName}-${activityId.slice(0, 8)}.pdf`;

    return this.uploadFile(
      proposalsFolder.id,
      uploadName,
      content,
      'application/pdf',
    );
  }
}
