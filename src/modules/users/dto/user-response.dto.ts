import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, Address } from '../entities/user.entity';

/** Сохранённый адрес в профиле пользователя (entities/user.entity.ts Address). */
export class UserAddressDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  street: string;

  @ApiProperty()
  building: string;

  @ApiPropertyOptional()
  apartment?: string;

  @ApiProperty()
  postalCode: string;

  @ApiProperty()
  isDefault: boolean;
}

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiPropertyOptional()
  avatar?: string;

  @ApiProperty({ type: [UserAddressDto] })
  addresses: Address[];

  @ApiProperty()
  isEmailVerified: boolean;

  @ApiProperty({
    description: 'True если у пользователя задан пароль (не OAuth-only юзер)',
  })
  hasPassword: boolean;

  @ApiProperty({ type: [String] })
  wishlist: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UserStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  byRole: {
    customer: number;
    manager: number;
    admin: number;
  };
}
