import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureSwaggerModels } from './swagger-models';

export function createSwaggerDocument(app: INestApplication) {
  configureSwaggerModels();

  const config = new DocumentBuilder()
    .setTitle('BlueLife CRM API')
    .setDescription(
      'API de BlueLife para propiedades, químicos, Health Department y Reports. Los endpoints protegidos reciben Authorization: Bearer <token>.',
    )
    .setVersion('1.0')
    .addServer('https://calculator-bluelife-backend.vercel.app', 'Production')
    .addServer('http://localhost:3000', 'Local development')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'token' },
      'bearer',
    )
    .addTag('System', 'Estado general del backend')
    .addTag(
      'Properties',
      'Propiedades, contactos, piscinas y actividad comercial',
    )
    .addTag('Chemicals', 'Técnicos y reportes de químicos')
    .addTag('Health Department', 'Tickets, comentarios e inspecciones')
    .addTag('Reports', 'Novedades, responsables, archivos y configuración')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`,
  });
}
