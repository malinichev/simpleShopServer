import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '@/modules/users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({}), // Конфигурация будет передаваться динамически в сервисе
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    LocalStrategy,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    RefreshTokenGuard,
  ],
})
export class AuthModule {}
