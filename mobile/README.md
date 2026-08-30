# LineSight Mobile (Expo)

Phone app for **Nakshatra Beverages** Production Management — shop-floor OEE, work orders, and hourly production entry.

## Features

- Secure login (same JWT API as the web app)
- Today’s OEE KPIs (A · P · Q)
- Work orders for the current day
- Hourly production entry from the floor
- Notifications / alerts
- Profile & sign-out

## Prerequisites

- Node.js 20+
- Backend API running (`npm run dev:backend` from repo root)
- Expo Go on your phone, or an emulator

## Setup

```bash
cd mobile
npm install
```

### API URL

Default:

| Platform | URL |
|----------|-----|
| iOS simulator / web | `http://localhost:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` |
| Physical device | set `EXPO_PUBLIC_API_URL` |

Example for a phone on the same Wi‑Fi:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api npm start
```

Ensure `CORS_ORIGIN` on the backend includes Expo origins if you use web (`http://localhost:8081`).

## Run

```bash
npm start          # QR code → Expo Go
npm run android
npm run ios
npm run web
```

## Demo accounts

Password: `Password@123`

- `supervisor@pms.local` (recommended for shop floor)
- `manager@pms.local`
- `admin@pms.local`
