import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '@/modules/settings/entities/payment-method.entity';
import type { PaymentDriver } from './payment-driver.interface';
import { ManualPaymentDriver } from './manual.driver';
import { YooKassaPaymentDriver } from './yookassa.driver';
import { StripePaymentDriver } from './stripe.driver';
import { CloudPaymentsDriver } from './cloudpayments.driver';

/**
 * Какие drivers доступны на основе env-credentials.
 *
 * `manual` всегда доступен — это безопасный fallback. Прочие — только если
 * заданы соответствующие env-vars (по аналогии с условной регистрацией
 * OAuth-провайдеров и mail-driver'а).
 */
export function getEnabledPaymentProviders(
  configService: ConfigService,
): PaymentProvider[] {
  const providers: PaymentProvider[] = [PaymentProvider.MANUAL];

  if (configService.get<string>('payments.yookassa.shopId')) {
    providers.push(PaymentProvider.YOOKASSA);
  }
  if (configService.get<string>('payments.stripe.secretKey')) {
    providers.push(PaymentProvider.STRIPE);
  }
  if (configService.get<string>('payments.cloudpayments.publicId')) {
    providers.push(PaymentProvider.CLOUDPAYMENTS);
  }

  return providers;
}

/**
 * Factory: возвращает массив активных driver-инстансов.
 * Используется в `PaymentsModule` для инжекции в `PaymentsService`.
 */
export function createPaymentDrivers(
  configService: ConfigService,
): PaymentDriver[] {
  const logger = new Logger('PaymentDriversFactory');
  const enabled = getEnabledPaymentProviders(configService);
  const drivers: PaymentDriver[] = [new ManualPaymentDriver()];

  if (enabled.includes(PaymentProvider.YOOKASSA)) {
    drivers.push(new YooKassaPaymentDriver(configService));
  }
  if (enabled.includes(PaymentProvider.STRIPE)) {
    drivers.push(new StripePaymentDriver(configService));
  }
  if (enabled.includes(PaymentProvider.CLOUDPAYMENTS)) {
    drivers.push(new CloudPaymentsDriver(configService));
  }

  logger.log(
    `Payment drivers registered: ${drivers.map((d) => d.provider).join(', ')}`,
  );
  return drivers;
}

export type { PaymentDriver } from './payment-driver.interface';
export { PAYMENT_DRIVERS } from './payment-driver.interface';
export {
  ManualPaymentDriver,
  YooKassaPaymentDriver,
  StripePaymentDriver,
  CloudPaymentsDriver,
};
