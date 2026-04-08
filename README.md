# VenueIQ — Smart Stadium Experience Platform

Full-stack Node.js app deployable to Google Cloud Run in minutes.

## Project Structure

```
venueiq/
├── src/
│   └── server.js        # Express + Socket.IO backend
├── public/
│   └── index.html       # Full frontend SPA
├── Dockerfile           # Container config
├── deploy.sh            # One-command Cloud Run deploy
└── package.json
```

## Local Development

```bash
npm install
npm start
# Open http://localhost:8080
```

## Deploy to Google Cloud Run

### Prerequisites
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed
- A GCP project with billing enabled

### Steps

1. **Edit `deploy.sh`** — set your `PROJECT_ID` (line 9)

2. **Run the script**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

3. **Done** — your live URL prints at the end:
   ```
   ✓ Deployed: https://venueiq-xxxx-uc.a.run.app
   ```

### Manual deploy (alternative)

```bash
# Set your project
export PROJECT_ID=your-project-id
export REGION=asia-south1

# Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/venueiq .

# Deploy
gcloud run deploy venueiq \
  --image gcr.io/$PROJECT_ID/venueiq \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi
```

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/state` | Full state snapshot |
| GET | `/api/zones` | Zone occupancy data |
| GET | `/api/queues` | All queue statuses |
| POST | `/api/queues/rebalance` | Auto-rebalance queues |
| GET | `/api/gates` | Gate statuses |
| POST | `/api/gates/:id/toggle` | Toggle a gate |
| POST | `/api/gates/open-all` | Open all gates |
| POST | `/api/gates/close-all` | Close all gates |
| GET | `/api/alerts` | All alerts |
| POST | `/api/alerts` | Add new alert |
| DELETE | `/api/alerts` | Clear all alerts |
| GET | `/api/concessions` | Concession stands |
| POST | `/api/concessions/:id/restock` | Restock a stand |
| POST | `/api/routing/push` | Send push notification |

## WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `state:snapshot` | Server→Client | Full initial state |
| `state:update` | Server→Client | Partial state patch |
| `state:tick` | Server→Client | Live tick (3s) — attendance, zones, queues |
| `gate:toggle` | Client→Server | `gateId` string |
| `queues:rebalance` | Client→Server | — |
