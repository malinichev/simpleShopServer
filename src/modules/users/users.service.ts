import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from "./dto/user-response.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      addresses: [],
    });

    return this.usersRepository.save(user);
  }

  async findById(id: string): Promise<User | null> {
    try {
      const objectId = new ObjectId(id);
      return this.usersRepository.findOne({ where: { _id: objectId } as any });
    } catch (error) {
      return null;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    const hashedToken = refreshToken ? await bcrypt.hash(refreshToken, 12) : undefined;
    const objectId = new ObjectId(userId);

    await this.usersRepository.update({ _id: objectId } as any, {
        refreshToken: hashedToken,
    });
  }

  async validateRefreshToken(userId: string, token: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || !user.refreshToken) {
      return false;
    }
    return bcrypt.compare(token, user.refreshToken);
  }

  async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // 24 hours

    const objectId = new ObjectId(userId);
    await this.usersRepository.update({ _id: objectId } as any, {
      emailVerificationToken: hashedToken,
      emailVerificationExpires: expires,
    });

    return token;
  }

  async verifyEmail(token: string): Promise<User> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.usersRepository.findOne({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: new Date() } as any,
      } as any,
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.usersRepository.update({ _id: user._id } as any, {
      isEmailVerified: true,
      emailVerificationToken: undefined,
      emailVerificationExpires: undefined,
    });

    return this.findById(user._id.toString()) as Promise<User>;
  }

  async generatePasswordResetToken(userId: string): Promise<string> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // 1 hour

    await this.usersRepository.update({ _id: user._id } as any, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    });

    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.usersRepository.findOne({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: new Date() } as any,
      } as any,
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.usersRepository.update({ _id: user._id } as any, {
      password: hashedPassword,
      passwordResetToken: undefined,
      passwordResetExpires: undefined,
      refreshToken: undefined, // Invalidate all sessions
    });

    return this.findById(user._id.toString()) as Promise<User>;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await this.validatePassword(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const objectId = new ObjectId(userId);

    await this.usersRepository.update({ _id: objectId } as any, {
      password: hashedPassword,
      refreshToken: undefined, // Invalidate all sessions
    });
  }

  async update(userId: string, updateData: Partial<User>): Promise<User> {
    const objectId = new ObjectId(userId);
    
    // Удаляем поля, которые нельзя обновлять напрямую
    const { password, refreshToken, emailVerificationToken, passwordResetToken, ...safeData } = updateData as any;
    
    await this.usersRepository.update({ _id: objectId } as any, safeData);
    
    const updatedUser = await this.findById(userId);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    
    return updatedUser;
  }

  sanitizeUser(user: User): UserResponseDto {
    return {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        addresses: user.addresses,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
  }
}