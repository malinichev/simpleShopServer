import { registerAs } from '@nestjs/config';

export default registerAs('ddos', () => ({
  window: parseInt(process.env.DDOS_WINDOW || '10', 10),
  threshold: parseInt(process.env.DDOS_THRESHOLD || '20', 10),
  baseDelay: parseInt(process.env.DDOS_BASE_DELAY || '100', 10),
  maxDelay: parseInt(process.env.DDOS_MAX_DELAY || '5000', 10),
}));
