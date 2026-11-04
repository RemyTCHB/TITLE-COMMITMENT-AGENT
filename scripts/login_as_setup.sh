#!/usr/bin/env bash
# One-time: lets the engine make Login As User sign-ins (owner 2026-11-04, as in the Universal Team Hub).
#
# Run it in Cloud Shell (console.cloud.google.com → the >_ button, top right) signed in as the project owner. Safe to
# run again. It gives the engine's own Google identity (title-agent-engine) two more roles in this project:
#   - Firebase Authentication Viewer: find a team member's account by their email (it reads; it changes nothing)
#   - Service Account Token Creator, on itself only: sign the one-time sign-in it hands the owner
# and turns on the IAM Credentials API that signing uses. Then add the GitHub secret LOGIN_AS_OWNER (the owner's
# @totalchb.com sign-in email) and run Deploy engine.
set -euo pipefail

PROJECT=title-commitment-agent
RUNTIME=title-agent-engine@$PROJECT.iam.gserviceaccount.com

gcloud config set project "$PROJECT" >/dev/null
echo "1/3 Turning on the IAM Credentials API…"
gcloud services enable iamcredentials.googleapis.com
echo "2/3 Firebase Authentication Viewer for the engine…"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUNTIME" \
  --role=roles/firebaseauth.viewer --condition=None >/dev/null
echo "3/3 Service Account Token Creator, on the engine's own identity only…"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --member="serviceAccount:$RUNTIME" \
  --role=roles/iam.serviceAccountTokenCreator >/dev/null
echo
echo "Done. Now: GitHub → Settings → Secrets and variables → Actions → New secret LOGIN_AS_OWNER (the owner's"
echo "@totalchb.com email), then Actions → Deploy engine → Run workflow."
