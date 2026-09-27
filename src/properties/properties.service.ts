import {
  BadRequestException,
  Injectable,
  NotFoundException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { SharePointService } from '../sharepoint/sharepoint.service';
import { CreateSalesActivityDto } from './dto/create-sales-activity.dto';
import { CreateProposalFollowUpDto } from './dto/create-proposal-follow-up.dto';
import { UpdateSalesActivityDto } from './dto/update-sales-activity.dto';
import { CreateProposalEmailDraftDto } from './dto/create-proposal-email-draft.dto';
import { EmailDraftsService } from '../email-drafts/email-drafts.service';

type UploadedImageFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

type UploadedProposalFile = {
  buffer: Buffer;
  originalname: string;
};

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharePoint: SharePointService,
    private readonly emailDrafts: EmailDraftsService,
  ) {}

  findAll() {
    return this.prisma.property.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },

      include: {
        managementCompany: true,

        contacts: {
          include: {
            contact: true,
          },
        },

        waterBodies: true,

        salesActivities: {
          orderBy: {
            occurredAt: 'desc',
          },
          include: {
            followUps: {
              orderBy: {
                occurredAt: 'desc',
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: {
        id,
      },

      include: {
        managementCompany: true,

        contacts: {
          include: {
            contact: true,
          },
        },

        waterBodies: true,

        salesActivities: {
          orderBy: {
            occurredAt: 'desc',
          },
          include: {
            followUps: {
              orderBy: {
                occurredAt: 'desc',
              },
            },
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`No se encontró la propiedad con id ${id}`);
    }

    return property;
  }

  async create(data: CreatePropertyDto) {
    const { contacts, waterBodies, managementCompanyName, ...propertyData } =
      data;
    const normalizedManagementCompanyName = managementCompanyName?.trim();
    const normalizedEmails = contacts.map((contact) =>
      contact.email.trim().toLowerCase(),
    );

    if (!contacts.some((contact) => contact.role === 'PROPERTY_MANAGER')) {
      throw new BadRequestException(
        'At least one Property Manager contact is required.',
      );
    }

    if (new Set(normalizedEmails).size !== normalizedEmails.length) {
      throw new BadRequestException(
        'Contact email addresses cannot be duplicated.',
      );
    }

    if (contacts.filter((contact) => contact.isPrimary).length > 1) {
      throw new BadRequestException('Only one contact can be primary.');
    }

    const requestedPrimaryIndex = contacts.findIndex(
      (contact) => contact.isPrimary,
    );
    const primaryIndex =
      requestedPrimaryIndex >= 0
        ? requestedPrimaryIndex
        : contacts.findIndex((contact) => contact.role === 'PROPERTY_MANAGER');

    const property = await this.prisma.property.create({
      data: {
        ...propertyData,
        ...(normalizedManagementCompanyName
          ? {
              managementCompany: {
                connectOrCreate: {
                  where: { name: normalizedManagementCompanyName },
                  create: { name: normalizedManagementCompanyName },
                },
              },
            }
          : {}),
        contacts: {
          create: contacts.map((contact, index) => ({
            role: contact.role,
            isPrimary: index === primaryIndex,
            contact: {
              create: {
                firstName: contact.firstName?.trim() || null,
                lastName: contact.lastName?.trim() || null,
                email: contact.email.trim().toLowerCase(),
                phone: contact.phone?.trim() || null,
              },
            },
          })),
        },
        ...(waterBodies
          ? {
              waterBodies: {
                create: waterBodies.map((waterBody) => ({
                  name: waterBody.name.trim(),
                  type: waterBody.type,
                  size: waterBody.size ?? null,
                  gallons: waterBody.gallons ?? null,
                  active: waterBody.active ?? true,
                })),
              },
            }
          : {}),
      },
      include: {
        managementCompany: true,
        contacts: {
          include: {
            contact: true,
          },
        },
        waterBodies: true,
        salesActivities: {
          include: {
            followUps: {
              orderBy: {
                occurredAt: 'desc',
              },
            },
          },
        },
      },
    });

    try {
      return await this.provisionSharePointFolder(property.id);
    } catch (error) {
      this.logger.error(
        `SharePoint folder creation failed for property ${property.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      return property;
    }
  }

  async provisionSharePointFolder(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: { waterBodies: true },
    });

    if (!property) {
      throw new NotFoundException(`No se encontró la propiedad con id ${id}`);
    }

    try {
      let propertyFolderId = property.sharepointFolderId;
      let propertyFolderUrl = property.sharepointFolderUrl;

      if (!propertyFolderId) {
        if (propertyFolderUrl) {
          const resolvedFolder =
            await this.sharePoint.resolveFolderFromWebUrl(propertyFolderUrl);
          propertyFolderId = resolvedFolder.id;
          propertyFolderUrl = resolvedFolder.webUrl;
        }

        if (!propertyFolderId) {
          const createdFolder = await this.sharePoint.createPropertyFolder(
            property.id,
            property.name,
          );
          propertyFolderId = createdFolder.id;
          propertyFolderUrl = createdFolder.webUrl;
        }

        await this.prisma.property.update({
          where: { id },
          data: {
            sharepointFolderId: propertyFolderId,
            sharepointFolderUrl: propertyFolderUrl,
          },
        });
      }

      if (!propertyFolderId) {
        throw new Error('The property SharePoint folder is not available.');
      }

      await this.sharePoint.ensureWaterBodyFolders(
        propertyFolderId,
        property.waterBodies.map((waterBody) => waterBody.name),
      );
      return this.findOne(id);
    } catch (error) {
      this.logger.error(
        `SharePoint provisioning failed for property ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'The SharePoint folder could not be created.',
      );
    }
  }

  async uploadWaterBodyPhoto(
    propertyId: string,
    waterBodyId: string,
    file: UploadedImageFile,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      include: { waterBodies: true },
    });
    const waterBody = property?.waterBodies.find(
      (item) => item.id === waterBodyId,
    );

    if (!property || !waterBody) {
      throw new NotFoundException(
        'The water body does not belong to this property.',
      );
    }

    try {
      let propertyFolderId = property.sharepointFolderId;

      if (!propertyFolderId || !property.sharepointFolderUrl) {
        await this.provisionSharePointFolder(propertyId);
        const refreshedProperty = await this.prisma.property.findUnique({
          where: { id: propertyId },
        });
        propertyFolderId = refreshedProperty?.sharepointFolderId ?? null;
      }

      if (!propertyFolderId) {
        throw new Error('The property SharePoint folder is not available.');
      }

      const [waterBodyFolder] = await this.sharePoint.ensureWaterBodyFolders(
        propertyFolderId,
        [waterBody.name],
      );

      if (!waterBodyFolder) {
        throw new Error('The water body SharePoint folder is not available.');
      }

      return await this.sharePoint.uploadWaterBodyPhoto(
        waterBodyFolder.id,
        file.originalname,
        file.buffer,
        file.mimetype,
      );
    } catch (error) {
      this.logger.error(
        `Water body photo upload failed for property ${propertyId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'The water body photo could not be uploaded.',
      );
    }
  }

  async storeProposalPdf(
    propertyId: string,
    activityId: string,
    file: UploadedProposalFile,
  ) {
    const [property, activity] = await Promise.all([
      this.prisma.property.findFirst({
        where: { id: propertyId, deletedAt: null },
      }),
      this.prisma.salesActivity.findFirst({
        where: {
          id: activityId,
          propertyId,
          type: 'PROPOSAL',
        },
      }),
    ]);

    if (!property || !activity) {
      throw new NotFoundException('Proposal not found for this property.');
    }

    try {
      let propertyFolderId = property.sharepointFolderId;
      if (!propertyFolderId) {
        await this.provisionSharePointFolder(propertyId);
        const refreshedProperty = await this.prisma.property.findUnique({
          where: { id: propertyId },
          select: { sharepointFolderId: true },
        });
        propertyFolderId = refreshedProperty?.sharepointFolderId ?? null;
      }

      if (!propertyFolderId) {
        throw new Error('The property SharePoint folder is not available.');
      }

      const uploaded = await this.sharePoint.uploadProposalPdf(
        propertyFolderId,
        activityId,
        file.originalname,
        file.buffer,
      );

      return this.prisma.salesActivity.update({
        where: { id: activityId },
        data: {
          proposalPdfSharepointId: uploaded.id,
          proposalPdfSharepointUrl: uploaded.webUrl,
          proposalPdfFileName: uploaded.name,
          proposalPdfUploadedAt: new Date(),
        },
        include: {
          followUps: {
            orderBy: {
              occurredAt: 'desc',
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Proposal PDF SharePoint upload failed for proposal ${activityId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'The proposal PDF could not be saved to SharePoint.',
      );
    }
  }

  async createSalesActivity(propertyId: string, data: CreateSalesActivityDto) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
    });

    if (!property) {
      throw new NotFoundException(
        `No se encontró la propiedad con id ${propertyId}`,
      );
    }

    return this.prisma.salesActivity.create({
      data: {
        propertyId,
        type: data.type,
        notes: data.notes,
        proposalData: data.proposalData as Prisma.InputJsonObject | undefined,
        occurredAt: new Date(),
      },
    });
  }

  async createProposalEmailDraft(
    propertyId: string,
    activityId: string,
    data: CreateProposalEmailDraftDto,
    file: UploadedProposalFile,
  ) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: {
        id: activityId,
        propertyId,
        type: 'PROPOSAL',
      },
    });

    if (!activity) {
      throw new NotFoundException('Proposal not found for this property.');
    }

    await this.storeProposalPdf(propertyId, activityId, file);

    try {
      const draft = await this.emailDrafts.createProposalDraft({
        ...data,
        fileName: file.originalname,
        content: file.buffer,
      });

      return this.prisma.salesActivity.update({
        where: { id: activityId },
        data: {
          emailDraftId: draft.id,
          emailDraftWebUrl: draft.webLink,
          emailDraftCreatedAt: new Date(),
          emailDraftFileName: file.originalname,
        },
        include: {
          followUps: {
            orderBy: {
              occurredAt: 'desc',
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Outlook draft creation failed for proposal ${activityId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'The proposal was saved, but the Outlook draft could not be created.',
      );
    }
  }

  async updateSalesActivityStatus(
    propertyId: string,
    activityId: string,
    status: 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED',
  ) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });

    if (!activity) {
      throw new NotFoundException('Proposal not found for this property.');
    }

    const now = new Date();
    return this.prisma.salesActivity.update({
      where: { id: activityId },
      data: {
        status,
        ...(status === 'CREATED'
          ? { sentAt: null, approvedAt: null, rejectedAt: null }
          : {}),
        ...(status === 'SENT'
          ? { sentAt: now, approvedAt: null, rejectedAt: null }
          : {}),
        ...(status === 'APPROVED'
          ? {
              approvedAt: activity.approvedAt ?? now,
              rejectedAt: null,
              sentAt: activity.sentAt ?? now,
            }
          : {}),
        ...(status === 'REJECTED'
          ? {
              rejectedAt: activity.rejectedAt ?? now,
              approvedAt: null,
              sentAt: activity.sentAt ?? now,
            }
          : {}),
        ...(status === 'EXPIRED'
          ? {
              approvedAt: null,
              rejectedAt: null,
              sentAt: activity.sentAt ?? now,
            }
          : {}),
      },
      include: {
        followUps: {
          orderBy: {
            occurredAt: 'desc',
          },
        },
      },
    });
  }

  async createProposalFollowUp(
    propertyId: string,
    activityId: string,
    data: CreateProposalFollowUpDto,
  ) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });

    if (!activity) {
      throw new NotFoundException('Proposal not found for this property.');
    }

    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.proposalFollowUp.create({
        data: {
          salesActivityId: activityId,
          occurredAt: now,
          notes: data.notes?.trim() || null,
          channel: data.channel ?? 'EMAIL',
        },
      });

      return transaction.salesActivity.update({
        where: { id: activityId },
        data: {
          status: 'SENT',
          sentAt: now,
          approvedAt: null,
          rejectedAt: null,
        },
        include: {
          followUps: {
            orderBy: {
              occurredAt: 'desc',
            },
          },
        },
      });
    });
  }

  async updateSalesActivity(
    propertyId: string,
    activityId: string,
    data: UpdateSalesActivityDto,
  ) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });
    if (!activity) {
      throw new NotFoundException(
        'Sales activity not found for this property.',
      );
    }
    return this.prisma.salesActivity.update({
      where: { id: activityId },
      data: { notes: data.notes },
      include: {
        followUps: {
          orderBy: {
            occurredAt: 'desc',
          },
        },
      },
    });
  }

  async deleteSalesActivity(propertyId: string, activityId: string) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });
    if (!activity) {
      throw new NotFoundException(
        'Sales activity not found for this property.',
      );
    }
    return this.prisma.salesActivity.delete({ where: { id: activityId } });
  }

  findDeleted() {
    return this.prisma.property.findMany({
      where: {
        deletedAt: { not: null },
      },
      orderBy: {
        deletedAt: 'desc',
      },
      include: {
        managementCompany: true,
        contacts: {
          include: { contact: true },
        },
        waterBodies: true,
        salesActivities: {
          include: {
            followUps: {
              orderBy: {
                occurredAt: 'desc',
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, data: UpdatePropertyDto) {
    const { contacts, waterBodies, managementCompanyName, ...propertyData } =
      data;
    const normalizedManagementCompanyName = managementCompanyName?.trim();
    const existing = await this.prisma.property.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        contacts: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`No se encontró la propiedad con id ${id}`);
    }

    if (!contacts) {
      return this.prisma.property.update({
        where: { id },
        data: {
          ...propertyData,
          ...(managementCompanyName !== undefined
            ? normalizedManagementCompanyName
              ? {
                  managementCompany: {
                    connectOrCreate: {
                      where: { name: normalizedManagementCompanyName },
                      create: { name: normalizedManagementCompanyName },
                    },
                  },
                }
              : { managementCompany: { disconnect: true } }
            : {}),
        },
      });
    }

    const normalizedEmails = contacts.map((contact) =>
      contact.email.trim().toLowerCase(),
    );

    if (!contacts.some((contact) => contact.role === 'PROPERTY_MANAGER')) {
      throw new BadRequestException(
        'At least one Property Manager contact is required.',
      );
    }

    if (new Set(normalizedEmails).size !== normalizedEmails.length) {
      throw new BadRequestException(
        'Contact email addresses cannot be duplicated.',
      );
    }

    if (contacts.filter((contact) => contact.isPrimary).length !== 1) {
      throw new BadRequestException('Exactly one contact must be primary.');
    }

    const existingContactIds = new Set(
      existing.contacts.map((relation) => relation.contactId),
    );

    if (
      contacts.some(
        (contact) =>
          contact.contactId && !existingContactIds.has(contact.contactId),
      )
    ) {
      throw new BadRequestException(
        'One or more contacts do not belong to this property.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: {
          ...propertyData,
          ...(managementCompanyName !== undefined
            ? normalizedManagementCompanyName
              ? {
                  managementCompany: {
                    connectOrCreate: {
                      where: { name: normalizedManagementCompanyName },
                      create: { name: normalizedManagementCompanyName },
                    },
                  },
                }
              : { managementCompany: { disconnect: true } }
            : {}),
        },
      });

      await tx.propertyContact.deleteMany({
        where: { propertyId: id },
      });

      for (const contact of contacts) {
        let contactId = contact.contactId;

        if (contactId) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              firstName: contact.firstName?.trim() || null,
              lastName: contact.lastName?.trim() || null,
              email: contact.email.trim().toLowerCase(),
              phone: contact.phone?.trim() || null,
            },
          });
        } else {
          const createdContact = await tx.contact.create({
            data: {
              firstName: contact.firstName?.trim() || null,
              lastName: contact.lastName?.trim() || null,
              email: contact.email.trim().toLowerCase(),
              phone: contact.phone?.trim() || null,
            },
          });
          contactId = createdContact.id;
        }

        await tx.propertyContact.create({
          data: {
            propertyId: id,
            contactId,
            role: contact.role,
            isPrimary: contact.isPrimary ?? false,
          },
        });
      }

      if (waterBodies !== undefined) {
        await tx.waterBody.deleteMany({
          where: { propertyId: id },
        });

        if (waterBodies.length > 0) {
          await tx.waterBody.createMany({
            data: waterBodies.map((waterBody) => ({
              propertyId: id,
              name: waterBody.name.trim(),
              type: waterBody.type,
              size: waterBody.size ?? null,
              gallons: waterBody.gallons ?? null,
              active: waterBody.active ?? true,
            })),
          });
        }
      }
    });

    if (waterBodies !== undefined) {
      try {
        await this.provisionSharePointFolder(id);
      } catch (error) {
        this.logger.error(
          `SharePoint water body folders could not be synchronized for property ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad activa con id ${id}`,
      );
    }

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string) {
    const existing = await this.prisma.property.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad eliminada con id ${id}`,
      );
    }

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async removePermanently(id: string) {
    const existing = await this.prisma.property.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad eliminada con id ${id}`,
      );
    }

    return this.prisma.property.delete({
      where: { id },
    });
  }
}
