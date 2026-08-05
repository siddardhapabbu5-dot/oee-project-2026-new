import { useQuery } from '@tanstack/react-query';
import api, { type ApiResponse } from '../lib/api';
import { CrudPage, StatusBadge } from '../components/CrudPage';
import { Badge, ActiveStatus } from '../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

export function UsersPage() {
  return (
    <CrudPage<Row>
      title="User Management"
      subtitle="Admin control for roles, plants, and access"
      endpoint="/users"
      columns={[
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'name', label: 'Name', render: (r) => `${r.firstName} ${r.lastName}` },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role', render: (r) => <Badge>{r.role}</Badge> },
        {
          key: 'plant',
          label: 'Plant',
          render: (r) => r.plant?.name || '—',
        },
        {
          key: 'isActive',
          label: 'Status',
          render: (r) => <ActiveStatus active={!!r.isActive} />,
        },
      ]}
      fields={[
        { name: 'employeeId', label: 'Employee ID' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'password', label: 'Password', type: 'password' },
        { name: 'firstName', label: 'First Name' },
        { name: 'lastName', label: 'Last Name' },
        { name: 'phone', label: 'Phone' },
        {
          name: 'role',
          label: 'Role',
          options: [
            { value: 'ADMIN', label: 'Admin' },
            { value: 'PRODUCTION_MANAGER', label: 'Production Manager' },
            { value: 'LINE_SUPERVISOR', label: 'Line Supervisor' },
          ],
        },
      ]}
      mapCreate={(form) => ({
        ...form,
        password: form.password || undefined,
      })}
    />
  );
}

export function PlantsPage() {
  return (
    <CrudPage<Row>
      title="Plant Management"
      endpoint="/plants"
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'location', label: 'Location' },
        { key: 'timezone', label: 'Timezone' },
      ]}
      fields={[
        { name: 'code', label: 'Code' },
        { name: 'name', label: 'Name' },
        { name: 'location', label: 'Location' },
        { name: 'timezone', label: 'Timezone' },
      ]}
    />
  );
}

export function LinesPage() {
  const plants = useQuery({
    queryKey: ['plants-options'],
    queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/plants', { params: { limit: 100 } })).data.data,
  });
  return (
    <CrudPage<Row>
      title="Production Lines"
      subtitle="Plant · Line Number · Line Name · Rated Speed"
      endpoint="/lines"
      columns={[
        { key: 'plant', label: 'Plant Name', render: (r) => r.plant?.name || '—' },
        { key: 'code', label: 'Line Number' },
        { key: 'name', label: 'Line Name' },
        {
          key: 'capacityCph',
          label: 'Rated Speed',
          render: (r) => (r.capacityCph != null ? `${r.capacityCph} BPM` : '—'),
        },
      ]}
      fields={[
        {
          name: 'plantId',
          label: 'Plant Name',
          options: (plants.data ?? []).map((p) => ({ value: p.id, label: p.name })),
        },
        { name: 'code', label: 'Line Number' },
        { name: 'name', label: 'Line Name' },
        { name: 'capacityCph', label: 'Rated Speed (BPM)', type: 'number' },
      ]}
    />
  );
}

export function BrandsPage() {
  return (
    <CrudPage<Row>
      title="Brands"
      subtitle="Brand master"
      endpoint="/brands"
      columns={[
        { key: 'name', label: 'Brand' },
        { key: 'description', label: 'Description' },
      ]}
      fields={[
        { name: 'name', label: 'Brand Name' },
        { name: 'description', label: 'Description' },
      ]}
      mapCreate={(form) => ({
        name: form.name,
        description: form.description || null,
        code:
          form.code ||
          String(form.name || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) ||
          `BRAND-${Date.now()}`,
      })}
    />
  );
}

export function ProductsPage() {
  const products = useQuery({
    queryKey: ['products-options'],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/products', { params: { limit: 100 } })).data
        .data,
  });

  /** Pack size (units/case) from pack volume */
  function packSizeFromVolume(volume?: string | null) {
    const v = (volume || '').toUpperCase().replace(/\s+/g, '');
    if (v.includes('200ML') || v === '200') return 36;
    if (v.includes('250ML') || v === '250') return 30;
    if (v.includes('300ML') || v === '300') return 24;
    if (v.includes('500ML') || v === '500') return 24;
    if (v.includes('750ML') || v === '750') return 12;
    if (v.includes('1000ML') || v.includes('1L') || v === '1000') return 12;
    if (v.includes('2000ML') || v.includes('2L') || v === '2000') return 6;
    if (v.includes('20L') || v.includes('JAR')) return 1;
    return null;
  }

  const PACK_VOLUMES = ['200 ML', '250 ML', '300 ML', '500 ML', '750 ML', '1000 ML', '2000 ML', 'Jar-20L'];

  return (
    <CrudPage<Row>
      title="Products & SKUs"
      subtitle="SKU Code · Product Name · Pack Volume · Pack Size · Status"
      endpoint="/skus"
      columns={[
        { key: 'code', label: 'SKU Code' },
        {
          key: 'productName',
          label: 'Product Name',
          render: (r) => r.product?.name || r.name || '—',
        },
        {
          key: 'packVolume',
          label: 'Pack Volume',
          render: (r) => r.packVolume || '—',
        },
        {
          key: 'packSize',
          label: 'Pack Size',
          render: (r) => (r.packSize != null ? String(r.packSize) : '—'),
        },
        {
          key: 'isActive',
          label: 'Production Status',
          render: (r) => <ActiveStatus active={!!r.isActive} />,
        },
      ]}
      fields={[
        { name: 'code', label: 'SKU Code' },
        {
          name: 'productId',
          label: 'Product Name',
          options: (products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
        },
        { name: 'name', label: 'SKU Display Name' },
        {
          name: 'packVolume',
          label: 'Pack Volume',
          options: PACK_VOLUMES.map((v) => ({ value: v, label: v })),
        },
        { name: 'packSize', label: 'Pack Size (units/case)', type: 'number' },
        {
          name: 'isActive',
          label: 'Production Status',
          options: [
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ],
        },
      ]}
      mapCreate={(form) => {
        const volume = form.packVolume || null;
        const auto = packSizeFromVolume(volume);
        const size = form.packSize !== '' && form.packSize != null ? Number(form.packSize) : auto;
        return {
          code: form.code,
          name: form.name || form.packVolume || form.code,
          productId: form.productId,
          packVolume: volume,
          packSize: Number.isFinite(size as number) ? size : null,
          isActive: form.isActive !== 'false',
        };
      }}
    />
  );
}

export function MachinesPage() {
  const lines = useQuery({
    queryKey: ['lines-options'],
    queryFn: async () => (await api.get<ApiResponse<Array<{ id: string; name: string }>>>('/lines', { params: { limit: 100 } })).data.data,
  });
  const stripMachinePrefix = (code?: string | null) =>
    String(code || '').replace(/^M-?/i, '');

  return (
    <CrudPage<Row>
      title="Machines"
      endpoint="/machines"
      columns={[
        {
          key: 'code',
          label: 'Machine ID',
          render: (r) => stripMachinePrefix(r.code),
        },
        { key: 'name', label: 'Name' },
        { key: 'line', label: 'Line', render: (r) => r.line?.name },
        { key: 'description', label: 'Description' },
      ]}
      fields={[
        { name: 'code', label: 'Machine ID' },
        { name: 'name', label: 'Name' },
        {
          name: 'lineId',
          label: 'Production Line',
          options: (lines.data ?? []).map((l) => ({ value: l.id, label: l.name })),
        },
        { name: 'description', label: 'Description' },
      ]}
      mapCreate={(form) => ({
        code: stripMachinePrefix(form.code),
        name: form.name,
        lineId: form.lineId || null,
        description: form.description || null,
      })}
    />
  );
}

export function ShiftsPage() {
  return (
    <CrudPage<Row>
      title="Shifts"
      endpoint="/shifts"
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'startTime', label: 'Start' },
        { key: 'endTime', label: 'End' },
      ]}
      fields={[
        { name: 'code', label: 'Code' },
        { name: 'name', label: 'Name' },
        { name: 'startTime', label: 'Start (HH:mm)' },
        { name: 'endTime', label: 'End (HH:mm)' },
      ]}
    />
  );
}

export function ChangeoverTypesPage() {
  return (
    <CrudPage<Row>
      title="Changeover Types"
      endpoint="/changeover-types"
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'standardMins', label: 'Standard (min)' },
      ]}
      fields={[
        { name: 'code', label: 'Code' },
        { name: 'name', label: 'Name' },
        { name: 'standardMins', label: 'Standard Minutes', type: 'number' },
        { name: 'description', label: 'Description' },
      ]}
    />
  );
}

export { StatusBadge };
