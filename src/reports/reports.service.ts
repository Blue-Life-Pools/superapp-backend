import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SharePointService } from '../sharepoint/sharepoint.service';
import {
  CreateReportIncidentDto,
  UpdateReportIncidentDto,
} from './dto/report-incident.dto';
import { ReportOptionDto } from './dto/report-option.dto';
import { CreateReportUploadSessionDto } from './dto/report-attachment.dto';

const TYPE_SEEDS = [
  ['Leak', '#5bb8d4'],
  ['Pump / Motor', '#ef9f76'],
  ['Filter', '#87c69d'],
  ['Heater', '#d59ad8'],
  ['Water level', '#72a7db'],
  ['Water quality', '#e8be63'],
  ['Cleaning', '#82c8bd'],
  ['Equipment', '#e58b9c'],
  ['Electrical system', '#9f9bdc'],
  ['Disinfection system', '#76b68a'],
  ['Other', '#aeb8c4'],
] as const;

const PERSON_ROLES = ['SUPERVISOR', 'INSPECTOR', 'TECHNICIAN'] as const;
type PersonRole = (typeof PERSON_ROLES)[number];
const OPTION_COLORS = [
  '#5bb8d4',
  '#ef9f76',
  '#87c69d',
  '#d59ad8',
  '#72a7db',
  '#e8be63',
  '#82c8bd',
  '#e58b9c',
  '#9f9bdc',
  '#76b68a',
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharePoint: SharePointService,
  ) {}

  private include = {
    type: true,
    technician: true,
    supervisor: true,
    inspector: true,
    attachments: { orderBy: { createdAt: 'asc' as const } },
  } as const;

  private async ensureTypes() {
    for (const [name, color] of TYPE_SEEDS) {
      await this.prisma.reportIncidentType.upsert({
        where: { name },
        update: {},
        create: { name, color },
      });
    }
  }

  async dashboard() {
    await this.ensureTypes();
    const [incidents, people, types] = await Promise.all([
      this.prisma.reportIncident.findMany({
        include: this.include,
        orderBy: [
          { occurredAt: 'desc' },
          { status: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.reportPerson.findMany({
        where: { active: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.reportIncidentType.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { incidents, people, types };
  }

  async createIncident(data: CreateReportIncidentDto) {
    this.validateInspector(data.requiresInspector, data.inspectorId);
    await this.validatePeople(
      data.technicianId,
      data.supervisorId,
      data.inspectorId,
    );
    return this.prisma.reportIncident.create({
      data: {
        occurredAt: new Date(`${data.occurredAt}T00:00:00.000Z`),
        propertyId: data.propertyId,
        propertyName: data.propertyName.trim(),
        typeId: data.typeId,
        importance: data.importance,
        description: data.description.trim(),
        technicianId: data.technicianId,
        supervisorId: data.supervisorId,
        requiresInspector: data.requiresInspector,
        inspectorId: data.requiresInspector ? data.inspectorId : null,
        status: 'PENDING',
      },
      include: this.include,
    });
  }

  async updateIncident(id: string, data: UpdateReportIncidentDto) {
    const current = await this.prisma.reportIncident.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Report not found.');
    const requiresInspector =
      data.requiresInspector ?? current.requiresInspector;
    const inspectorId = requiresInspector
      ? (data.inspectorId ?? current.inspectorId ?? undefined)
      : undefined;
    this.validateInspector(requiresInspector, inspectorId);
    if (data.technicianId || data.supervisorId || inspectorId) {
      await this.validatePeople(
        data.technicianId ?? current.technicianId,
        data.supervisorId ?? current.supervisorId,
        inspectorId,
      );
    }
    const status = data.status ?? current.status;
    const resolution =
      data.resolution === undefined
        ? current.resolution
        : data.resolution.trim();
    if (status === 'SOLVED' && !resolution)
      throw new BadRequestException(
        'Describe what was done before solving the report.',
      );
    const requiresEstimate = data.requiresEstimate ?? current.requiresEstimate;
    const estimateNumber = data.estimateNumber?.trim() || (data.estimateNumber === '' ? null : current.estimateNumber);
    if (status === 'SOLVED' && requiresEstimate && !estimateNumber)
      throw new BadRequestException(
        'Enter the estimate number when an estimate is required.',
      );
    return this.prisma.reportIncident.update({
      where: { id },
      data: {
        occurredAt: data.occurredAt
          ? new Date(`${data.occurredAt}T00:00:00.000Z`)
          : undefined,
        propertyId: data.propertyId,
        propertyName: data.propertyName?.trim(),
        typeId: data.typeId,
        importance: data.importance,
        description: data.description?.trim(),
        technicianId: data.technicianId,
        supervisorId: data.supervisorId,
        requiresInspector: data.requiresInspector,
        inspectorId: requiresInspector ? inspectorId : null,
        status: data.status,
        resolution,
        solvedAt:
          data.status === 'SOLVED'
            ? data.solvedAt
              ? new Date(`${data.solvedAt}T00:00:00.000Z`)
              : new Date()
            : data.status === 'PENDING'
              ? null
              : undefined,
        requiresEstimate: status === 'SOLVED' ? requiresEstimate : undefined,
        estimateNumber: status === 'SOLVED' ? estimateNumber : undefined,
      },
      include: this.include,
    });
  }

  deleteIncident(id: string) {
    return this.prisma.reportIncident.delete({ where: { id } });
  }

  async createUploadSession(
    incidentId: string,
    data: CreateReportUploadSessionDto,
  ) {
    const incident = await this.prisma.reportIncident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('Report not found.');

    try {
      const propertyFolderId = await this.resolvePropertyFolder(incident);
      const session = await this.sharePoint.createReportUploadSession(
        propertyFolderId,
        incident.id,
        data.fileName,
      );
      return this.prisma.reportUploadSession.create({
        data: {
          incidentId: incident.id,
          uploadUrl: session.uploadUrl,
          originalFileName: data.fileName,
          uploadFileName: session.uploadFileName,
          mimeType: data.mimeType,
          size: data.size,
          expiresAt: new Date(session.expirationDateTime),
        },
        select: { id: true, size: true, nextByte: true, expiresAt: true },
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadGatewayException(
        'The SharePoint upload session could not be created.',
      );
    }
  }

  async uploadChunk(incidentId: string, sessionId: string, content: Buffer) {
    const session = await this.prisma.reportUploadSession.findFirst({
      where: { id: sessionId, incidentId },
    });
    if (!session) throw new NotFoundException('Upload session not found.');
    if (session.expiresAt <= new Date())
      throw new BadRequestException(
        'The upload session expired. Please select the file again.',
      );
    if (session.nextByte + content.length > session.size)
      throw new BadRequestException(
        'The file chunk exceeds the expected file size.',
      );

    try {
      const result = await this.sharePoint.uploadReportChunk(
        session.uploadUrl,
        content,
        session.nextByte,
        session.size,
      );
      if (!result.complete) {
        await this.prisma.reportUploadSession.update({
          where: { id: session.id },
          data: { nextByte: session.nextByte + content.length },
        });
        return { complete: false, nextByte: session.nextByte + content.length };
      }

      const attachment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.reportAttachment.create({
          data: {
            incidentId,
            fileName: session.originalFileName,
            mimeType: session.mimeType,
            size: session.size,
            sharepointItemId: result.item.id,
            sharepointWebUrl: result.item.webUrl,
          },
        });
        await tx.reportUploadSession.delete({ where: { id: session.id } });
        return created;
      });
      return { complete: true, attachment };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadGatewayException(
        'The file chunk could not be uploaded to SharePoint.',
      );
    }
  }

  private async resolvePropertyFolder(incident: {
    propertyId: string | null;
    propertyName: string;
  }) {
    const property = incident.propertyId
      ? await this.prisma.property.findFirst({
          where: { id: incident.propertyId, deletedAt: null },
        })
      : await this.prisma.property.findFirst({
          where: {
            name: { equals: incident.propertyName, mode: 'insensitive' },
            deletedAt: null,
          },
        });
    if (!property)
      throw new BadRequestException(
        'Select a property registered in Commercial before uploading files.',
      );

    let propertyFolderId = property.sharepointFolderId;
    let propertyFolderUrl = property.sharepointFolderUrl;
    if (!propertyFolderId && propertyFolderUrl) {
      const resolved =
        await this.sharePoint.resolveFolderFromWebUrl(propertyFolderUrl);
      propertyFolderId = resolved.id;
      propertyFolderUrl = resolved.webUrl;
    }
    if (!propertyFolderId) {
      const created = await this.sharePoint.createPropertyFolder(
        property.id,
        property.name,
      );
      propertyFolderId = created.id;
      propertyFolderUrl = created.webUrl;
    }
    if (
      !property.sharepointFolderId ||
      property.sharepointFolderUrl !== propertyFolderUrl
    ) {
      await this.prisma.property.update({
        where: { id: property.id },
        data: {
          sharepointFolderId: propertyFolderId,
          sharepointFolderUrl: propertyFolderUrl,
        },
      });
    }
    return propertyFolderId;
  }

  async createOption(kind: string, data: ReportOptionDto) {
    const name = data.name.trim();
    if (kind === 'type') {
      const color = data.color || (await this.nextColor('type'));
      return this.prisma.reportIncidentType.upsert({
        where: { name },
        update: { active: true, color },
        create: { name, color },
      });
    }
    const role = this.personRole(kind);
    if (role === 'TECHNICIAN' && data.defaultSupervisorId)
      await this.assertRole(data.defaultSupervisorId, 'SUPERVISOR');
    const color = data.color || (await this.nextColor(role));
    return this.prisma.reportPerson.upsert({
      where: { role_name: { role, name } },
      update: {
        active: true,
        color,
        defaultSupervisorId:
          role === 'TECHNICIAN' ? data.defaultSupervisorId : null,
      },
      create: {
        name,
        role,
        color,
        defaultSupervisorId:
          role === 'TECHNICIAN' ? data.defaultSupervisorId : null,
      },
    });
  }

  async updateOption(kind: string, id: string, data: ReportOptionDto) {
    if (kind === 'type')
      return this.prisma.reportIncidentType.update({
        where: { id },
        data: { name: data.name.trim(), color: data.color },
      });
    const role = this.personRole(kind);
    if (role === 'TECHNICIAN' && data.defaultSupervisorId)
      await this.assertRole(data.defaultSupervisorId, 'SUPERVISOR');
    return this.prisma.reportPerson.update({
      where: { id, role },
      data: {
        name: data.name.trim(),
        color: data.color,
        defaultSupervisorId:
          role === 'TECHNICIAN' ? (data.defaultSupervisorId ?? null) : null,
      },
    });
  }

  async deleteOption(kind: string, id: string) {
    if (kind === 'type')
      return this.prisma.reportIncidentType.update({
        where: { id },
        data: { active: false },
      });
    return this.prisma.reportPerson.update({
      where: { id, role: this.personRole(kind) },
      data: { active: false, defaultSupervisorId: null },
    });
  }

  private personRole(kind: string): PersonRole {
    const role = kind.toUpperCase() as PersonRole;
    if (!PERSON_ROLES.includes(role))
      throw new BadRequestException('Invalid configuration list.');
    return role;
  }

  private validateInspector(required: boolean, inspectorId?: string | null) {
    if (required && !inspectorId)
      throw new BadRequestException(
        'Select an inspector when inspection is required.',
      );
  }

  private async validatePeople(
    technicianId: string,
    supervisorId: string,
    inspectorId?: string | null,
  ) {
    await Promise.all([
      this.assertRole(technicianId, 'TECHNICIAN'),
      this.assertRole(supervisorId, 'SUPERVISOR'),
      inspectorId
        ? this.assertRole(inspectorId, 'INSPECTOR')
        : Promise.resolve(),
    ]);
  }

  private async assertRole(id: string, role: PersonRole) {
    const person = await this.prisma.reportPerson.findFirst({
      where: { id, role, active: true },
    });
    if (!person)
      throw new BadRequestException(`Invalid ${role.toLowerCase()}.`);
  }

  private async nextColor(kind: PersonRole | 'type') {
    const count =
      kind === 'type'
        ? await this.prisma.reportIncidentType.count({
            where: { active: true },
          })
        : await this.prisma.reportPerson.count({
            where: { role: kind, active: true },
          });
    return OPTION_COLORS[count % OPTION_COLORS.length];
  }
}
