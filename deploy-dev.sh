#!/bin/bash
set -e

# Ensure we are in the project root
cd "$(dirname "$0")"

echo "🚀 Deploying Server to RunPod Dev..."

# 1. Apply Terraform (Handle optional backend config)
cd terraform/environments/dev
INIT_ARGS=""
if [ -f "backend.tfvars" ]; then
    echo "ℹ️  Using backend.tfvars for initialization"
    INIT_ARGS="-backend-config=backend.tfvars"
fi

terraform init -reconfigure $INIT_ARGS
terraform apply -auto-approve

# 2. Extract Server URL
SERVER_URL=$(terraform output -raw server_url)
echo "✅ Deployment Complete. Server URL: $SERVER_URL"

# 3. Update GitHub Secrets
echo "🔄 Updating GitHub Secrets..."

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) could not be found. Please install it to automate secret updates."
    exit 1
fi

# Check/Set SUPABASE_ACCESS_TOKEN
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "🔑 SUPABASE_ACCESS_TOKEN not set. Attempting to extract from terraform.tfvars..."
    TFVARS_FILE="terraform/environments/dev/terraform.tfvars"
    if [ -f "$TFVARS_FILE" ]; then
        SUPABASE_ACCESS_TOKEN=$(grep 'supabase_access_token' "$TFVARS_FILE" |  awk -F '"' '{print $2}')
        export SUPABASE_ACCESS_TOKEN
        echo "   - Loaded token from terraform.tfvars"
    else
        echo "⚠️  terraform.tfvars not found. Supabase commands might fail."
    fi
fi

# Update SERVER_URL (Optional, for reference or future use)
# gh secret set SERVER_URL --body "$SERVER_URL"


# Ensure Web App uses Stable Proxy (Set once, or ensure sync)
STABLE_API_URL="https://lobeixwzqhyofdjlvlbk.supabase.co/functions/v1/api-proxy"
gh secret set NEXT_PUBLIC_API_URL --body "$STABLE_API_URL"
echo "   - Ensured NEXT_PUBLIC_API_URL points to Stable Proxy: $STABLE_API_URL"

# 5. Deploy API Proxy (optional, usually only needs code changes)
# echo "🚀 Deploying API Proxy..."
# npx supabase functions deploy api-proxy --project-ref lobeixwzqhyofdjlvlbk --no-verify-jwt

echo "🎉 All done! GitHub secrets are now in sync with the new deployment."
