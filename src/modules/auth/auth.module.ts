import { Module } from '@nestjs/common';
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
import { OAuthAuthController } from './oauth/oauth-auth.controller';
import { OAuthAccountController } from './oauth/oauth-account.controller';
import { VkIdOAuthService } from './oauth/vk-id.service';
import { YandexStrategy } from './oauth/strategies/yandex.strategy';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.register({}), // Конфигурация будет передаваться динамически в сервисе
    ConfigModule,
  ],
  controllers: [AuthController, OAuthAuthController, OAuthAccountController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    LocalStrategy,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenGuard,
    OAuthService,
    OAuthStateService,
    VkIdOAuthService,
    YandexStrategy,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenGuard,
    OAuthService,
    OAuthStateService,
  ],
})
export class AuthModule {}
