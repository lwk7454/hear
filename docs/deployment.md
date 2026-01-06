# Deployment & Infrastructure Manual

**Hear** leverages a cost-effective, hybrid cloud architecture:
*   **Hosting**: AWS (Lightsail + S3 + CloudFront) for high uptime and stable domains.
*   **Compute**: RunPod (GPU Workers) for on-demand AI processing.
*   **Data**: Supabase (Postgres + Auth).

---

## 1. Architecture Design

### **Frontend (Web & App)**
*   **Service**: **AWS S3** + **CloudFront** (CDN).
*   **Why**: Extremely low cost, global edge caching, and zero-maintenance static hosting.
*   **Build Artifact**: Static Export (`next build` -> `out/`).
*   **Region**: `ca-central-1` (Canada Central).

### **Backend (Server)**
*   **Service**: **AWS Lightsail Container Service** (Micro Power).
*   **Why**: ~ $7/month fixed cost, native SSL management, stable domain, and zero-downtime deployments.
*   **Container**: Node.js / Fastify app (`apps/server`).
*   **Region**: `ca-central-1` (Colocated with Supabase).

### **AI Workers (GPU)**
*   **Service**: **RunPod Serverless**.
*   **Why**: Pay-per-second GPU usage. We don't need a GPU running 24/7.
*   **Workers**:
    *   `worker-higgs`: Voice Cloning & Synthesis.
    *   `worker-cleanser`: Audio source separation (Demucs).

### **Data Layer**
*   **Service**: **Supabase** (Pro tier recommended for prod).
*   **Region**: `ca-central-1`.
*   **Components**: Postgres DB, Auth, Storage (User uploads).

---

## 2. CI/CD Pipelines (GitHub Actions)

We use **GitHub Actions** for automated deployments.

| Component | Workflow File | Triggers | Actions |
| :--- | :--- | :--- | :--- |
| **Server** | `deploy-server.yml` | Push to `apps/server/**` | 1. Builds Docker Image.<br>2. Pushes directly to Lightsail.<br>3. Updates deployment (Zero Downtime). |
| **Web** | `deploy-web.yml` | Push to `apps/web/**` | 1. `pnpm build` (Static).<br>2. Syncs to S3 Bucket.<br>3. Invalidates CloudFront Cache. |
| **Workers** | *Various* | Push to `apps/worker-*` | Builds and pushes Docker images to GHCR for RunPod. |

---

## 3. Configuration & Secrets

### **GitHub Secrets**
Required for CI/CD pipelines to function:

| Secret | Scope | Description |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | Global | AWS IAM User with S3/Lightsail/CloudFront access. |
| `AWS_SECRET_ACCESS_KEY` | Global | AWS Secret Key. |
| `NEXT_PUBLIC_API_URL` | Global | The public URL of the Lightsail Server (e.g., `https://...cs.amazonlightsail.com/`). |

### **Environment Variables**
#### **Backend (`apps/server`)**
Managed via **Terraform** (`terraform/environments/prod|dev/main.tf`).
*   `DATABASE_URL`: Connection string to Supabase Postgres.
*   `SUPABASE_URL` / `KEY`: For Supabase Client.
*   `GOOGLE_LOGIN_REDIRECT_URI`: Must match the Lightsail URL + `/auth/login/google/callback`.

#### **Frontend (`apps/web`)**
Baked in at build time via `NEXT_PUBLIC_API_URL` (passed from GitHub Secrets).

---

## 4. Manual Deployment Guide

### **Deploying Development (`dev`)**
We have a helper script that orchestrates Terraform and local checks:

```bash
# 1. Ensure you have AWS credentials set locally
export AWS_PROFILE=your-profile

# 2. Run the deploy script
./deploy-dev.sh
```
*This script runs `terraform apply` and outputs the current Server URL.*

### **Promoting to Production**
1.  **Infrastructure**:
    *   Create a new Terraform environment folder: `terraform/environments/prod`.
    *   Set `environment = "prod"` in variables.
    *   Run `terraform apply`.
2.  **GitHub**:
    *   Add "Environment Secrets" if you want to separate Dev/Prod credentials.
    *   Or simply push to the `main` branch (currently configured for a single env).

---

## 5. Troubleshooting

### **"Limit Exceeded" on Lightsail**
*   AWS restricts the number of container services per region (default 3).
*   **Fix**: Check other regions or delete unused services via `aws lightsail get-container-services`.

### **CORS Errors**
*   Ensure `NEXT_PUBLIC_API_URL` matches the running server exactly (HTTPS).
*   Check `CORS_ORIGINS` env var in the Server Terraform module.

### **Frontend 404s**
*   If S3 deploy succeeds but site is broken, CloudFront invalidation might have failed or takes time to propagate.
*   Check the Browser Console for matching API URLs.
