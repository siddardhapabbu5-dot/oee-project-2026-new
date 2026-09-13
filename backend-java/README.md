# Nakshatra PMS — Spring Boot Backend

Java **Spring Boot 3** + **PostgreSQL** API with **JWT authentication** and **role-based access control**.

Uses the **same database** as the Node/Prisma backend (`production_management`).

## Roles

| Role | Access |
|------|--------|
| `ADMIN` | Users, plants CRUD, full system |
| `PRODUCTION_MANAGER` | Plant ops, approvals, analytics |
| `LINE_SUPERVISOR` | Shop-floor entry, own line plans |

Spring authorities are `ROLE_ADMIN`, `ROLE_PRODUCTION_MANAGER`, `ROLE_LINE_SUPERVISOR`.

## Prerequisites

- **JDK 17+**
- **Maven 3.9+**
- PostgreSQL running (same as today: Docker `npm run db:up` from repo root)

## Configure

Edit `src/main/resources/application.yml` or set env vars:

```bash
JWT_SECRET=change-me-to-a-long-random-secret-key-min-32-chars!!
CORS_ORIGIN=http://localhost:5176
```

DB defaults match Node:

- URL: `jdbc:postgresql://localhost:5432/production_management`
- User / password: `pms` / `pms_secret`

## Run

```bash
cd backend-java
mvn spring-boot:run
```

API listens on **http://localhost:8081**

> Keep Node on `4000` and Spring on `8081`, or stop Node and point the frontend at Spring:

```env
VITE_API_URL=http://localhost:8081/api
```

## Auth APIs (frontend-compatible envelope)

### Login
```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@pms.local", "password": "Password@123" }
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": "...", "email": "...", "role": "ADMIN", ... }
  }
}
```

### Me
```http
GET /api/auth/me
Authorization: Bearer <jwt>
```

### Users (ADMIN only)
```http
GET  /api/users
POST /api/users
Authorization: Bearer <jwt>
```

### Plants (any authenticated role)
```http
GET /api/plants
```

### Role demos
```http
GET /api/roles/whoami
GET /api/roles/admin-only
GET /api/roles/manager-or-admin
GET /api/roles/supervisor-area
```

### Health
```http
GET /health
```

## Point frontend at Spring

In `frontend/.env` or shell:

```env
VITE_API_URL=http://localhost:8080/api
```

Or change Vite proxy target from `4000` → `8080`.

## What’s included vs Node backend

| Area | Status |
|------|--------|
| JWT login / me / users | Done |
| Role guards (ADMIN / PM / Supervisor) | Done |
| Plants list | Done |
| Production entries, downtime, OEE dashboards | Next (port from Node services) |

Existing users/passwords from Prisma seed work (BCrypt compatible).

## Next modules to port

1. Production plans + entries + downtime  
2. Maintenance reliability (MTBF/MTTR)  
3. Masters (lines, machines, categories)  
4. Dashboards / reports  

Ask to continue with any module and it will be added under `backend-java`.
