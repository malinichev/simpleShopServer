import { registerAs } from '@nestjs/config';

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(
      `${name} is missing or too short (<32 chars). ` +
        `Generate with: openssl rand -base64 64`,
    );
  }
  return value;
}

export default registerAs('jwt', () => ({
  accessSecret: requiredSecret('JWT_ACCESS_SECRET'),
  refreshSecret: requiredSecret('JWT_REFRESH_SECRET'),
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
}));
