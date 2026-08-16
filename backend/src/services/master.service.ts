import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import { writeAuditLog } from '../utils/audit.js';
import { pickProductOptions } from '../utils/productOptions.js';
import type { Request } from 'express';

type SoftModel =
  | 'plant'
  | 'productionLine'
  | 'brand'
  | 'product'
  | 'sku'
  | 'machine'
  | 'downtimeCategory'
  | 'downtimeReason'
  | 'changeoverType'
  | 'shift';

async function softDelete(model: SoftModel, id: string, req?: Request, entity?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (prisma as any)[model];
  const before = await client.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError(`${entity ?? model} not found`);
  await client.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await writeAuditLog({ req, action: 'DELETE', entity: entity ?? model, entityId: id, before });
  return { message: 'Deleted' };
}

function slugCode(s: string, max = 40) {
  return (
    s
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max) || `X-${Date.now()}`
  );
}

/** Keep Product master in sync with Brand so Brands appear as Product Name on Products & SKUs. */
async function ensureProductForBrand(brand: { id: string; code: string; name: string; description?: string | null }) {
  const productCode = `PRD-${slugCode(brand.name)}`;

  const linked = await prisma.product.findFirst({
    where: { brandId: brand.id },
    orderBy: { createdAt: 'asc' },
  });
  if (linked) {
    return prisma.product.update({
      where: { id: linked.id },
      data: {
        name: brand.name,
        description: brand.description ?? linked.description,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  const byName = await prisma.product.findFirst({
    where: { name: { equals: brand.name, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });
  if (byName) {
    return prisma.product.update({
      where: { id: byName.id },
      data: {
        name: brand.name,
        brandId: brand.id,
        description: brand.description ?? byName.description,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  const byCode = await prisma.product.findUnique({ where: { code: productCode } });
  if (byCode) {
    return prisma.product.update({
      where: { id: byCode.id },
      data: {
        name: brand.name,
        brandId: brand.id,
        description: brand.description ?? byCode.description,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  return prisma.product.create({
    data: {
      code: productCode,
      name: brand.name,
      brandId: brand.id,
      description: brand.description ?? `${brand.name} product family`,
      uom: 'CASE',
      isActive: true,
    },
  });
}

export const masterService = {
  // Plants
  async listPlants(q: { skip: number; take: number; search?: string }) {
    const where: Prisma.PlantWhereInput = {
      deletedAt: null,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.plant.count({ where }),
      prisma.plant.findMany({ where, skip: q.skip, take: q.take, orderBy: { createdAt: 'desc' } }),
    ]);
    return { total, items };
  },
  async createPlant(data: Prisma.PlantCreateInput, req?: Request) {
    const item = await prisma.plant.create({ data });
    await writeAuditLog({ req, action: 'CREATE', entity: 'Plant', entityId: item.id, after: item });
    return item;
  },
  async updatePlant(id: string, data: Prisma.PlantUpdateInput, req?: Request) {
    const before = await prisma.plant.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Plant not found');
    const item = await prisma.plant.update({ where: { id }, data });
    await writeAuditLog({ req, action: 'UPDATE', entity: 'Plant', entityId: id, before, after: item });
    return item;
  },
  deletePlant: (id: string, req?: Request) => softDelete('plant', id, req, 'Plant'),

  // Lines
  async listLines(q: { skip: number; take: number; search?: string; plantId?: string }) {
    const where: Prisma.ProductionLineWhereInput = {
      deletedAt: null,
      ...(q.plantId ? { plantId: q.plantId } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.productionLine.count({ where }),
      prisma.productionLine.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { createdAt: 'desc' },
        include: {
          plant: { select: { id: true, code: true, name: true } },
          supervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);
    return { total, items };
  },
  async createLine(data: Prisma.ProductionLineUncheckedCreateInput, req?: Request) {
    const item = await prisma.productionLine.create({
      data,
      include: { plant: true, supervisor: true },
    });
    await writeAuditLog({ req, action: 'CREATE', entity: 'ProductionLine', entityId: item.id, after: item });
    return item;
  },
  async updateLine(id: string, data: Prisma.ProductionLineUncheckedUpdateInput, req?: Request) {
    const before = await prisma.productionLine.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Line not found');
    const item = await prisma.productionLine.update({
      where: { id },
      data,
      include: { plant: true, supervisor: true },
    });
    await writeAuditLog({
      req,
      action: 'UPDATE',
      entity: 'ProductionLine',
      entityId: id,
      before,
      after: item,
    });
    return item;
  },
  deleteLine: (id: string, req?: Request) => softDelete('productionLine', id, req, 'ProductionLine'),

  // Brands
  async listBrands(q: { skip: number; take: number; search?: string }) {
    const where: Prisma.BrandWhereInput = {
      deletedAt: null,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.brand.count({ where }),
      prisma.brand.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
        include: {
          products: {
            where: { deletedAt: null, isActive: true },
            orderBy: { createdAt: 'asc' },
            include: { skus: { where: { deletedAt: null } } },
          },
        },
      }),
    ]);

    // Auto-heal: every brand must have a Product so it appears in Products & SKUs → Product Name
    for (const brand of items) {
      if (brand.products.length === 0) {
        const product = await ensureProductForBrand(brand);
        brand.products = [{ ...product, skus: [] }];
      }
    }

    return { total, items };
  },
  async createBrand(data: Prisma.BrandCreateInput, req?: Request) {
    const item = await prisma.brand.create({ data });
    const product = await ensureProductForBrand(item);
    await writeAuditLog({ req, action: 'CREATE', entity: 'Brand', entityId: item.id, after: item });
    return { ...item, products: [product] };
  },
  async updateBrand(id: string, data: Prisma.BrandUpdateInput, req?: Request) {
    const before = await prisma.brand.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Brand not found');
    const item = await prisma.brand.update({ where: { id }, data });
    const product = await ensureProductForBrand(item);
    await writeAuditLog({ req, action: 'UPDATE', entity: 'Brand', entityId: id, before, after: item });
    return { ...item, products: [product] };
  },
  /** Ensure every active brand has a linked product (for Product Name dropdown). */
  async syncBrandProducts() {
    const brands = await prisma.brand.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
    const results = [];
    for (const brand of brands) {
      results.push(await ensureProductForBrand(brand));
    }
    return { brands: brands.length, products: results.length };
  },
  deleteBrand: (id: string, req?: Request) => softDelete('brand', id, req, 'Brand'),

  // Products
  async listProducts(q: { skip: number; take: number; search?: string }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
              { brand: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
        include: {
          brand: true,
          skus: { where: { deletedAt: null }, orderBy: { name: 'asc' } },
        },
      }),
    ]);
    const deduped: typeof items = [];
    const seenBrandIds = new Set<string>();
    const seenNames = new Set<string>();
    for (const item of items) {
      if (item.brandId) {
        if (seenBrandIds.has(item.brandId)) continue;
        seenBrandIds.add(item.brandId);
      } else {
        const key = item.name.trim().toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
      }
      deduped.push(item);
    }
    return { total: deduped.length, items: deduped };
  },

  /** One product per brand for dropdowns (Work Order, Changeover, etc.). */
  async listProductOptions() {
    const brands = await prisma.brand.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        products: {
          where: { deletedAt: null, isActive: true },
          orderBy: { createdAt: 'asc' },
          include: { skus: { where: { deletedAt: null } } },
        },
      },
    });

    const entries: Array<{ brandName: string; productId: string; skuCount: number }> = [];
    for (const brand of brands) {
      let product = brand.products[0];
      if (!product) {
        const ensured = await ensureProductForBrand(brand);
        product = { ...ensured, skus: [] };
      }
      const skuCount = brand.products.reduce((s, p) => s + p.skus.length, 0);
      entries.push({ brandName: brand.name, productId: product.id, skuCount });
    }

    return pickProductOptions(entries);
  },

  async createProduct(data: Prisma.ProductUncheckedCreateInput, req?: Request) {
    const item = await prisma.product.create({ data, include: { brand: true, skus: true } });
    await writeAuditLog({ req, action: 'CREATE', entity: 'Product', entityId: item.id, after: item });
    return item;
  },
  async updateProduct(id: string, data: Prisma.ProductUncheckedUpdateInput, req?: Request) {
    const before = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Product not found');
    const item = await prisma.product.update({
      where: { id },
      data,
      include: { brand: true, skus: true },
    });
    await writeAuditLog({ req, action: 'UPDATE', entity: 'Product', entityId: id, before, after: item });
    return item;
  },
  deleteProduct: (id: string, req?: Request) => softDelete('product', id, req, 'Product'),

  // SKUs
  async listSkus(q: {
    skip: number;
    take: number;
    search?: string;
    productId?: string;
    packVolume?: string;
    isActive?: string;
  }) {
    const where: Prisma.SkuWhereInput = {
      deletedAt: null,
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.packVolume
        ? {
            OR: [
              { packVolume: { equals: q.packVolume, mode: 'insensitive' } },
              { packVolume: { contains: q.packVolume.replace(/\s+/g, ''), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.isActive === 'true' ? { isActive: true } : q.isActive === 'false' ? { isActive: false } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
              { packVolume: { contains: q.search, mode: 'insensitive' } },
              { product: { name: { contains: q.search, mode: 'insensitive' } } },
              { product: { brand: { name: { contains: q.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.sku.count({ where }),
      prisma.sku.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { code: 'asc' },
        include: {
          product: {
            include: { brand: true },
          },
        },
      }),
    ]);
    const mapped = items.map((item) => {
      const bottlesPerHour = item.bottlesPerHour && item.bottlesPerHour > 0 ? item.bottlesPerHour : 5400;
      const packSize = item.packSize && Number(item.packSize) > 0 ? Number(item.packSize) : null;
      return {
        ...item,
        bottlesPerHour,
        packSize,
        casesPerHourTarget: packSize ? Math.round(bottlesPerHour / packSize) : null,
      };
    });
    return { total, items: mapped };
  },
  async createSku(data: Prisma.SkuUncheckedCreateInput, req?: Request) {
    const item = await prisma.sku.create({
      data,
      include: { product: { include: { brand: true } } },
    });
    await writeAuditLog({ req, action: 'CREATE', entity: 'Sku', entityId: item.id, after: item });
    return item;
  },
  async updateSku(id: string, data: Prisma.SkuUncheckedUpdateInput, req?: Request) {
    const before = await prisma.sku.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('SKU not found');
    const item = await prisma.sku.update({
      where: { id },
      data,
      include: { product: { include: { brand: true } } },
    });
    await writeAuditLog({ req, action: 'UPDATE', entity: 'Sku', entityId: id, before, after: item });
    return item;
  },
  deleteSku: (id: string, req?: Request) => softDelete('sku', id, req, 'Sku'),

  // Machines
  async listMachines(q: { skip: number; take: number; search?: string; lineId?: string }) {
    const where: Prisma.MachineWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(q.lineId ? { lineId: q.lineId } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.machine.count({ where }),
      prisma.machine.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
        include: { line: { include: { plant: true } } },
      }),
    ]);
    return { total, items };
  },
  async createMachine(data: Prisma.MachineUncheckedCreateInput, req?: Request) {
    const item = await prisma.machine.create({ data, include: { line: true } });
    await writeAuditLog({ req, action: 'CREATE', entity: 'Machine', entityId: item.id, after: item });
    return item;
  },
  async updateMachine(id: string, data: Prisma.MachineUncheckedUpdateInput, req?: Request) {
    const before = await prisma.machine.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Machine not found');
    const item = await prisma.machine.update({ where: { id }, data, include: { line: true } });
    await writeAuditLog({ req, action: 'UPDATE', entity: 'Machine', entityId: id, before, after: item });
    return item;
  },
  deleteMachine: (id: string, req?: Request) => softDelete('machine', id, req, 'Machine'),

  // Downtime categories / reasons
  async listDowntimeCategories() {
    return prisma.downtimeCategory.findMany({
      where: { deletedAt: null, isActive: true },
      include: { reasons: { where: { deletedAt: null, isActive: true } } },
      orderBy: { name: 'asc' },
    });
  },
  async createDowntimeCategory(data: Prisma.DowntimeCategoryCreateInput, req?: Request) {
    const item = await prisma.downtimeCategory.create({ data });
    await writeAuditLog({ req, action: 'CREATE', entity: 'DowntimeCategory', entityId: item.id, after: item });
    return item;
  },
  async updateDowntimeCategory(id: string, data: Prisma.DowntimeCategoryUpdateInput, req?: Request) {
    const before = await prisma.downtimeCategory.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Category not found');
    const item = await prisma.downtimeCategory.update({ where: { id }, data });
    await writeAuditLog({
      req,
      action: 'UPDATE',
      entity: 'DowntimeCategory',
      entityId: id,
      before,
      after: item,
    });
    return item;
  },
  deleteDowntimeCategory: (id: string, req?: Request) =>
    softDelete('downtimeCategory', id, req, 'DowntimeCategory'),

  async createDowntimeReason(data: Prisma.DowntimeReasonUncheckedCreateInput, req?: Request) {
    const item = await prisma.downtimeReason.create({ data });
    await writeAuditLog({ req, action: 'CREATE', entity: 'DowntimeReason', entityId: item.id, after: item });
    return item;
  },
  async updateDowntimeReason(id: string, data: Prisma.DowntimeReasonUncheckedUpdateInput, req?: Request) {
    const before = await prisma.downtimeReason.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Reason not found');
    const item = await prisma.downtimeReason.update({ where: { id }, data });
    await writeAuditLog({
      req,
      action: 'UPDATE',
      entity: 'DowntimeReason',
      entityId: id,
      before,
      after: item,
    });
    return item;
  },
  deleteDowntimeReason: (id: string, req?: Request) =>
    softDelete('downtimeReason', id, req, 'DowntimeReason'),

  // Changeover types
  async listChangeoverTypes() {
    const rows = await prisma.changeoverType.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
    // Guard against legacy duplicate names (different codes)
    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = r.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  async createChangeoverType(data: Prisma.ChangeoverTypeCreateInput, req?: Request) {
    const item = await prisma.changeoverType.create({ data });
    await writeAuditLog({ req, action: 'CREATE', entity: 'ChangeoverType', entityId: item.id, after: item });
    return item;
  },
  async updateChangeoverType(id: string, data: Prisma.ChangeoverTypeUpdateInput, req?: Request) {
    const before = await prisma.changeoverType.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Changeover type not found');
    const item = await prisma.changeoverType.update({ where: { id }, data });
    await writeAuditLog({
      req,
      action: 'UPDATE',
      entity: 'ChangeoverType',
      entityId: id,
      before,
      after: item,
    });
    return item;
  },
  deleteChangeoverType: (id: string, req?: Request) =>
    softDelete('changeoverType', id, req, 'ChangeoverType'),

  // Shifts
  async listShifts() {
    return prisma.shift.findMany({ where: { deletedAt: null }, orderBy: { startTime: 'asc' } });
  },
  async createShift(data: Prisma.ShiftCreateInput, req?: Request) {
    const item = await prisma.shift.create({ data });
    await writeAuditLog({ req, action: 'CREATE', entity: 'Shift', entityId: item.id, after: item });
    return item;
  },
  async updateShift(id: string, data: Prisma.ShiftUpdateInput, req?: Request) {
    const before = await prisma.shift.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundError('Shift not found');
    const item = await prisma.shift.update({ where: { id }, data });
    await writeAuditLog({ req, action: 'UPDATE', entity: 'Shift', entityId: id, before, after: item });
    return item;
  },
  deleteShift: (id: string, req?: Request) => softDelete('shift', id, req, 'Shift'),
};
