import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, Address } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty()
  _id: string;

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

  @ApiProperty({ type: [Object] })
  addresses: Address[];

  @ApiProperty()
  isEmailVerified: boolean;

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
