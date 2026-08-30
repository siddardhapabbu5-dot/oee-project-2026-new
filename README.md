# Production Management System (MES / ERP)

Enterprise-grade Production Management Web Application built with **React (Vite)**, **Tailwind CSS**, **Node.js (Express)**, **PostgreSQL**, **Prisma ORM**, and **JWT** role-based authentication.

## Features

### Roles
- **Admin** — users, plants, lines, products/SKUs, supervisors, planning, reports, settings, audit logs
- **Production Manager** — plan vs actual, OEE, monitoring, shift/capacity/downtime/changeover analytics, approvals, Excel/PDF export
- **Line Supervisor** — assigned plans, hourly production, downtime, changeover, manpower, rejects, shift closing, line dashboard
- **Mobile (LineSight)** — Expo phone app for supervisors: today’s OEE, work orders, hourly production entry, alerts

### Core Modules
- Secure login, JWT auth, RBAC, profile & password change, session timeout
- Master data: plants, lines, products, SKUs, machines, downtime categories/reasons, changeover types, shifts, users
- Production planning & shop-floor entry
- OEE KPIs and interactive dashboards (Recharts)
- Notifications (target miss, high downtime, breakdown, pending approvals)
- Reports with Excel & PDF export
- Swagger API docs at `/api/docs`

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, Zustand, Recharts |
| Mobile | Expo (React Native), React Navigation, Zustand, SecureStore |
| Backend | Express, Zod validation, Winston logging, Helmet, rate limiting |
| Database | PostgreSQL 16 + Prisma ORM |
| Auth | JWT (Bearer) + role guards |

## Project Structure

```
├── backend/                 # Express API
│   ├── prisma/              # schema, migrations, seed
│   └── src/
│       ├── config/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       ├── validators/
│       └── utils/
├── frontend/                # React SPA
│   └── src/
│       ├── components/
│       ├── layouts/
│       ├── pages/
│       ├── lib/
│       └── store/
├── mobile/                  # Expo phone app (LineSight Mobile)
│   └── src/
│       ├── components/
│       ├── lib/
│       ├── navigation/
│       ├── screens/
│       └── store/
├── docker-compose.yml       # PostgreSQL
└── README.md
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (local install **or** Docker Desktop)
- npm 10+

## Quick Start

### 1. Start PostgreSQL

**Option A — Docker**

```bash
docker compose up -d
```

**Option B — Local PostgreSQL**

Create database and user matching `backend/.env`:

```sql
CREATE USER pms WITH PASSWORD 'pms_secret';
CREATE DATABASE production_management OWNER pms;
```

### 2. Install & configure

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
npm install --prefix mobile
copy backend\.env.example backend\.env   # Windows
# or: cp backend/.env.example backend/.env
```

### 3. Migrate & seed

```bash
cd backend
npx prisma migrate dev --name init
npm run prisma:seed
cd ..
```

### 4. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:4000  
- Swagger: http://localhost:4000/api/docs  
- Health: http://localhost:4000/health  

### Mobile app (Expo)

```bash
npm run setup:mobile   # once
npm run dev:mobile     # Expo QR / emulator / web
```

See [`mobile/README.md`](mobile/README.md). On a physical phone, set `EXPO_PUBLIC_API_URL` to your machine’s LAN API URL (e.g. `http://192.168.1.20:4000/api`).

## Demo Accounts

Password for all: `Password@123`

| Role | Email |
|------|-------|
| Admin | `admin@pms.local` |
| Production Manager | `manager@pms.local` |
| Line Supervisor | `supervisor@pms.local` |

Seed data includes plants, lines, machines, products/SKUs, 14 days of production plans, hourly entries, downtime, changeovers, notifications, and audit samples.

## API Overview

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `POST /api/auth/change-password` |
| Users | `GET/POST/PATCH/DELETE /api/users` |
| Masters | `/api/plants`, `/lines`, `/products`, `/skus`, `/machines`, `/shifts`, `/downtime-categories`, `/changeover-types` |
| Planning | `GET/POST/PATCH/DELETE /api/plans` |
| Shop floor | `/api/production-entries`, `/downtime-entries`, `/changeover-entries`, `/manpower-entries`, `/shift-closings` |
| Dashboard | `/api/dashboard/kpis`, `/charts`, `/pending-approvals` |
| Reports | `/api/reports/:type`, `/export/excel`, `/export/pdf` |
| System | `/api/notifications`, `/audit-logs`, `/settings`, `/search` |

Report types: `daily`, `shift`, `line`, `oee`, `downtime`, `changeover`, `machine`, `supervisor`.

## OEE Formulas

- **Availability** = (Planned time − Downtime) / Planned time  
- **Performance** = Actual output / Theoretical output on operating time  
- **Quality** = Good cases / Total cases  
- **OEE** = Availability × Performance × Quality  

## Environment Variables

See `backend/.env.example`:

- `DATABASE_URL` — PostgreSQL connection string  
- `JWT_SECRET` — min 16 characters  
- `JWT_EXPIRES_IN` — e.g. `8h`  
- `SESSION_TIMEOUT_MINUTES` — idle/session max age enforced on token `iat`  
- `CORS_ORIGIN` — frontend origin  

## Production Notes

1. Change `JWT_SECRET` and DB credentials.
2. Run `npx prisma migrate deploy` in CI/CD.
3. Build: `npm run build` then serve `frontend/dist` and `backend` with `npm start --prefix backend`.
4. Put API behind HTTPS and restrict CORS.
5. Consider Redis for rate-limit/store and centralized log shipping.

## License

Proprietary — internal use.
