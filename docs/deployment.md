# Deployment & Infrastructure Manual

**Hear** leverages a cost-effective, hybrid cloud architecture:
*   **Hosting**: AWS (Lightsail + S3 + CloudFront) for high uptime and stable domains.
*   **Compute**: RunPod (GPU Workers) for on-demand AI processing.
*   **Data**: Supabase (Postgres + Auth).

---

## 1. Architecture Design

### **Frontend Apps**
*   **Creator Dashboard (`apps/web`)**:
    *   **Target**: **AWS S3** + **CloudFront**.
    *   **Build**: Static Export (`next build` -> `out/`).
    *   **Domain**: `hear-web-dev.wayneliao.dev` (Dev).
*   **Consumer App (`apps/app`)**:
    *   **Target**: **Vercel** (Recommended for PWA features) or **AWS S3** + **CloudFront**.
    *   **Build**: PWA / Static.
    *   **Domain**: `hear-app-dev.wayneliao.dev` (Dev - Proposed).

### **Backend (Server)**
*   **Service**: **AWS Lightsail Container Service** (Micro Power).
*   **Why**: ~ $7/month fixed cost, native SSL management, stable domain, and zero-downtime deployments.
*   **Container**: Node.js / Fastify app (`apps/server`).
*   **Region**: `ca-central-1` (Colocated with Supabase).

### **AI Workers (GPU)**
*   **Service**: **RunPod Serverless**.
*   **Deployment Model**: **Decentralized**. Each worker has its own Terraform configuration.
*   **Workers**:
    *   `worker-higgs`: Voice Cloning & Synthesis.
    *   `worker-cleanser`: Audio source separation (Demucs) & Diarization.

### **Data Layer**
*   **Service**: **Supabase** (Pro tier recommended for prod).
*   **Region**: `ca-central-1`.
*   **Components**: Postgres DB, Auth, Storage (User uploads).

---

## 2. Infrastructure Automation (Terraform)

We use Terraform to manage infrastructure. The configuration is split into **Root Infrastructure** and **Worker Infrastructure**.

### Root Infrastructure (`terraform/`)
Manages shared resources: AWS Networking (Route53, ACM), Lightsail Server, and S3 Buckets.

*   **Location**: `terraform/environments/{dev,prod}`
*   **Apply**:
    ```bash
    cd terraform/environments/dev
    terraform apply
    ```

### Worker Infrastructure (`apps/worker-*/terraform`)
Manages RunPod Endpoints and Network Volumes specific to each worker. This allows workers to be deployed and scaled independently.

*   **Example: Deploying Higgs Worker**:
    ```bash
    cd apps/worker-higgs/terraform/environments/dev
    terraform apply
    ```

---

## 3. CI/CD Pipelines (GitHub Actions)

We use **GitHub Actions** for automated deployments.

| Component | Workflow File | Triggers | Actions |
| :--- | :--- | :--- | :--- |
| **Server** | `deploy-server.yml` | Push to `apps/server/**` | 1. Builds Docker Image.<br>2. Pushes directly to Lightsail.<br>3. Updates deployment (Zero Downtime). |
| **Web** | `deploy-web.yml` | Push to `apps/web/**` | 1. `pnpm build` (Static).<br>2. Syncs to S3 Bucket.<br>3. Invalidates CloudFront Cache. |
| **Workers** | `deploy-worker-*.yml` | Push to `apps/worker-*` | 1. Builds Docker Image.<br>2. Pushes to GHCR.<br>3. (Optional) Auto-updates RunPod Endpoint via Terraform/API. |

---

## 4. Configuration & Secrets

### **GitHub Secrets**
Required for CI/CD pipelines to function:

| Secret | Scope | Description |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | Global | AWS IAM User with S3/Lightsail/CloudFront access. |
| `AWS_SECRET_ACCESS_KEY` | Global | AWS Secret Key. |
| `RUNPOD_API_KEY` | Global | Key for deploying/managing RunPod workers. |
| `CR_PAT` | Global | GitHub Personal Access Token for pushing images to GHCR. |

### **Environment Variables**
#### **Backend (`apps/server`)**
Managed via **Terraform** (`terraform/environments/prod|dev/main.tf`).
*   `DATABASE_URL`: Connection string to Supabase Postgres.
*   `HIGGS_API_URL`: URL of the deployed RunPod worker.
*   `RUNPOD_API_KEY`: Used to wake/manage workers programmatically.

---

## 5. Manual Deployment Guide

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

## 6. Troubleshooting

### **"Limit Exceeded" on Lightsail**
*   AWS restricts the number of container services per region (default 3).
*   **Fix**: Check other regions or delete unused services via `aws lightsail get-container-services`.

### **RunPod Worker Cold Starts**
*   Workers scale to 0 when unused. First request may take 30-60s.
*   **Fix**: Use `idle_timeout` in Terraform to keep workers warm longer, or set `min_workers` to 1 (Costly).

### **Frontend 404s**
*   If S3 deploy succeeds but site is broken, CloudFront invalidation might have failed or takes time to propagate.
*   Check the Browser Console for matching API URLs.
