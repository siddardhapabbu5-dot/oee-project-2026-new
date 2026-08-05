import bcrypt from 'bcryptjs';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import type { Request } from 'express';

const userSelect = {
  id: true,
  employeeId: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  plantId: true,
  plant: { select: { id: true, code: true, name: true } },
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export async function listUsers(params: {
  skip: number;
  take: number;
  search?: string;
  role?: Role;
  plantId?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(params.role ? { role: params.role } : {}),
    ...(params.plantId ? { plantId: params.plantId } : {}),
    ...(params.search
      ? {
          OR: [
            { email: { contains: params.search, mode: 'insensitive' } },
            { firstName: { contains: params.search, mode: 'insensitive' } },
            { lastName: { contains: params.search, mode: 'insensitive' } },
            { employeeId: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const allowed = new Set(['createdAt', 'email', 'firstName', 'role', 'employeeId']);
  const orderBy = { [allowed.has(params.sortBy) ? params.sortBy : 'createdAt']: params.sortOrder };

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, skip: params.skip, take: params.take, orderBy, select: userSelect }),
  ]);

  return { total, items };
}

/** Lightweight supervisor picker for planning (active LINE_SUPERVISOR users). */
export async function listSupervisors() {
  return prisma.user.findMany({
    where: { deletedAt: null, isActive: true, role: 'LINE_SUPERVISOR' },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeId: true,
      plantId: true,
    },
  });
}

export async function createUser(
  data: {
    employeeId: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: Role;
    plantId?: string | null;
    isActive?: boolean;
  },
  req?: Request,
) {
  const exists = await prisma.user.findFirst({
    where: {
      OR: [{ email: data.email.toLowerCase() }, { employeeId: data.employeeId }],
      deletedAt: null,
    },
  });
  if (exists) throw new ValidationError('Email or employee ID already exists');

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      employeeId: data.employeeId,
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      plantId: data.plantId,
      isActive: data.isActive ?? true,
      createdById: req?.user?.id,
    },
    select: userSelect,
  });

  await writeAuditLog({ req, action: 'CREATE', entity: 'User', entityId: user.id, after: user });
  return user;
}

export async function updateUser(
  id: string,
  data: Partial<{
    employeeId: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: Role;
    plantId: string | null;
    isActive: boolean;
  }>,
  req?: Request,
) {
  const before = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!before) throw new NotFoundError('User not found');

  const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
  const user = await prisma.user.update({
    where: { id },
    data: {
      employeeId: data.employeeId,
      email: data.email?.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      plantId: data.plantId,
      isActive: data.isActive,
      updatedById: req?.user?.id,
    },
    select: userSelect,
  });

  await writeAuditLog({ req, action: 'UPDATE', entity: 'User', entityId: id, before, after: user });
  return user;
}

export async function softDeleteUser(id: string, req?: Request) {
  const before = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!before) throw new NotFoundError('User not found');
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, updatedById: req?.user?.id },
  });
  await writeAuditLog({ req, action: 'DELETE', entity: 'User', entityId: id, before });
  return { message: 'User deleted' };
}
