import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { RegisterDto } from './dto/register.dto';
import { User } from '@/modules/users/entities/user.entity';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Проверяем, существует ли пользователь с таким email
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    // Создаём пользователя
    const user = await this.usersService.create(registerDto);

    // Генерируем токен для подтверждения email
    const verificationToken = await this.usersService.generateEmailVerificationToken(user._id.toString());

    // TODO: Отправить email с токеном подтверждения через Mail Service
    // await this.mailService.sendVerificationEmail(user.email, verificationToken);

    // Генерируем токены
    const tokens = await this.generateTokens(user);

    // Сохраняем refresh token
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(user: User): Promise<AuthResponseDto> {
    // Генерируем токены
    const tokens = await this.generateTokens(user);

    // Сохраняем refresh token
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.sanitizeUser(user),
      ...tokens,
    };
  }

  async logout(userId: string): Promise<void> {
    // Удаляем refresh token из БД
    await this.usersService.updateRefreshToken(userId, null);
  }

  async refresh(user: User): Promise<AuthResponseDto> {
    // Генерируем новые токены
    const tokens = await this.generateTokens(user);

    // Обновляем refresh token в БД
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.sanitizeUser(user),
      ...tokens,
    };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Не раскрываем информацию о существовании пользователя
      return {
        message: 'Если пользователь с таким email существует, на него будет отправлено письмо с инструкциями',
      };
    }

    // Генерируем токен для сброса пароля
    const resetToken = await this.usersService.generatePasswordResetToken(user._id.toString());

    // TODO: Отправить email с токеном сброса пароля через Mail Service
    // await this.mailService.sendPasswordResetEmail(user.email, resetToken);

    return {
      message: 'Если пользователь с таким email существует, на него будет отправлено письмо с инструкциями',
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      await this.usersService.resetPassword(token, newPassword);
      return { message: 'Пароль успешно изменён' };
    } catch (error) {
      throw new BadRequestException('Недействительный или истёкший токен');
    }
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    try {
      const  hashedToken = await this.usersService.verifyEmail(token);
      // return { message: 'Email успешно подтверждён' };
      return { message: JSON.stringify(hashedToken ?? '') };
    } catch (error) {
      throw new BadRequestException('Недействительный или истёкший токен');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    try {
      await this.usersService.changePassword(userId, currentPassword, newPassword);
      return { message: 'Пароль успешно изменён' };
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

  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
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

    return {
      accessToken,
      refreshToken,
    };
  }
}