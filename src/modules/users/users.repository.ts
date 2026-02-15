import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { User, Address } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto';
import {
  PaginatedResult,
  createPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
} from '@/common/types/pagination.types';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  async findById(id: ObjectId | string): Promise<User | null> {
    try {
      const objectId = typeof id === 'string' ? new ObjectId(id) : id;
      return this.repository.findOne({ where: { _id: objectId } as any });
    } catch {
      return null;
    }
  }

  async findByIds(ids: (ObjectId | string)[]): Promise<User[]> {
    const objectIds = ids.map((id) =>
      typeof id === 'string' ? new ObjectId(id) : id,
    );
    return this.repository.find({
      where: { _id: { $in: objectIds } } as any,
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

  async update(id: ObjectId | string, dto: UpdateUserDto): Promise<User | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update({ _id: objectId } as any, dto as any);
    return this.findById(objectId);
  }

  async delete(id: ObjectId | string): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.delete({ _id: objectId } as any);
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
    const page = query.page || DEFAULT_PAGE;
    const limit = query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.search) {
      where.$or = [
        { email: { $regex: query.search, $options: 'i' } },
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName: { $regex: query.search, $options: 'i' } },
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

  async updateRefreshToken(id: ObjectId | string, token: string | null): Promise<void> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as any,
      { refreshToken: token ?? undefined },
    );
  }

  async addAddress(id: ObjectId | string, address: Omit<Address, 'id'>): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const newAddress: Address = {
      ...address,
      id: uuidv4(),
    };

    // If this is the first address or isDefault is true, reset others
    if (newAddress.isDefault || user.addresses.length === 0) {
      user.addresses = user.addresses.map((addr) => ({ ...addr, isDefault: false }));
      newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);

    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as any,
      { addresses: user.addresses },
    );

    return this.findById(id);
  }

  async updateAddress(
    id: ObjectId | string,
    addressId: string,
    addressData: Partial<Address>,
  ): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const addressIndex = user.addresses.findIndex((addr) => addr.id === addressId);
    if (addressIndex === -1) return null;

    // If setting as default, reset others
    if (addressData.isDefault) {
      user.addresses = user.addresses.map((addr) => ({ ...addr, isDefault: false }));
    }

    user.addresses[addressIndex] = {
      ...user.addresses[addressIndex],
      ...addressData,
    };

    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as any,
      { addresses: user.addresses },
    );

    return this.findById(id);
  }

  async removeAddress(id: ObjectId | string, addressId: string): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const wasDefault = user.addresses.find((addr) => addr.id === addressId)?.isDefault;
    user.addresses = user.addresses.filter((addr) => addr.id !== addressId);

    // If removed address was default and there are other addresses, set first as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    await this.repository.update(
      { _id: objectId } as any,
      { addresses: user.addresses },
    );

    return this.findById(id);
  }

  async countByRole(): Promise<{ customer: number; manager: number; admin: number }> {
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
