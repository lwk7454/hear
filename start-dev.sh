#!/bin/bash
set -e

# Load API Key from terraform.tfvars or .env
if [ -z "$RUNPOD_API_KEY" ]; then
  RUNPOD_API_KEY=$(grep 'runpod_api_key' terraform/environments/dev/terraform.tfvars | cut -d '"' -f 2)
fi

if [ -z "$RUNPOD_API_KEY" ]; then
  echo "❌ Error: RUNPOD_API_KEY not found in terraform/environments/dev/terraform.tfvars"
  exit 1
fi

POD_NAME="hear-dev-server"

echo "🔍 looking up pod '$POD_NAME'..."

QUERY="query { myself { pods { id name } } }"
RESPONSE=$(curl -s -X POST "https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUERY\"}")

# Use grep/sed/awk if jq not installed, but prefer jq
if command -v jq &> /dev/null; then
  POD_ID=$(echo $RESPONSE | jq -r ".data.myself.pods[] | select(.name == \"$POD_NAME\") | .id")
else
  # Fallback: simple grep match (assumes standard formatting)
  POD_ID=$(echo $RESPONSE | grep -o "$POD_NAME\",\"id\":\"[^\"]*" | grep -o 'id":"[^"]*' | cut -d'"' -f3)
fi

if [ -z "$POD_ID" ] || [ "$POD_ID" == "null" ]; then
  echo "❌ Pod '$POD_NAME' not found."
  exit 1
fi


# Try to Resume (often fails for Community/Spot pods)
# echo "🚀 Starting Pod..."
# START_QUERY="mutation { podResume(input: { podId: \"$POD_ID\" }) { id } }"
# START_RES=$(curl -s -X POST "https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}" \
#   -H "Content-Type: application/json" \
#   -d "{\"query\": \"$START_QUERY\"}")

# If Internal Server Error (common), Fallback to Redeploy
# echo "Result: $START_RES"

echo "🔄 Re-creating Pod (Resume unstable)..."
TERM_QUERY="mutation { podTerminate(input: { podId: \"$POD_ID\" }) { id } }"
curl -s -X POST "https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$TERM_QUERY\"}"

echo "🚀 Running Deploy Script..."
./deploy-dev.sh
