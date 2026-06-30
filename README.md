# foryoupage

A geo-social content map where anyone can "pin" short-form content from around the internet — placing YouTube Shorts, TikToks, Instagram Reels, and Reddit posts at locations on an interactive world map.

---

## What It Does

Users open the site and see a world map covered in pins. Each pin is a piece of content — a YouTube Short, TikTok, Instagram Reel, or Reddit post — placed at a location either by the poster's choice, their current GPS location, or at random.

You can:
- **Browse** the map and click pins to view embedded content from around the world
- **Post** a link from a supported platform and choose where it appears on the map
- **Explore** by zooming into any region and discovering what people have shared there
- **Teleport** to a random pin anywhere in the world with one click

It's a passive, curiosity-driven feed — a "for you page" but for the whole world.

---

## Supported Platforms

| Platform | Content Type |
|---|---|
| YouTube | Shorts |
| TikTok | Videos & Photos |
| Instagram | Posts & Reels |
| Reddit | Posts (full & shortened URLs) |

---

## Tech Stack

- **Backend:** Django 5, Django REST Framework
- **Database:** PostgreSQL (production), SQLite (local dev)
- **Map:** Leaflet.js + Leaflet.MarkerCluster
- **Rate Limiting:** django-ratelimit (10 posts/minute per IP)
- **Reddit API:** PRAW (for resolving shortened reddit.com/s/ URLs)
- **Deployment:** Gunicorn
- **IP Geolocation:** freeipapi.com (cached 24h per IP)

---

## Local Setup

**Prerequisites:** Python 3.11+, pip

```bash
# Clone and enter the project
git clone https://github.com/Bilal292/foryoupage.git
cd foryoupage

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**Configure environment variables.** Create a `.env` file (or set these in your shell):

```
SECRET_KEY=your-django-secret-key
DEBUG=True
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
REDDIT_USER_AGENT=foryoupage/1.0
```

> A Reddit API app (script type) is required for resolving shortened Reddit URLs. Register one at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps).

**Run migrations and start the dev server:**

```bash
python manage.py migrate
python manage.py runserver
```

The app will be available at `http://127.0.0.1:8000`.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/pins/create/` | Submit a new pin (link + location) |
| `GET` | `/api/pins/in_bounds/` | Fetch pins within a map bounding box |
| `GET` | `/api/pins/random/` | Get a random active pin |
| `GET` | `/api/pins/<id>/` | Get a specific pin by ID |
