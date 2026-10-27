# AgriSentinel

**Cold-chain intelligence for every harvest.** AgriSentinel lets a farmer photograph harvested produce, get an AI quality grade and a 3-day weather-aware shelf-life estimate, then book mobile cold storage or a solar freezer at an aggregation point. Farmers without smartphones use the same network over USSD (`*384*74#`).

Built for Kenyan horticulture: tomato, kale, avocado, mango, potato, onion, cabbage and banana.

---

## What it does

### Farmer workspace (`/farmer`)
| Page | Capabilities |
| --- | --- |
| **Overview** | Greeting, alerts, quality trend, grade mix, weather card, latest scan, active bookings, quick actions, USSD guide |
| **Quality scan** | Drag/drop or camera upload, 8-crop picker, sample images, people/non-produce photos rejected with a clear message, CNN + RandomForest analysis, defect map, freshness/ripeness rings, ambient vs cold shelf life, 3-day weather impact, recommendations, scan history with grade filters |
| **Sentinel** | Cold-chain guardian: nearby cold rooms and solar freezers, live availability/temperature/price, booking modal with cost estimate and optional scan attachment, cancel/booking status, USSD instructions |
| **Weather** | Live Open-Meteo current conditions, 5-day outlook (first 3 days drive the model), hourly rain/temperature chart, agronomic advisories, interactive shelf-life cooling simulator |
| **Support** | Ticket stats and filters, threaded conversations with the support desk, new ticket form, USSD support path, FAQs |

### Admin console (`/ops`)

The admin console is deliberately **not linked from the public sign-in page**. Administrators sign in at `/ops/login` with an `admin` (or legacy `provider`) role account; farmers never see a link, role switch or admin demo on `/login`. A farmer who guesses the console URL can only reach the admin sign-in form, and the API rejects farmer credentials there.
| Page | Capabilities |
| --- | --- |
| **Insights** | Revenue, quality KPIs, quality/volume trend, grade distribution, revenue bars, utilisation, crop mix, top farmers, regional performance, USSD volume, CO₂ avoided, model health, CSV export |
| **Fleet** | Unit cards with live temperature/battery/solar, temperature history, alerts, search/type filters, add unit, adjust capacity/temperature, dispatch service |
| **Farmers** | Network stats, search and risk segments, farmer cards, follow-up queue, farmer drawer with scans/bookings/tickets |
| **Quality report** | Period/crop/grade/search filters, quality and shelf-life KPIs, trend, grade donut, crop performance, defect breakdown, paginated scan register, cold-chain impact, CSV export |
| **Operations** | Pending/active/completed booking queue with confirm/decline/complete, alerts, maintenance, USSD desk and session simulator, support queue, activity feed |

### USSD (`*384*74#`)
Africa's Talking-compatible session flow with `CON`/`END` responses and a persistent text accumulator:

```
SENTINEL *384*74#
1 Scan quality   2 Cold storage   3 Weather risk   4 Support
5 My bookings    6 Services       7 Nearest cold room   0 Exit
```

The dial-in screen is live: the header shows the caller's region and active bookings, and every option is wired. `6` returns the full service guide, `7` returns the nearest available cold room with distance, temperature and price. The same state machine backs the public Africa's Talking webhook and the admin-side simulator.

---

## Architecture

```
React 19 + Vite 6 + Tailwind v4           Django 6.1 (JSON API)            FastAPI (PyTorch / sklearn)
   localhost:5173  ─── /api, /media ───▶  127.0.0.1:8000  ─── HTTP ───▶    127.0.0.1:8001
                                              │                              │
                                              └──── SQLite + media ──────────┘
                                              │
                                              └── Open-Meteo (with offline fallback)
```

- **Frontend** – React Router 7, Recharts, lucide-react, bearer-token auth, role-aware layout, toasts, drawers/modals, responsive mobile navigation.
- **Backend** – plain Django views with a small auth/CORS layer (no DRF), custom `User` model with `farmer`/`provider`/`admin` roles (provider and admin share staff access), SHA-256-hashed bearer tokens with 14-day expiry, per-IP sign-in throttling, optional Google ID-token verification, SQLite, uploaded scans under `media/scans/`.
- **ML service** – FastAPI exposing `/analyze`, `/shelf-life`, `/model-info`, `/health`.
  - **QualityCNN** (PyTorch) – 4-class visual grade (`fresh`, `ripe`, `overripe`, `defective`).
  - **RandomForest** (scikit-learn) – 32 handcrafted colour/texture features → quality score.
  - **WeatherLSTM** (PyTorch) – 3-day weather sequence + crop/quality/facility context → ambient and cold shelf life, degradation curve, advisories.
  - **Upload guard** – MobileNetV3-Small (ImageNet) image classifier plus OpenCV Haar face detection. Photos of people or non-horticultural objects are rejected with a 422 and a readable message before any scoring runs. Bundled demo samples are accepted via the `is_sample` flag.
- **Weather** – Open-Meteo forecast (5 daily + 24 hourly + current) cached 15 minutes; deterministic local fallback keeps every page usable offline.
- **Graceful degradation** – if the ML service is down, Django falls back to agronomic rules and marks the scan `degraded` in the UI.

---

## Quick start

### Prerequisites
- Python 3.12+ (tested on 3.14)
- Node.js 20+ (tested on 24)
- npm

### 1. Install dependencies
```bash
python -m pip install -r backend/requirements.txt
python -m pip install -r ml_service/requirements.txt
cd frontend && npm install && cd ..
```

### 2. (Optional) retrain models
Pre-trained artifacts are included in `ml_service/artifacts/`. To rebuild them:
```bash
cd ml_service
python train.py            # ~9 minutes on CPU
python train.py --quick    # faster, lower fidelity
```
`train.py` rebuilds the quality, shelf-life and scorer models. The upload guard reuses the bundled ImageNet weights at `ml_service/artifacts/vision_mobilenet_v3_small.pth`; if that file is missing, torchvision downloads them on first start.

### 3. Run everything

**Windows**
```bat
start.bat
```

**macOS / Linux**
```bash
./start.sh
```

The script starts the ML service, runs migrations + demo seed (only if the database is empty), starts Django and Vite, then opens the app.

Manual start:
```bash
# terminal 1
cd ml_service && python -m uvicorn app:app --host 127.0.0.1 --port 8001

# terminal 2
cd backend && python manage.py migrate && python manage.py seed_demo && python manage.py runserver 127.0.0.1:8000

# terminal 3
cd frontend && npm run dev
```

Open **http://localhost:5173**.

### Demo accounts
| Role | Sign-in page | Email | Password |
| --- | --- | --- | --- |
| Farmer | http://localhost:5173/login | `amina@farm.africa` | `demo1234` |
| Admin | http://localhost:5173/ops/login | `admin@agrisentinel.africa` | `demo1234` |
| Provider (legacy staff) | http://localhost:5173/ops/login | `grace@agrisentinel.africa` | `demo1234` |

The public sign-in page has a one-tap farmer demo. The admin console is reachable only by URL — bookmark `/ops/login` for the pitch. On the farmer sign-in page, press **`Alt+Shift+O`** to jump to admin sign-in; the shortcut is never shown in the UI. To rebuild the demo dataset at any time:
```bash
cd backend && python manage.py seed_demo --reset
```

---

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login`, `/api/auth/register`, `/api/auth/google`, `/api/auth/logout` | Session, Google sign-in, token revocation |
| `GET` | `/api/auth/me`, `/api/meta`, `/api/health` | Identity, crops/regions, service health |
| `GET` | `/api/farmer/overview`, `/api/farmer/scans` | Farmer dashboard and scan history |
| `POST` | `/api/scans` | Upload + analyse (multipart `image`, `crop`, optional `is_sample`). Returns 422 with `error` for people or non-produce photos |
| `GET` | `/api/scans/<id>` | Full scan analysis |
| `GET` | `/api/weather`, `/api/weather/shelf-impact` | Forecast and cooling simulation |
| `GET/POST` | `/api/storage/facilities`, `/api/storage/bookings` | Network and reservations |
| `POST` | `/api/storage/bookings/<id>/cancel` | Cancel booking |
| `GET/POST` | `/api/support/tickets`, `/api/support/tickets/<id>` | Support desk |
| `GET` | `/api/provider/insights`, `/fleet`, `/farmers`, `/quality-report`, `/operations` | Console data |
| `POST/PATCH` | `/api/provider/fleet`, `/fleet/<id>`, `/fleet/<id>/service` | Fleet management |
| `PATCH` | `/api/provider/bookings/<id>`, `/tickets/<id>/status` | Queue actions |
| `GET` | `/api/provider/quality-report.csv` | CSV export |
| `POST` | `/api/provider/ussd/simulate`, `/api/ussd` | USSD simulation and Africa's Talking webhook |

All endpoints except auth, meta, health and the USSD webhook require `Authorization: Bearer <token>`.

---

## Security

- **Role-separated portals** – `/login` is farmer-only and `/ops/login` is staff-only (admin and legacy provider). The API receives a `portal` value and checks the account role, so staff passwords cannot open a farmer session and a farmer password cannot open the console. Both failures return the same generic message.
- **Hidden console route** – the public landing page contains no admin copy, demo button, role switch or navigation link.
- **Token handling** – a random 32-byte bearer token is issued; only its SHA-256 digest is stored. One active token per user, 14-day expiry, and logout revokes the digest.
- **Throttling** – 5 failed sign-ins per IP + email within 10 minutes returns `429`; Google attempts are limited per IP as well.
- **Google sign-in** – the ID token is verified server-side against `GOOGLE_CLIENT_ID`, issuer and verified email. Google accounts are always farmer accounts; staff accounts must use the console portal.
- **Registration** – public sign-up forces the farmer role. Admin and provider accounts are provisioned internally or by the demo seed.
- **Hardening** – Django password validators, admin disabled by default, host allow-list, allow-listed CORS, `nosniff` / `same-origin` referrer / `DENY` framing headers, and HSTS plus secure cookies when `DJANGO_DEBUG=0`.

### Enable Google sign-in
1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Web client**.
2. Add `http://localhost:5173` as an authorised JavaScript origin.
3. Copy `backend/.env.example` to `backend/.env` and set `GOOGLE_CLIENT_ID=<your-id>.apps.googleusercontent.com`.
4. Restart Django and Vite. The Google button appears above the email form; without a client ID it stays hidden and email/password sign-in still works.

No client secret is required — the backend verifies the ID token issued by Google Identity Services.

---

## Model performance

Training data is procedurally generated (ImageNet-free renders plus an agronomic shelf-life simulator), so metrics describe fidelity to the simulator rather than field accuracy:

| Model | Metric | Value |
| --- | --- | --- |
| QualityCNN (4-class) | validation accuracy | **57%** |
| RandomForest quality regressor | MAE / R² | **3.68 pts / 0.943** |
| Weather LSTM shelf life | MAE | **0.81 days** |

Artifact metadata lives in `ml_service/artifacts/meta.json`. For production, replace the synthetic generator with labelled farm photos and agronomic records; the API contract stays unchanged.

---

## Project layout

```
backend/
  agrisentinel/        Django project (settings, urls, wsgi/asgi)
  api/                 models, views, auth, weather, ML client, USSD state machine
    management/commands/seed_demo.py
  media/               uploaded scan images
  db.sqlite3
frontend/
  src/
    components/        Layout, ScanInsight, GoogleSignIn, ui primitives, charts, Logo
    pages/             Login, OpsLogin
    pages/farmer/      Overview, QualityScan, ColdStorage, Weather, Support
    pages/provider/    Insights, Fleet, Farmers, QualityReport, Operations
    context/           AuthContext, ToastContext
    lib/               api client, hooks, utils
  public/samples/      sample produce images used by the scanner demo
  public/images/       sign-in hero image
ml_service/
  app.py               FastAPI app
  models.py            QualityCNN, ShelfLifeLSTM
  features.py          handcrafted image features
  synth.py             synthetic image + weather dataset generators
  train.py             training pipeline
  artifacts/           trained weights, RandomForest, meta.json
```

---

## Notes & limitations

- Weather is real (Open-Meteo); ML inference is local and CPU-only, so the first request after startup warms the models.
- Scan photos are resized to 1600 px and stored under `backend/media/scans/`.
- USSD is implemented as an Africa's Talking-compatible webhook (`POST /api/ussd`) and simulator; no paid SMS/USSD gateway is bundled.
- Demo data, tokens and pricing are fictional. Set `DJANGO_SECRET_KEY`, disable `DEBUG`, set `DJANGO_ALLOWED_HOSTS`, and switch SQLite to Postgres before a real deployment.
- Environment overrides live in `backend/.env` (see `backend/.env.example`): `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `ENABLE_DJANGO_ADMIN`, `GOOGLE_CLIENT_ID`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ML_SERVICE_URL`, `WEATHER_PROVIDER`, `WEATHER_TIMEOUT`.
- The generated `backend/.secret_key` and the demo database are local runtime files — keep them out of source control and out of shared archives.
#   A g r i S e n t i n a l  
 