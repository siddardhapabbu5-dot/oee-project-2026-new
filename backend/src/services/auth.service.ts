import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { UnauthorizedError, ValidationError, NotFoundError } from '../utils/errors.js';
import { signToken, type AuthUser } from '../middleware/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import type { Request } from 'express';

function toAuthUser(user: {
  id: string;
  email: string;
  role: AuthUser['role'];
  plantId: string | null;
  firstName: string;
  lastName: string;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    plantId: user.plantId,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

export async function login(email: string, password: string, req?: Request) {
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
  });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError('Invalid credentials');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const authUser = toAuthUser(user);
  const token = signToken(authUser);

  await writeAuditLog({ req, action: 'LOGIN', entity: 'User', entityId: user.id });

  return {
    token,
    user: {
      ...authUser,
      employeeId: user.employeeId,
      phone: user.phone,
      lastLoginAt: user.lastLoginAt,
    },
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      employeeId: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      plantId: true,
      plant: { select: { id: true, code: true, name: true } },
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; phone?: string | null },
  req?: Request,
) {
  const before = await getProfile(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      employeeId: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      plantId: true,
    },
  });
  await writeAuditLog({
    req,
    action: 'UPDATE_PROFILE',
    entity: 'User',
    entityId: userId,
    before,
    after: user,
  });
  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  req?: Request,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new ValidationError('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await writeAuditLog({ req, action: 'CHANGE_PASSWORD', entity: 'User', entityId: userId });
  return { message: 'Password updated successfully' };
}
