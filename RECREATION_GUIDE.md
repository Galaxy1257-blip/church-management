# Church Management System (ChMS) – Complete Recreation & Deployment Guide

This document contains everything needed to recreate, configure, deploy, and seed this entire system from scratch at any time.

---

## 1. System Architecture

```
                          ┌───────────────────────────┐
                          │   Next.js Web Frontend    │
                          │        (Vercel)           │
                          │ church-management.vercel… │
                          └─────────────┬─────────────┘
                                        │ HTTPS
                                        │ REST (/api/v1)
                                        ▼
                          ┌───────────────────────────┐
                          │     NestJS API Backend    │
                          │         (Render)          │
                          │   chms-api.onrender.com   │
                          └─────────────┬─────────────┘
                                        │ Pooling (SSL)
                                        ▼
                          ┌───────────────────────────┐
                          │    PostgreSQL Database    │
                          │      (Neon Serverless)    │
                          └───────────────────────────┘
```

- **Monorepo Structure (npm workspaces / Turborepo):**
  - `apps/api`: NestJS backend REST API
  - `apps/web`: Next.js 14+ frontend web app
  - `packages/db`: Prisma ORM schema, migrations, seed scripts, RLS policies
  - `packages/shared`: Shared TypeScript types, utilities, Ghanaian phone number normalizer

---

## 2. Step-by-Step Reproduction Guide

### Phase 1: Create the Cloud Database (Neon)

1. Sign up / log in to [neon.tech](https://neon.tech).
2. Create a new project (e.g. `church-management`).
3. Select **Postgres 16+** and choose your region (e.g. `AWS us-west-2` or `eu-central-1`).
4. On the Neon Dashboard, click **Connect** and select the **Pooled connection** string:
   ```
   postgresql://neondb_owner:<PASSWORD>@<HOST>-pooler.<REGION>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   *(Keep this connection string handy — it will be used for your local environment, migration runner, and Render backend).*

---

### Phase 2: Run Database Migrations & Seed Data

You can run these setup scripts directly from your machine against the Neon database:

#### 1. Configure Local Environment
In the repository root, you can point to Neon or set your environment variables in PowerShell:
```powershell
$env:DATABASE_URL="postgresql://neondb_owner:<PASSWORD>@<HOST>-pooler.<REGION>.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
$env:OWNER_DATABASE_URL=$env:DATABASE_URL
$env:PLATFORM_DATABASE_URL=$env:DATABASE_URL
```

#### 2. Install Dependencies & Build Packages
```bash
npm install
npm run build -w packages/shared
npm run build -w packages/db
```

#### 3. Push Prisma Migrations
```bash
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

#### 4. Apply Database Extras & Permissions
```bash
node packages/db/dist/apply-extras.js
node packages/db/dist/create-roles.js
```

#### 5. Seed the Demo Accounts
Run the account seeding script:
```bash
node scripts/tmp-demo-accounts.js
```
This automatically provisions the `demo` church and creates all standard role accounts with password **`admin1234`**.

---

### Phase 3: Deploy Backend API to Render

1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository (`Galaxy1257-blip/church-management`).
4. Configure service settings:
   - **Name:** `chms-api`
   - **Environment:** `Node`
   - **Region:** Same or close to your Neon database region
   - **Branch:** `main`
   - **Root Directory:** *(leave blank / repo root)*
   - **Build Command:**
     ```bash
     npm install && npm run build
     ```
   - **Start Command:**
     ```bash
     npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && node apps/api/dist/main.js
     ```
   - **Instance Type:** `Free`

5. Add **Environment Variables** in Render:
   | Variable | Value | Purpose |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production optimizations |
   | `PORT` | `4000` | Port listened by NestJS |
   | `DATABASE_URL` | `<Your Neon pooled connection string>` | App queries |
   | `OWNER_DATABASE_URL` | `<Your Neon pooled connection string>` | Migrations / DDL |
   | `PLATFORM_DATABASE_URL` | `<Your Neon pooled connection string>` | Cross-tenant lookups |
   | `JWT_SECRET` | `dev-only-change-me-32chars-min-secret!!` *(or random 32+ char string)* | JWT auth signing |
   | `ACCESS_TOKEN_TTL` | `15m` | Token expiry |
   | `REFRESH_TOKEN_TTL` | `30d` | Refresh token duration |
   | `WEB_URL` | `https://church-management-gray.vercel.app` *(or your Vercel URL)* | Allowed CORS origin |
   | `PAYSTACK_MODE` | `mock` | Payment gateway mode |
   | `SMS_GATEWAY` | `mock` | SMS gateway mode |

6. Click **Deploy Web Service**. Once finished, note your service URL (e.g. `https://chms-api-lfox.onrender.com`).

---

### Phase 4: Deploy Frontend to Vercel

1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository.
4. In project configuration:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** click Edit and select `apps/web`
5. Under **Environment Variables**, add:
   | Variable | Value | Note |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_API_URL` | `https://<YOUR-RENDER-URL>.onrender.com/api/v1` | **CRITICAL:** Must include `/api/v1` at the end |

6. Click **Deploy**.
7. Once deployed, copy your production Vercel domain (e.g., `https://church-management-gray.vercel.app`) and ensure it matches the `WEB_URL` set on Render.

---

## 3. Demo Accounts & Credentials Reference

Once seeded, you can log in on the web app at `/login`:

- **Church ID / Slug:** `demo`
- **Default Password:** `admin1234`

| Role | Display Name | Phone (Local) | Phone (E.164) |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Dev Admin | `0240000000` | `+233240000000` |
| **Pastor** | Pastor | `0550449840` | `+233550449840` |
| **Secretary** | Secretary | `0550449841` | `+233550449841` |
| **Finance Officer** | Finance Officer | `0550449842` | `+233550449842` |
| **Usher** | Usher | `0550449843` | `+233550449843` |
| **Elder** | Elder | `0550449844` | `+233550449844` |
| **Teacher / Leader** | Teacher | `0550449845` | `+233550449845` |
| **Member** | Akosua Nyarko | `0550449846` | `+233550449846` |

*(Note: The system automatically normalizes local 10-digit Ghana numbers starting with `0` into international E.164 format `+233...`).*

---

## 4. Crucial Gotchas & Troubleshooting Lessons

### 1. `Cannot POST /auth/login` (404 Error)
- **Cause:** The backend NestJS app configures a global API prefix: `app.setGlobalPrefix('api/v1')` in `apps/api/src/main.ts`.
- **Fix:** In Vercel environment variables, `NEXT_PUBLIC_API_URL` **must** be set to:
  `https://your-api.onrender.com/api/v1` (with `/api/v1`). If set without `/api/v1`, requests hit `/auth/login` and 404.

### 2. `Invalid Credentials`
- **Cause:** 
  1. Wrong church slug: Default demo workspace is `demo`.
  2. Neon database hasn't had the accounts seeded yet.
- **Fix:** Run `node scripts/tmp-demo-accounts.js` with your `DATABASE_URL` set to Neon to ensure all user records and password hashes exist.

### 3. Render Free Tier Cold Starts
- **Behavior:** On Render's free tier, the web service spins down after 15 minutes of inactivity.
- **Symptom:** First login or request after being idle may take 30 to 50 seconds to respond. Subsequent requests will be fast.

### 4. Neon Database Remote Transaction Timeouts
- **Fix:** Remote cloud databases have higher network latency than localhost. In `packages/db/src/tenant.ts`, the Prisma transaction timeout is set to `timeout: 60000` (60s) to prevent query timeouts during complex multi-row inserts.

### 5. CORS Header Rules
- In `apps/api/src/main.ts`, CORS is configured to automatically allow any origin ending in `.vercel.app`, `localhost`, or matching the `WEB_URL` environment variable.

---

## 5. Local Development Commands

To run everything on your local development machine:

```bash
# 1. Install all dependencies across monorepo
npm install

# 2. Build shared packages
npm run build -w packages/shared
npm run build -w packages/db

# 3. Start NestJS Backend (port 4000)
npm run dev -w apps/api

# 4. Start Next.js Frontend (port 3000)
npm run dev -w apps/web
```
Front-end will run on `http://localhost:3000` and communicate with API at `http://localhost:4000/api/v1`.
