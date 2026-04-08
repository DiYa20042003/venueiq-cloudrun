#!/usr/bin/env bash
# ============================================================
#  VenueIQ — Google Cloud Run Deployment Script
#  Run this script once to deploy. Re-run to update.
# ============================================================
set -e

# ── CONFIG — edit these three lines ──────────────────────────
PROJECT_ID="tokyo-wave-448214-p1"        # gcloud projects list
REGION="asia-south1"                     # Mumbai (closest for IN)
SERVICE_NAME="venueiq"
# ─────────────────────────────────────────────────────────────

IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo ""
echo "══════════════════════════════════════════"
echo "  VenueIQ → Cloud Run Deployment"
echo "  Project : $PROJECT_ID"
echo "  Region  : $REGION"
echo "══════════════════════════════════════════"
echo ""

# 1. Authenticate + set project
gcloud auth login --quiet
gcloud config set project "$PROJECT_ID"

# 2. Enable required APIs
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com

# 3. Build + push image using Cloud Build (no local Docker needed)
gcloud builds submit \
  --tag "$IMAGE" \
  --timeout=300s \
  .

# 4. Deploy to Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 300

# 5. Get the deployed URL
URL=$(gcloud run services describe "$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --format 'value(status.url)')

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ Deployed successfully!"
echo "  URL: $URL"
echo "══════════════════════════════════════════"
echo ""
