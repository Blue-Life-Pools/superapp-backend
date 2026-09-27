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

@Injectable()
export class SharePointService {
  private siteId: string | null = null;
  private driveId: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly microsoftGraph: MicrosoftGraphService,
  ) {}

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new Error(`Missing SharePoint configuration: ${name}`);
    }
    return value;
  }

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

  private async resolveDrive() {
    if (this.siteId && this.driveId) {
      return { siteId: this.siteId, driveId: this.driveId };
    }

    const hostname = this.required('SHAREPOINT_SITE_HOSTNAME');
    const sitePath = this.required('SHAREPOINT_SITE_PATH');
    const site = await this.graph<{ id: string }>(
      `/sites/${hostname}:${sitePath}`,
    );
    const drives = await this.graph<{
      value: Array<{ id: string; name: string }>;
    }>(`/sites/${site.id}/drives`);
    const libraryName = this.required('SHAREPOINT_LIBRARY_NAME');
    const drive = drives.value.find((item) => item.name === libraryName);

    if (!drive) {
      throw new Error(`SharePoint library not found: ${libraryName}`);
    }

    this.siteId = site.id;
    this.driveId = drive.id;
    return { siteId: site.id, driveId: drive.id };
  }

  async createPropertyFolder(propertyId: string, propertyName: string) {
    const { driveId } = await this.resolveDrive();
    const parentPath = this.config
      .get<string>('SHAREPOINT_PARENT_FOLDER')
      ?.trim()
      .replace(/^\/+|\/+$/g, '');
    const safeName = this.sanitizeFolderName(propertyName, 'Property');
    const sku = propertyId.slice(0, 7).toLowerCase();
    const folderName = `${safeName} - (${sku})`;
    const fullPath = [parentPath, folderName].filter(Boolean).join('/');

    try {
      return await this.graph<GraphFolder>(
        `/drives/${driveId}/root:/${this.encodePath(fullPath)}`,
      );
    } catch {
      // Continue to creation when the deterministic folder does not exist.
    }

    const parent = parentPath
      ? await this.graph<GraphFolder>(
          `/drives/${driveId}/root:/${this.encodePath(parentPath)}`,
        )
      : await this.graph<GraphFolder>(`/drives/${driveId}/root`);

    return this.graph<GraphFolder>(
      `/drives/${driveId}/items/${parent.id}/children`,
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
