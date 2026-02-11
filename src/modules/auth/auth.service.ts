import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { MailService } from '@/modules/mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from '@/modules/users/entities/user.entity';
import { AuthResponseDto } from './dto/auth-response.dto';
import { TokensDto } from './dto/tokens.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    const isPasswordValid = await this.usersService.validatePassword(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const user = await this.usersService.create(dto);

    // Генерируем токен для подтверждения email
    const verificationToken =
      await this.usersService.generateEmailVerificationToken(
        user._id.toString(),
      );

    const corsOrigins = this.configService.get<string[]>('corsOrigins') ?? [
      'http://localhost:3001',
    ];
    await this.mailService.sendEmailVerification(user.email, {
      firstName: user.firstName,
      verificationUrl: `${corsOrigins[0]}/verify-email?token=${verificationToken}`,
    });

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return {
      user: this.usersService.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(user: User): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return {
      user: this.usersService.sanitizeUser(user),
      ...tokens,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null);
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<TokensDto> {
    const isValid = await this.usersService.validateRefreshToken(
      userId,
      refreshToken,
    );
    if (!isValid) {
      throw new UnauthorizedException('Недействительный refresh token');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return tokens;
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Не раскрываем информацию о существовании пользователя
      return;
    }

    const resetToken = await this.usersService.generatePasswordResetToken(
      user._id.toString(),
    );

    const corsOrigins = this.configService.get<string[]>('corsOrigins') ?? [
      'http://localhost:3000',
    ];
    await this.mailService.sendPasswordReset(user.email, {
      firstName: user.firstName,
      resetUrl: `${corsOrigins[0]}/reset-password?token=${resetToken}`,
      expiresIn: '1 час',
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      await this.usersService.resetPassword(token, password);
    } catch (error) {
      throw new BadRequestException('Недействительный или истёкший токен');
    }
  }

  async verifyEmail(token: string): Promise<void> {
    try {
      await this.usersService.verifyEmail(token);
    } catch (error) {
      throw new BadRequestException('Недействительный или истёкший токен');
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    try {
      await this.usersService.changePassword(
        userId,
        dto.currentPassword,
        dto.newPassword,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException('Не удалось изменить пароль');
    }
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }
    return this.usersService.sanitizeUser(user);
  }

  async updateProfile(userId: string, updateData: Partial<User>) {
    const user = await this.usersService.update(userId, updateData);
    return this.usersService.sanitizeUser(user);
  }

  private async generateTokens(user: User): Promise<TokensDto> {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
