import os
import sys
import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from sqlalchemy.exc import IntegrityError

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env.local")

from database import SessionLocal
from models import Listing, User


DEMO_PASSWORD = "password"

DEMO_USERS = [
    {
        "email": "ava.buyer@dwellera.demo",
        "name": "Ava Patel",
        "role": "buyer",
    },
    {
        "email": "marcus.buyer@dwellera.demo",
        "name": "Marcus Reed",
        "role": "buyer",
    },
    {
        "email": "willow.seller@dwellera.demo",
        "name": "Willow Glen Homes",
        "role": "seller",
    },
    {
        "email": "sf.seller@dwellera.demo",
        "name": "SF Urban Estates",
        "role": "seller",
    },
    {
        "email": "bay.seller@dwellera.demo",
        "name": "Bay Area Townhomes",
        "role": "seller",
    },
]

LISTINGS = [
    {
        "title": "Willow Glen Family Pool Home",
        "seller_email": "willow.seller@dwellera.demo",
        "description": "Remodeled Willow Glen home with a sparkling pool, outdoor kitchen, open living area, and a quiet tree-lined setting near downtown San Jose.",
        "price": 1_950_000,
        "bedrooms": 4,
        "bathrooms": 3,
        "property_type": "House",
        "location_lat": 37.3060,
        "location_lng": -121.8988,
        "image_urls": [
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1200",
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200",
        ],
        "matterport_url": "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    },
    {
        "title": "Evergreen Foothills View Home",
        "seller_email": "willow.seller@dwellera.demo",
        "description": "Spacious Evergreen foothills home with sweeping valley views, flexible multi-generational layout, large backyard, and updated kitchen.",
        "price": 1_800_000,
        "bedrooms": 5,
        "bathrooms": 3,
        "property_type": "House",
        "location_lat": 37.3090,
        "location_lng": -121.7615,
        "image_urls": [
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
            "https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=1200",
        ],
        "matterport_url": None,
    },
    {
        "title": "Cambrian Park Single Story",
        "seller_email": "willow.seller@dwellera.demo",
        "description": "Single-story Cambrian Park ranch home with an open kitchen, mature landscaping, attached garage, and easy access to San Jose commuter routes.",
        "price": 1_500_000,
        "bedrooms": 4,
        "bathrooms": 2,
        "property_type": "House",
        "location_lat": 37.2628,
        "location_lng": -121.9328,
        "image_urls": [
            "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200",
            "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200",
        ],
        "matterport_url": None,
    },
    {
        "title": "Modern SOMA Loft",
        "seller_email": "sf.seller@dwellera.demo",
        "description": "Industrial-modern SOMA loft with tall ceilings, exposed concrete, oversized windows, and quick access to downtown San Francisco.",
        "price": 1_250_000,
        "bedrooms": 1,
        "bathrooms": 1,
        "property_type": "Condo",
        "location_lat": 37.7785,
        "location_lng": -122.3989,
        "image_urls": [
            "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
            "https://images.unsplash.com/photo-1502672260266-1c1e5250ce07?w=1200",
        ],
        "matterport_url": "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    },
    {
        "title": "Hayes Valley Boutique Condo",
        "seller_email": "sf.seller@dwellera.demo",
        "description": "New construction Hayes Valley condo with refined finishes, efficient floor plan, secured entry, and walkable access to restaurants and transit.",
        "price": 1_150_000,
        "bedrooms": 1,
        "bathrooms": 1,
        "property_type": "Condo",
        "location_lat": 37.7758,
        "location_lng": -122.4243,
        "image_urls": [
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
            "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=1200",
        ],
        "matterport_url": None,
    },
    {
        "title": "Mission District Victorian Flat",
        "seller_email": "sf.seller@dwellera.demo",
        "description": "Bright Victorian flat near Dolores Park with period detail, updated kitchen, flexible second bedroom, and classic Mission District charm.",
        "price": 950_000,
        "bedrooms": 2,
        "bathrooms": 1,
        "property_type": "Apartment",
        "location_lat": 37.7599,
        "location_lng": -122.4148,
        "image_urls": [
            "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200",
            "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1200",
        ],
        "matterport_url": None,
    },
    {
        "title": "Noe Valley Townhouse",
        "seller_email": "bay.seller@dwellera.demo",
        "description": "Sunlit Noe Valley townhouse on a quiet residential block with private outdoor space, refreshed interiors, and excellent neighborhood access.",
        "price": 2_200_000,
        "bedrooms": 3,
        "bathrooms": 2,
        "property_type": "Townhouse",
        "location_lat": 37.7502,
        "location_lng": -122.4337,
        "image_urls": [
            "https://images.unsplash.com/photo-1512915922686-57c11dde9c6b?w=1200",
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200",
        ],
        "matterport_url": None,
    },
    {
        "title": "Pacific Heights View Residence",
        "seller_email": "bay.seller@dwellera.demo",
        "description": "Elegant Pacific Heights residence with bay views, generous entertaining spaces, three bedrooms, and polished finishes throughout.",
        "price": 2_750_000,
        "bedrooms": 3,
        "bathrooms": 3,
        "property_type": "Apartment",
        "location_lat": 37.7925,
        "location_lng": -122.4382,
        "image_urls": [
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
            "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1200",
        ],
        "matterport_url": None,
    },
]


def load_environment() -> tuple[str, str]:
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_KEY in backend/.env")

    return supabase_url.rstrip("/"), supabase_key


def auth_headers(supabase_key: str) -> dict[str, str]:
    return {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }


def find_auth_user_by_email(supabase_url: str, supabase_key: str, email: str) -> dict | None:
    page = 1
    per_page = 100
    while True:
        response = requests.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers=auth_headers(supabase_key),
            params={"page": page, "per_page": per_page},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        users = payload.get("users", payload if isinstance(payload, list) else [])
        for user in users:
            if user.get("email", "").lower() == email.lower():
                return user
        if len(users) < per_page:
            return None
        page += 1


def sign_in_auth_user(supabase_url: str, supabase_key: str, email: str) -> dict | None:
    response = requests.post(
        f"{supabase_url}/auth/v1/token",
        headers=auth_headers(supabase_key),
        params={"grant_type": "password"},
        json={
            "email": email,
            "password": DEMO_PASSWORD,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        return None
    payload = response.json()
    return payload.get("user")


def sign_up_auth_user(supabase_url: str, supabase_key: str, demo_user: dict) -> dict:
    existing_user = sign_in_auth_user(supabase_url, supabase_key, demo_user["email"])
    if existing_user:
        return existing_user

    response = requests.post(
        f"{supabase_url}/auth/v1/signup",
        headers=auth_headers(supabase_key),
        json={
            "email": demo_user["email"],
            "password": DEMO_PASSWORD,
            "data": {
                "role": demo_user["role"],
                "full_name": demo_user["name"],
            },
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    user = payload.get("user")
    if not user or not user.get("id"):
        raise RuntimeError(f"Supabase signup did not return a usable user for {demo_user['email']}")
    return user


def create_or_update_auth_user(supabase_url: str, supabase_key: str, demo_user: dict) -> dict:
    existing_user = find_auth_user_by_email(supabase_url, supabase_key, demo_user["email"])
    if existing_user:
        user_id = existing_user["id"]
        response = requests.put(
            f"{supabase_url}/auth/v1/admin/users/{user_id}",
            headers=auth_headers(supabase_key),
            json={
                "password": DEMO_PASSWORD,
                "email_confirm": True,
                "user_metadata": {
                    "role": demo_user["role"],
                    "full_name": demo_user["name"],
                },
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    response = requests.post(
        f"{supabase_url}/auth/v1/admin/users",
        headers=auth_headers(supabase_key),
        json={
            "email": demo_user["email"],
            "password": DEMO_PASSWORD,
            "email_confirm": True,
            "user_metadata": {
                "role": demo_user["role"],
                "full_name": demo_user["name"],
            },
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def resolve_auth_user(supabase_url: str, supabase_key: str, demo_user: dict, admin_available: bool) -> tuple[dict, bool]:
    if admin_available:
        return create_or_update_auth_user(supabase_url, supabase_key, demo_user), True
    return sign_up_auth_user(supabase_url, supabase_key, demo_user), False


def has_admin_access(supabase_url: str, supabase_key: str) -> bool:
    response = requests.get(
        f"{supabase_url}/auth/v1/admin/users",
        headers=auth_headers(supabase_key),
        params={"page": 1, "per_page": 1},
        timeout=30,
    )
    if response.status_code == 403:
        return False
    response.raise_for_status()
    return True


def upsert_app_user(db, user_id: str, demo_user: dict) -> None:
    verification_status = "verified" if demo_user["role"] == "seller" else "not_required"
    verified_at = None
    notes = None
    if demo_user["role"] == "seller":
        verified_at = datetime.datetime.utcnow()
        notes = "Pre-verified demo seller."

    app_user = db.query(User).filter(User.id == user_id).first()
    if app_user:
        app_user.email = demo_user["email"]
        app_user.name = demo_user["name"]
        app_user.role = demo_user["role"]
        app_user.verification_status = verification_status
        app_user.verified_at = verified_at
        app_user.verification_notes = notes
        return

    existing_by_email = db.query(User).filter(User.email == demo_user["email"]).first()
    if existing_by_email:
        existing_by_email.id = user_id
        existing_by_email.name = demo_user["name"]
        existing_by_email.role = demo_user["role"]
        existing_by_email.verification_status = verification_status
        existing_by_email.verified_at = verified_at
        existing_by_email.verification_notes = notes
        return

    db.add(User(
        id=user_id,
        email=demo_user["email"],
        name=demo_user["name"],
        role=demo_user["role"],
        verification_status=verification_status,
        verified_at=verified_at,
        verification_notes=notes,
    ))


def seed_listings(db, users_by_email: dict[str, str]) -> tuple[int, int]:
    created = 0
    skipped = 0

    for listing in LISTINGS:
        seller_id = users_by_email[listing["seller_email"]]
        existing = db.query(Listing).filter(
            Listing.title == listing["title"],
            Listing.seller_id == seller_id,
        ).first()
        if existing:
            existing.matterport_url = listing.get("matterport_url")
            skipped += 1
            continue

        db.add(Listing(
            title=listing["title"],
            description=listing["description"],
            price=listing["price"],
            bedrooms=listing["bedrooms"],
            bathrooms=listing["bathrooms"],
            property_type=listing["property_type"],
            location_lat=listing["location_lat"],
            location_lng=listing["location_lng"],
            image_urls=listing["image_urls"],
            matterport_url=listing.get("matterport_url"),
            status="Available",
            seller_id=seller_id,
        ))
        created += 1

    return created, skipped


def main() -> int:
    supabase_url, supabase_key = load_environment()
    db = SessionLocal()

    try:
        admin_available = has_admin_access(supabase_url, supabase_key)
        if not admin_available:
            print("Supabase Admin API unavailable with SUPABASE_KEY; using public signup/sign-in fallback.")

        users_by_email: dict[str, str] = {}
        for demo_user in DEMO_USERS:
            auth_user, used_admin = resolve_auth_user(supabase_url, supabase_key, demo_user, admin_available)
            user_id = auth_user["id"]
            users_by_email[demo_user["email"]] = user_id
            upsert_app_user(db, user_id, demo_user)

        db.commit()

        created, skipped = seed_listings(db, users_by_email)
        db.commit()

        print("\nDemo users ready")
        print("Email                         Password   Role    Name")
        print("-------------------------------------------------------------")
        for demo_user in DEMO_USERS:
            print(f"{demo_user['email']:<29} {DEMO_PASSWORD:<10} {demo_user['role']:<7} {demo_user['name']}")

        print("\nDemo listing seed complete")
        print(f"Created listings: {created}")
        print(f"Existing listings skipped: {skipped}")
        print(f"Total demo listings represented in script: {len(LISTINGS)}")
        if not admin_available:
            print("\nNote: Created users through public signup fallback because SUPABASE_KEY is not a service-role key.")
            print("If your Supabase project requires email confirmation, confirm these users in Supabase Auth before login.")
        return 0
    except requests.HTTPError as exc:
        response_text = exc.response.text if exc.response is not None else str(exc)
        print(f"Supabase Auth request failed: {response_text}", file=sys.stderr)
        db.rollback()
        return 1
    except IntegrityError as exc:
        print(f"Database integrity error: {exc}", file=sys.stderr)
        db.rollback()
        return 1
    except Exception as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
