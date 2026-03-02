import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike, FindOptionsWhere } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User, Address } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';
import { TokenAudience } from '@/common/types';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return this.repository.find({
      where: { id: In(ids) },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  async create(dto: CreateUserDto & { password: string }): Promise<User> {
    const user = this.repository.create({
      ...dto,
      addresses: [],
      wishlist: [],
    });
    return this.repository.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    await this.repository.update(id, dto as Partial<User>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    let where: FindOptionsWhere<User> | FindOptionsWhere<User>[] = {};

    if (query.role) {
      where = { role: query.role };
    }

    if (query.search) {
      const searchCondition = { ...(query.role ? { role: query.role } : {}) };
      where = [
        { ...searchCondition, email: ILike(`%${query.search}%`) },
        { ...searchCondition, firstName: ILike(`%${query.search}%`) },
        { ...searchCondition, lastName: ILike(`%${query.search}%`) },
      ];
    }

    const [data, total] = await this.repository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  async updateRefreshToken(
    id: string,
    token: string | null,
    audience: TokenAudience,
  ): Promise<void> {
    const user = await this.findById(id);
    const refreshTokens = user?.refreshTokens ? { ...user.refreshTokens } : {};

    if (token) {
      refreshTokens[audience] = token;
    } else {
      delete refreshTokens[audience];
    }

    const hasTokens = Object.keys(refreshTokens).length > 0;
    await this.repository.update(id, {
      refreshTokens: hasTokens ? refreshTokens : null,
    } as Partial<User>);
  }

  async addAddress(
    id: string,
    address: Omit<Address, 'id'>,
  ): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const newAddress: Address = {
      ...address,
      id: uuidv4(),
    };

    // If this is the first address or isDefault is true, reset others
    if (newAddress.isDefault || user.addresses.length === 0) {
      user.addresses = user.addresses.map((addr) => ({
        ...addr,
        isDefault: false,
      }));
      newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);

    await this.repository.update(id, {
      addresses: user.addresses,
    } as Partial<User>);
    return this.findById(id);
  }

  async updateAddress(
    id: string,
    addressId: string,
    addressData: Partial<Address>,
  ): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const addressIndex = user.addresses.findIndex(
      (addr) => addr.id === addressId,
    );
    if (addressIndex === -1) return null;

    // If setting as default, reset others
    if (addressData.isDefault) {
      user.addresses = user.addresses.map((addr) => ({
        ...addr,
        isDefault: false,
      }));
    }

    user.addresses[addressIndex] = {
      ...user.addresses[addressIndex],
      ...addressData,
    };

    await this.repository.update(id, {
      addresses: user.addresses,
    } as Partial<User>);
    return this.findById(id);
  }

  async removeAddress(id: string, addressId: string): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const wasDefault = user.addresses.find(
      (addr) => addr.id === addressId,
    )?.isDefault;
    user.addresses = user.addresses.filter((addr) => addr.id !== addressId);

    // If removed address was default and there are other addresses, set first as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await this.repository.update(id, {
      addresses: user.addresses,
    } as Partial<User>);
    return this.findById(id);
  }

  async countByRole(): Promise<{
    customer: number;
    manager: number;
    admin: number;
  }> {
    const users = await this.repository.find({ select: ['role'] });

    return users.reduce(
      (acc, user) => {
        acc[user.role]++;
        return acc;
      },
      { customer: 0, manager: 0, admin: 0 },
    );
  }

  async count(): Promise<number> {
    return this.repository.count();
  }
}
