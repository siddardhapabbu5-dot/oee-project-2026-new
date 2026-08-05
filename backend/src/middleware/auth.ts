import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { prisma } from '../config/prisma.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  plantId: string | null;
  firstName: string;
  lastName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tokenIssuedAt?: number;
    }
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  plantId: string | null;
  iat?: number;
  exp?: number;
}

export function signToken(user: AuthUser) {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    plantId: user.plantId,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }

    const token = header.slice(7);
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Session timeout based on token issued-at
    if (decoded.iat) {
      const ageMinutes = (Date.now() / 1000 - decoded.iat) / 60;
      if (ageMinutes > env.SESSION_TIMEOUT_MINUTES) {
        throw new UnauthorizedError('Session expired');
      }
      req.tokenIssuedAt = decoded.iat;
    }

    const user = await prisma.user.findFirst({
      where: { id: decoded.sub, deletedAt: null, isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        plantId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found or inactive');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error instanceof UnauthorizedError ? error : new UnauthorizedError('Invalid token'));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
}
