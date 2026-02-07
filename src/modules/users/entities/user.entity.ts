import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum UserRole {
  CUSTOMER = 'customer',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

export interface Address {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  street: string;
  building: string;
  apartment?: string;
  postalCode: string;
  isDefault: boolean;
}

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ nullable: true })
  avatar?: string;

  @Column('json', { default: [] })
  addresses: Address[];

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true })
  emailVerificationToken?: string;

  @Column({ nullable: true })
  emailVerificationExpires?: Date;

  @Column({ nullable: true })
  passwordResetToken?: string;

  @Column({ nullable: true })
  passwordResetExpires?: Date;

  @Column({ nullable: true })
  refreshToken?: string;

  @Column('simple-array', { default: [] })
  wishlist: string[]; // product IDs
}
