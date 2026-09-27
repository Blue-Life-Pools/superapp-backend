import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateChemicalReportDto } from './dto/create-chemical-report.dto';
import { CreateChemicalTechnicianDto } from './dto/create-chemical-technician.dto';
import { UpdateChemicalTechnicianDto } from './dto/update-chemical-technician.dto';
import { UpdateChemicalReportDto } from './dto/update-chemical-report.dto';

const quantityFields = [
  'tabsQuantity',
  'liquidChlorineGallons',
  'chlorinePowderScoops',
  'muriaticAcidGallons',
  'shockScoops',
  'dePowderBags',
  'bicarbonateScoops',
  'stabilizerScoops',
  'saltBags',
  'phosphatesOunces',
] as const;

function technicianCode(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function technicianCodeWithoutNumber(value: string) {
  return technicianCode(value).replace(/^\d+/, '');
}

function reportDuplicateKey(report: {
  serviceDate: Date | string;
  technicianName: string;
  tabsQuantity: unknown;
  tabsUnit: string;
  liquidChlorineGallons: unknown;
  chlorinePowderScoops: unknown;
  muriaticAcidGallons: unknown;
  shockScoops: unknown;
  dePowderBags: unknown;
  dePowderUnit: string;
  bicarbonateScoops: unknown;
  stabilizerScoops: unknown;
  stabilizerUnit: string;
  saltBags: unknown;
  phosphatesOunces: unknown;
  notes?: string | null;
}) {
  const date = report.serviceDate instanceof Date
    ? report.serviceDate.toISOString().slice(0, 10)
    : report.serviceDate.slice(0, 10);
  const technician = report.technicianName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const quantity = (value: unknown) => Number(value) || 0;
  return JSON.stringify([
    date,
    technician,
    quantity(report.tabsQuantity),
    report.tabsUnit,
    quantity(report.liquidChlorineGallons),
    quantity(report.chlorinePowderScoops),
    quantity(report.muriaticAcidGallons),
    quantity(report.shockScoops),
    quantity(report.dePowderBags),
    report.dePowderUnit,
    quantity(report.bicarbonateScoops),
    quantity(report.stabilizerScoops),
    report.stabilizerUnit,
    quantity(report.saltBags),
    quantity(report.phosphatesOunces),
    report.notes?.trim() || null,
  ]);
}

const chemicalUnitLabels: Record<string, string> = {
  units: 'unidades',
  pounds: 'libras',
  bags: 'bolsas',
  scoops: 'scoops',
  bucket: 'bucket',
};

function chemicalUnitLabel(value: string) {
  return chemicalUnitLabels[value] ?? value;
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function bearerToken(authorization?: string) {
  const [scheme, token] = authorization?.trim().split(/\s+/, 2) ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedException('Owner access is required.');
  }
  return token;
}

function passwordMatches(password: string, storedHash: string) {
  const [algorithm, saltHex, hashHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const candidate = scryptSync(
      password,
      Buffer.from(saltHex, 'hex'),
      expected.length,
    );
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

@Injectable()
export class ChemicalsService {
  constructor(private readonly prisma: PrismaService) {}

  findTechnicians() {
    return this.prisma.chemicalTechnician.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async findTechnicianDirectory(authorization?: string) {
    await this.ownerSession(authorization);
    return this.prisma.chemicalTechnician.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, whatsappNumber: true, active: true },
    });
  }

  async createTechnician(data: CreateChemicalTechnicianDto, authorization?: string) {
    await this.ownerSession(authorization);
    return this.prisma.chemicalTechnician.create({
      data: {
        name: data.name.trim(),
        whatsappNumber: data.whatsappNumber.trim(),
      },
      select: { id: true, name: true, whatsappNumber: true, active: true },
    });
  }

  async removeTechnician(id: string, authorization?: string) {
    await this.ownerSession(authorization);
    return this.prisma.chemicalTechnician.delete({
      where: { id },
      select: { id: true },
    });
  }

  async updateTechnician(id: string, data: UpdateChemicalTechnicianDto, authorization?: string) {
    await this.ownerSession(authorization);
    return this.prisma.chemicalTechnician.update({ where: { id }, data: { name: data.name.trim(), whatsappNumber: data.whatsappNumber.trim() }, select: { id: true, name: true, whatsappNumber: true, active: true } });
  }

  async accessTechnician(code: string) {
    const requestedCode = technicianCode(code);
    const technicians = await this.prisma.chemicalTechnician.findMany({
      where: { active: true },
      select: { name: true, shareToken: true },
    });
    const technician = technicians.find(
      (item) =>
        technicianCode(item.name) === requestedCode ||
        technicianCodeWithoutNumber(item.name) === requestedCode,
    );
    if (!technician) {
      throw new NotFoundException('Technician code not found.');
    }
    return {
      name: technician.name,
      technicianToken: technician.shareToken,
    };
  }

  async resolveTechnician(shareToken: string) {
    const technician = await this.prisma.chemicalTechnician.findFirst({
      where: { shareToken, active: true },
      select: { name: true },
    });
    if (!technician) {
      throw new NotFoundException('Technician link not found.');
    }
    return technician;
  }

  async technicianWhatsAppUrl(id: string, formUrl: string) {
    let parsedFormUrl: URL;
    try {
      parsedFormUrl = new URL(formUrl);
    } catch {
      throw new BadRequestException('The form URL is invalid.');
    }

    if (!['http:', 'https:'].includes(parsedFormUrl.protocol)) {
      throw new BadRequestException('The form URL is invalid.');
    }

    const technician = await this.prisma.chemicalTechnician.findFirst({
      where: { id, active: true },
      select: { name: true, whatsappNumber: true, shareToken: true },
    });
    if (!technician) {
      throw new NotFoundException('Technician not found.');
    }

    parsedFormUrl.searchParams.delete('technician');
    parsedFormUrl.searchParams.set('area', 'chemicals');
    parsedFormUrl.searchParams.set('technicianToken', technician.shareToken);
    const firstName = technician.name.replace(/^\d+\s+/, '').split(' ')[0];
    const message = `Hola ${firstName}, registra aquí las cantidades de químicos que retiraste de bodega: ${parsedFormUrl.toString()}`;
    const whatsappUrl = new URL(`https://wa.me/${technician.whatsappNumber}`);
    whatsappUrl.searchParams.set('text', message);
    return whatsappUrl.toString();
  }

  findAll() {
    return this.prisma.chemicalReport.findMany({
      where: { deletedAt: null },
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async accessOwner(email: string, password: string) {
    const owner = await this.prisma.chemicalOwner.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!owner?.active || !passwordMatches(password, owner.passwordHash)) {
      throw new UnauthorizedException('Invalid owner credentials.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.chemicalOwnerSession.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      }),
      this.prisma.chemicalOwnerSession.create({
        data: {
          tokenHash: tokenHash(token),
          expiresAt,
          ownerId: owner.id,
        },
      }),
    ]);

    return {
      token,
      expiresAt,
      owner: { name: owner.name, email: owner.email },
    };
  }

  async ownerSession(authorization?: string) {
    const token = bearerToken(authorization);
    const session = await this.prisma.chemicalOwnerSession.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { owner: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.owner.active) {
      throw new UnauthorizedException('Owner session is not valid.');
    }
    return {
      name: session.owner.name,
      email: session.owner.email,
      expiresAt: session.expiresAt,
    };
  }

  async logoutOwner(authorization?: string) {
    const token = bearerToken(authorization);
    await this.prisma.chemicalOwnerSession.deleteMany({
      where: { tokenHash: tokenHash(token) },
    });
  }

  async remove(id: string, authorization?: string) {
    const owner = await this.ownerSession(authorization);
    const report = await this.prisma.chemicalReport.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Chemical report not found.');

    return this.prisma.chemicalReport.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByEmail: owner.email,
      },
      select: { id: true },
    });
  }

  async update(id: string, data: UpdateChemicalReportDto, authorization?: string) {
    await this.ownerSession(authorization);
    const report = await this.prisma.chemicalReport.findFirst({ where: { id, deletedAt: null } });
    if (!report) throw new NotFoundException('Chemical report not found.');
    const quantities = Object.fromEntries(quantityFields.map((key) => [key, data[key] ?? 0]));
    return this.prisma.chemicalReport.update({ where: { id }, data: { serviceDate: new Date(`${data.serviceDate}T12:00:00.000Z`), technicianName: data.technicianName.trim(), tabsUnit: data.tabsUnit ?? 'units', dePowderUnit: data.dePowderUnit ?? 'bags', stabilizerUnit: data.stabilizerUnit ?? 'bucket', ...quantities }, });
  }

  async create(data: CreateChemicalReportDto) {
    if (!quantityFields.some((field) => data[field] > 0)) {
      throw new BadRequestException(
        'At least one chemical quantity must be greater than zero.',
      );
    }

    const technicianName = data.technicianToken
      ? (await this.resolveTechnician(data.technicianToken)).name
      : data.technicianName.trim();
    const serviceDate = new Date(`${data.serviceDate}T12:00:00.000Z`);
    const existingReports = await this.prisma.chemicalReport.findMany({
      where: {
        serviceDate,
        technicianName,
        deletedAt: null,
      },
    });
    const reportKey = reportDuplicateKey({
      ...data,
      serviceDate,
      technicianName,
      tabsUnit: data.tabsUnit ?? 'units',
      dePowderUnit: data.dePowderUnit ?? 'bags',
      stabilizerUnit: data.stabilizerUnit ?? 'bucket',
      notes: data.notes,
    });
    if (existingReports.some((report) => reportDuplicateKey(report) === reportKey)) {
      throw new BadRequestException(
        'Este registro ya fue guardado anteriormente para ese técnico y fecha.',
      );
    }

    try {
      return await this.prisma.chemicalReport.create({
        data: {
          serviceDate,
        technicianName,
        tabsQuantity: data.tabsQuantity,
        tabsUnit: data.tabsUnit ?? 'units',
        liquidChlorineGallons: data.liquidChlorineGallons,
        chlorinePowderScoops: data.chlorinePowderScoops,
        muriaticAcidGallons: data.muriaticAcidGallons,
        shockScoops: data.shockScoops,
        dePowderBags: data.dePowderBags,
        dePowderUnit: data.dePowderUnit ?? 'bags',
        bicarbonateScoops: data.bicarbonateScoops,
        stabilizerScoops: data.stabilizerScoops,
        stabilizerUnit: data.stabilizerUnit ?? 'bucket',
        saltBags: data.saltBags,
        phosphatesOunces: data.phosphatesOunces,
        notes: data.notes?.trim() || null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(
          'Este técnico ya tiene un registro guardado para esa fecha.',
        );
      }
      throw error;
    }
  }

  async exportCsv() {
    const reports = await this.prisma.chemicalReport.findMany({
      where: { deletedAt: null },
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
    });
    const headers = [
      'Fecha',
      'Técnico',
      'Tabletas (Cantidad)',
      'Liquid Chlorine (GAL)',
      'Chlorine Powder (Scoop)',
      'Muriatic Acid (Gal)',
      'Shock (Scoop)',
      'DE Filter Powder (Cantidad)',
      'Bicarbonate (Scoop)',
      'Estabilizador (Cantidad)',
      'SALT (BAG)',
      'Phosphates (oz)',
      'Notas',
      'Unidad de tabletas',
      'Unidad de polvo DE',
      'Unidad de estabilizador',
    ];
    const escape = (value: unknown) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const uniqueReports = reports.filter((report, index, allReports) =>
      allReports.findIndex((candidate) =>
        reportDuplicateKey(candidate) === reportDuplicateKey(report),
      ) === index,
    );
    const rows = uniqueReports.map((report) => [
      report.serviceDate.toISOString().slice(0, 10),
      report.technicianName,
      report.tabsQuantity,
      report.liquidChlorineGallons,
      report.chlorinePowderScoops,
      report.muriaticAcidGallons,
      report.shockScoops,
      report.dePowderBags,
      report.bicarbonateScoops,
      report.stabilizerScoops,
      report.saltBags,
      report.phosphatesOunces,
      report.notes,
      chemicalUnitLabel(report.tabsUnit),
      chemicalUnitLabel(report.dePowderUnit),
      chemicalUnitLabel(report.stabilizerUnit),
    ]);

    return `\uFEFF${[headers, ...rows]
      .map((row) => row.map(escape).join(','))
      .join('\r\n')}`;
  }
}
