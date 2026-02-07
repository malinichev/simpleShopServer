import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersRepository } from './users.repository';
import { User, UserRole, Address } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UserQueryDto,
  UserResponseDto,
  UserStatsDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto';
import { PaginatedResult } from '@/common/types/pagination.types';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.usersRepository.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    return this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<UserResponseDto>> {
    const result = await this.usersRepository.findAll(query);
    return {
      data: result.data.map((user) => this.sanitizeUser(user)),
      meta: result.meta,
    };
  }

  async update(
    userId: string,
    updateData: UpdateUserDto,
    currentUser?: User,
  ): Promise<User> {
    const user = await this.findByIdOrFail(userId);

    // Validate role change - only admin can change roles
    if (updateData.role && updateData.role !== user.role) {
      if (!currentUser || currentUser.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only admin can change user roles');
      }
    }

    // Check email uniqueness if changing email
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.findByEmail(updateData.email);
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Remove password from update - use changePassword method instead
    const { password, ...safeData } = updateData;

    const updatedUser = await this.usersRepository.update(userId, safeData);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  async delete(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.usersRepository.delete(userId);
  }

  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    const hashedToken = refreshToken ? await bcrypt.hash(refreshToken, 12) : null;
    await this.usersRepository.updateRefreshToken(userId, hashedToken);
  }

  async validateRefreshToken(userId: string, token: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || !user.refreshToken) {
      return false;
    }
    return bcrypt.compare(token, user.refreshToken);
  }

  async generateEmailVerificationToken(userId: string): Promise<string> {
    const user = await this.findByIdOrFail(userId);

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await this.usersRepository.update(userId, {
      emailVerificationToken: hashedToken,
      emailVerificationExpires: expires,
    } as any);

    return token;
  }

  async verifyEmail(token: string): Promise<User> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // This needs direct repository access for complex query
    const users = await this.usersRepository.findAll({ limit: 1000 });
    const user = users.data.find(
      (u: any) =>
        u.emailVerificationToken === hashedToken &&
        u.emailVerificationExpires &&
        new Date(u.emailVerificationExpires) > new Date(),
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.usersRepository.update(user._id.toString(), {
      isEmailVerified: true,
      emailVerificationToken: undefined,
      emailVerificationExpires: undefined,
    } as any);

    return this.findByIdOrFail(user._id.toString());
  }

  async generatePasswordResetToken(userId: string): Promise<string> {
    await this.findByIdOrFail(userId);

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.usersRepository.update(userId, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    } as any);

    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const users = await this.usersRepository.findAll({ limit: 1000 });
    const user = users.data.find(
      (u: any) =>
        u.passwordResetToken === hashedToken &&
        u.passwordResetExpires &&
        new Date(u.passwordResetExpires) > new Date(),
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.usersRepository.update(user._id.toString(), {
      password: hashedPassword,
      passwordResetToken: undefined,
      passwordResetExpires: undefined,
      refreshToken: undefined,
    } as any);

    return this.findByIdOrFail(user._id.toString());
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findByIdOrFail(userId);

    const isPasswordValid = await this.validatePassword(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.usersRepository.update(userId, {
      password: hashedPassword,
      refreshToken: undefined,
    } as any);
  }

  // Address methods
  async addAddress(userId: string, addressDto: CreateAddressDto): Promise<User> {
    await this.findByIdOrFail(userId);

    const address: Omit<Address, 'id'> = {
      ...addressDto,
      isDefault: addressDto.isDefault ?? false,
    };

    const user = await this.usersRepository.addAddress(userId, address);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateAddress(
    userId: string,
    addressId: string,
    addressDto: UpdateAddressDto,
  ): Promise<User> {
    const user = await this.findByIdOrFail(userId);

    const addressExists = user.addresses.some((addr) => addr.id === addressId);
    if (!addressExists) {
      throw new NotFoundException('Address not found');
    }

    const updatedUser = await this.usersRepository.updateAddress(userId, addressId, addressDto);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    return updatedUser;
  }

  async removeAddress(userId: string, addressId: string): Promise<User> {
    const user = await this.findByIdOrFail(userId);

    const addressExists = user.addresses.some((addr) => addr.id === addressId);
    if (!addressExists) {
      throw new NotFoundException('Address not found');
    }

    const updatedUser = await this.usersRepository.removeAddress(userId, addressId);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }
    return updatedUser;
  }

  // Stats
  async getStats(): Promise<UserStatsDto> {
    const [total, byRole] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.countByRole(),
    ]);

    return { total, byRole };
  }

  sanitizeUser(user: User): UserResponseDto {
    return {
      _id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      addresses: user.addresses || [],
      isEmailVerified: user.isEmailVerified,
      wishlist: user.wishlist || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
