import { Module, Type, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '@/modules/users/users.module';
import { MailModule } from '@/modules/mail/mail.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { OAuthService } from './oauth/oauth.service';
import { OAuthStateService } from './oauth/oauth-state.service';
import { OAuthEventsService } from './oauth/oauth-events.service';
import { OAuthAuthController } from './oauth/oauth-auth.controller';
import { OAuthAccountController } from './oauth/oauth-account.controller';
import { VkIdOAuthService } from './oauth/vk-id.service';
import { YandexStrategy } from './oauth/strategies/yandex.strategy';

// OAuth-провайдеры регистрируются условно по env: если ни один CLIENT_ID не задан,
// контроллеры и сервисы не подключаются — бэк поднимается без OAuth-функциональности.
// Статус доступен на /api/settings/public.enabledOAuthProviders для фронта.
const VK_ENABLED = !!process.env.VK_CLIENT_ID;
const YANDEX_ENABLED = !!process.env.YANDEX_CLIENT_ID;
const ANY_OAUTH_ENABLED = VK_ENABLED || YANDEX_ENABLED;

const oauthControllers: Type<unknown>[] = ANY_OAUTH_ENABLED
  ? [OAuthAuthController, OAuthAccountController]
  : [];

const oauthProviders: Provider[] = [
  ...(ANY_OAUTH_ENABLED
    ? [OAuthService, OAuthStateService, OAuthEventsService]
    : []),
  ...(VK_ENABLED ? [VkIdOAuthService] : []),
  ...(YANDEX_ENABLED ? [YandexStrategy] : []),
];

const oauthExports: Provider[] = ANY_OAUTH_ENABLED
  ? [OAuthService, OAuthStateService, OAuthEventsService]
  : [];

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.register({}), // Конфигурация будет передаваться динамически в сервисе
    ConfigModule,
  ],
  controllers: [AuthController, ...oauthControllers],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    LocalStrategy,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenGuard,
    ...oauthProviders,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenGuard,
    ...oauthExports,
  ],
})
export class AuthModule {}
