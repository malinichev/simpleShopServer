import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * VK вернул email, который уже занят password-пользователем, но
 * не подтвердил его — не можем автолинковать. Storefront должен
 * предложить войти паролем и привязать VK из личного кабинета.
 */
export class OAuthEmailConflictException extends ConflictException {
  constructor() {
    super({
      message: 'oauth_email_conflict',
      statusCode: 409,
    });
  }
}

/**
 * Провайдер уже привязан к другому пользователю (пытаемся прилинковать
 * уже использованный providerId в link-mode).
 */
export class OAuthAlreadyLinkedException extends ConflictException {
  constructor() {
    super({
      message: 'oauth_identity_already_linked',
      statusCode: 409,
    });
  }
}

/**
 * Попытка отвязать единственный способ входа у пользователя без пароля.
 */
export class OAuthCannotUnlinkLastException extends BadRequestException {
  constructor() {
    super({
      message: 'cannot_unlink_last_auth_method',
      statusCode: 400,
    });
  }
}
