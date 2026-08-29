import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { ValidationError } from '../utils/errors.js';

export const PETTY_CASH_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'petty-cash');

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function ensureDir() {
  fs.mkdirSync(PETTY_CASH_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir();
    cb(null, PETTY_CASH_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8) || '';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

export const pettyCashUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new ValidationError('Attach a photo or PDF of the voucher / bill') as unknown as Error);
  },
});

export function pettyCashFilePath(storedName: string) {
  const base = path.basename(storedName);
  return path.join(PETTY_CASH_UPLOAD_DIR, base);
}
