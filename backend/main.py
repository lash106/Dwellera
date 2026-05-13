from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, get_db, Base, SessionLocal
import models, schemas

from sqlalchemy import text
from typing import Optional, Any
import asyncio
import datetime
import math
import re

app = FastAPI(title="Real Estate API")

# Create tables and auto-migrate
@app.on_event("startup")
def startup_db_migration():
    Base.metadata.create_all(bind=engine)
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Available';"))
            conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS matterport_url VARCHAR;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR DEFAULT 'not_required';"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_image TEXT;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes VARCHAR;"))
            print("Successfully migrated 'status' column on startup!")
            
            try:
                conn.execute(text("ALTER PUBLICATION supabase_realtime ADD TABLE messages;"))
                print("Enabled Live websockets. Added messages to supabase_realtime!")
            except Exception as e:
                print("Publication Add Note (might already exist):", e)
                
    except Exception as e:
        print("Startup migration error:", e)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Real Estate API"}


STOP_WORDS = {
    "a", "an", "and", "any", "are", "around", "at", "be", "below", "between",
    "buy", "can", "find", "for", "from", "have", "home", "homes", "house",
    "in", "is", "less", "like", "listing", "listings", "me", "near", "need",
    "of", "or", "place", "property", "properties", "show", "than", "that",
    "the", "to", "under", "up", "want", "with",
}

PROPERTY_TYPE_ALIASES = {
    "house": "House",
    "houses": "House",
    "single family": "House",
    "single-family": "House",
    "mansion": "House",
    "villa": "House",
    "apartment": "Apartment",
    "apartments": "Apartment",
    "flat": "Apartment",
    "condo": "Condo",
    "condos": "Condo",
    "condominium": "Condo",
    "townhouse": "Townhouse",
    "townhome": "Townhouse",
}

AREA_KEYWORDS = {
    "san francisco": ["san francisco", "sf", "soma", "mission district", "pacific heights", "noe valley", "hayes valley", "golden gate"],
    "sf": ["san francisco", "sf", "soma", "mission district", "pacific heights", "noe valley", "hayes valley", "golden gate"],
    "san jose": ["san jose", "willow glen"],
    "bay area": ["san francisco", "sf", "san jose", "bay area", "soma", "mission district", "willow glen"],
    "soma": ["soma"],
    "mission": ["mission", "mission district", "dolores park"],
    "mission district": ["mission", "mission district", "dolores park"],
    "pacific heights": ["pacific heights"],
    "noe valley": ["noe valley"],
    "hayes valley": ["hayes valley"],
    "willow glen": ["willow glen"],
    "golden gate": ["golden gate"],
}

AREA_BOUNDS = {
    "san francisco": (37.70, 37.83, -122.53, -122.35),
    "sf": (37.70, 37.83, -122.53, -122.35),
    "san jose": (37.15, 37.45, -122.05, -121.70),
    "bay area": (36.85, 38.35, -123.25, -121.15),
}

FEATURE_KEYWORDS = {
    "pool": ["pool"],
    "view": ["view", "views", "panoramic"],
    "views": ["view", "views", "panoramic"],
    "golden gate views": ["golden gate", "views"],
    "modern": ["modern", "brand new", "new construction", "remodeled"],
    "historic": ["historic", "classical", "1920s", "victorian"],
    "loft": ["loft"],
    "penthouse": ["penthouse"],
    "luxury": ["luxury", "penthouse", "mansion"],
    "park": ["park", "dolores park"],
    "family": ["family"],
    "remodeled": ["remodeled"],
    "new construction": ["new construction", "brand new"],
}


def _normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").lower()).strip()


def _listing_text(listing: models.Listing) -> str:
    return _normalize_text(f"{listing.title} {listing.description} {listing.property_type}")


def _parse_money_value(raw_value: str, unit: str | None = None) -> float:
    value = float(raw_value.replace(",", ""))
    normalized_unit = (unit or "").lower()
    if normalized_unit in {"m", "million", "millions"}:
        value *= 1_000_000
    elif normalized_unit in {"k", "thousand", "thousands"}:
        value *= 1_000
    return value


def _money_from_match(match: re.Match, value_group: int = 1, unit_group: int = 2) -> float:
    return _parse_money_value(match.group(value_group), match.group(unit_group) if match.lastindex and match.lastindex >= unit_group else None)


def _extract_first_money(text_value: str, default_unit_price: float | None = None) -> float | None:
    match = re.search(r"\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?", text_value.lower())
    if not match:
        return None
    amount = _parse_money_value(match.group(1), match.group(2))
    if amount < 10_000 and default_unit_price and default_unit_price >= 500_000:
        amount *= 1_000_000
    return amount


def _extract_property_type(query: str) -> str | None:
    for alias, property_type in PROPERTY_TYPE_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", query):
            return property_type
    return None


def _extract_area_terms(query: str) -> list[str]:
    terms = []
    for area in sorted(AREA_KEYWORDS.keys(), key=len, reverse=True):
        if re.search(rf"\b{re.escape(area)}\b", query):
            terms.append(area)

    place_match = re.search(r"\b(?:in|near|around|by)\s+([a-z][a-z\s]{2,32})", query)
    if place_match:
        candidate = place_match.group(1).strip()
        candidate = re.split(r"\b(?:under|below|over|above|with|for|that|and|or)\b", candidate)[0].strip()
        if candidate and candidate not in terms and len(candidate.split()) <= 4:
            terms.append(candidate)

    return terms


def _extract_features(query: str) -> list[str]:
    features = []
    for feature in sorted(FEATURE_KEYWORDS.keys(), key=len, reverse=True):
        if re.search(rf"\b{re.escape(feature)}\b", query):
            features.append(feature)
    return features


def _extract_price_filters(query: str) -> dict[str, Any]:
    filters: dict[str, Any] = {}

    between = re.search(
        r"\bbetween\s+\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?\s*(?:and|to|-)\s*\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?",
        query,
    )
    if between:
        first = _parse_money_value(between.group(1), between.group(2) or between.group(4))
        second = _parse_money_value(between.group(3), between.group(4) or between.group(2))
        filters["min_price"] = min(first, second)
        filters["max_price"] = max(first, second)
        return filters

    range_match = re.search(
        r"\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?\s*(?:-|to)\s*\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?",
        query,
    )
    if range_match:
        first = _parse_money_value(range_match.group(1), range_match.group(2) or range_match.group(4))
        second = _parse_money_value(range_match.group(3), range_match.group(4) or range_match.group(2))
        filters["min_price"] = min(first, second)
        filters["max_price"] = max(first, second)

    upper = re.search(
        r"\b(?:under|below|less than|max(?:imum)?|up to|no more than|budget(?: is| of)?|within)\s+\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?",
        query,
    )
    if upper:
        filters["max_price"] = _money_from_match(upper)

    lower = re.search(
        r"\b(?:over|above|more than|min(?:imum)?|at least)\s+\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)?",
        query,
    )
    if lower and "bed" not in query[max(0, lower.start() - 15): lower.end() + 15]:
        filters["min_price"] = _money_from_match(lower)

    around = re.search(
        r"\b(?:around|about|near)\s+\$?\s*([\d,.]+)\s*(m|million|millions|k|thousand|thousands)\b",
        query,
    )
    if around and "max_price" not in filters and "min_price" not in filters:
        amount = _money_from_match(around)
        filters["min_price"] = amount * 0.9
        filters["max_price"] = amount * 1.1

    if "luxury" in query and "min_price" not in filters:
        filters["min_price"] = 2_000_000
    if any(word in query for word in ["affordable", "cheap", "starter"]) and "max_price" not in filters:
        filters["sort"] = "price_asc"

    return filters


def _extract_room_filters(query: str) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    bed_match = re.search(r"\b(?:at least|min(?:imum)?|more than)?\s*(\d+)\s*\+?\s*(?:bed|beds|bedroom|bedrooms|br)\b", query)
    if bed_match:
        filters["min_bedrooms"] = int(bed_match.group(1))
    elif "studio" in query:
        filters["min_bedrooms"] = 0

    bath_match = re.search(r"\b(?:at least|min(?:imum)?|more than)?\s*(\d+)\s*\+?\s*(?:bath|baths|bathroom|bathrooms|ba)\b", query)
    if bath_match:
        filters["min_bathrooms"] = int(bath_match.group(1))

    return filters


def _parse_nlp_query(query: str) -> dict[str, Any]:
    normalized = _normalize_text(query)
    filters = {
        "raw_query": query,
        "area_terms": _extract_area_terms(normalized),
        "features": _extract_features(normalized),
    }
    filters.update(_extract_price_filters(normalized))
    filters.update(_extract_room_filters(normalized))

    property_type = _extract_property_type(normalized)
    if property_type:
        filters["property_type"] = property_type

    if "sold" in normalized:
        filters["status"] = "Sold"
    elif "pending" in normalized or "under contract" in normalized:
        filters["status"] = "Pending"
    elif "available" in normalized or "active" in normalized:
        filters["status"] = "Available"

    if any(word in normalized for word in ["cheapest", "lowest", "least expensive", "best value"]):
        filters["sort"] = "price_asc"
    elif any(word in normalized for word in ["expensive", "highest", "premium"]):
        filters["sort"] = "price_desc"
    elif any(word in normalized for word in ["biggest", "largest", "most bedrooms"]):
        filters["sort"] = "bedrooms_desc"

    keyword_tokens = []
    for token in re.findall(r"[a-z][a-z0-9-]+", normalized):
        if token not in STOP_WORDS and not token.isdigit() and token not in PROPERTY_TYPE_ALIASES:
            keyword_tokens.append(token)
    filters["keywords"] = sorted(set(keyword_tokens))
    return filters


def _listing_in_bounds(listing: models.Listing, bounds: tuple[float, float, float, float]) -> bool:
    min_lat, max_lat, min_lng, max_lng = bounds
    return (
        listing.location_lat is not None
        and listing.location_lng is not None
        and min_lat <= listing.location_lat <= max_lat
        and min_lng <= listing.location_lng <= max_lng
    )


def _listing_matches_area(listing: models.Listing, area: str) -> bool:
    normalized_area = _normalize_text(area)
    text_value = _listing_text(listing)
    if normalized_area in AREA_BOUNDS and _listing_in_bounds(listing, AREA_BOUNDS[normalized_area]):
        return True

    keywords = AREA_KEYWORDS.get(normalized_area, [normalized_area])
    return any(keyword and keyword in text_value for keyword in keywords)


def _listing_matches_feature(listing: models.Listing, feature: str) -> bool:
    text_value = _listing_text(listing)
    keywords = FEATURE_KEYWORDS.get(_normalize_text(feature), [feature])
    return all(keyword in text_value for keyword in keywords) if len(keywords) > 1 else any(keyword in text_value for keyword in keywords)


def _listing_matches_filters(listing: models.Listing, filters: dict[str, Any], require_text: bool = True) -> bool:
    if filters.get("status") and (listing.status or "Available").lower() != filters["status"].lower():
        return False
    if filters.get("min_price") is not None and listing.price < filters["min_price"]:
        return False
    if filters.get("max_price") is not None and listing.price > filters["max_price"]:
        return False
    if filters.get("min_bedrooms") is not None and (listing.bedrooms or 0) < filters["min_bedrooms"]:
        return False
    if filters.get("min_bathrooms") is not None and (listing.bathrooms or 0) < filters["min_bathrooms"]:
        return False
    if filters.get("property_type") and _normalize_text(listing.property_type) != _normalize_text(filters["property_type"]):
        return False

    area_terms = filters.get("area_terms") or []
    if require_text and area_terms and not any(_listing_matches_area(listing, area) for area in area_terms):
        return False

    features = filters.get("features") or []
    if require_text and features and not all(_listing_matches_feature(listing, feature) for feature in features):
        return False

    return True


def _score_listing(listing: models.Listing, filters: dict[str, Any]) -> float:
    score = 0.0
    text_value = _listing_text(listing)

    for area in filters.get("area_terms") or []:
        if _listing_matches_area(listing, area):
            score += 8
    for feature in filters.get("features") or []:
        if _listing_matches_feature(listing, feature):
            score += 6
    for keyword in filters.get("keywords") or []:
        if len(keyword) > 2 and keyword in text_value:
            score += 2
    if filters.get("property_type") and _normalize_text(listing.property_type) == _normalize_text(filters["property_type"]):
        score += 4
    if filters.get("max_price") is not None:
        score += max(0, 3 - (filters["max_price"] - listing.price) / max(filters["max_price"], 1))
    if filters.get("min_bedrooms") is not None:
        score += max(0, (listing.bedrooms or 0) - filters["min_bedrooms"] + 1)

    return score


def _sort_listings(listings: list[models.Listing], filters: dict[str, Any]) -> list[models.Listing]:
    sort_mode = filters.get("sort")
    if sort_mode == "price_asc":
        return sorted(listings, key=lambda item: (item.price or math.inf, -_score_listing(item, filters)))
    if sort_mode == "price_desc":
        return sorted(listings, key=lambda item: (-(item.price or 0), -_score_listing(item, filters)))
    if sort_mode == "bedrooms_desc":
        return sorted(listings, key=lambda item: (-(item.bedrooms or 0), item.price or math.inf))
    return sorted(listings, key=lambda item: (-_score_listing(item, filters), item.price or math.inf))


def _describe_filters(filters: dict[str, Any]) -> str:
    parts = []
    if filters.get("area_terms"):
        parts.append("area: " + ", ".join(filters["area_terms"]))
    if filters.get("property_type"):
        parts.append(filters["property_type"])
    if filters.get("min_bedrooms") is not None:
        parts.append(f"{filters['min_bedrooms']}+ beds")
    if filters.get("min_bathrooms") is not None:
        parts.append(f"{filters['min_bathrooms']}+ baths")
    if filters.get("min_price") is not None and filters.get("max_price") is not None:
        parts.append(f"${filters['min_price']:,.0f}-${filters['max_price']:,.0f}")
    elif filters.get("max_price") is not None:
        parts.append(f"under ${filters['max_price']:,.0f}")
    elif filters.get("min_price") is not None:
        parts.append(f"over ${filters['min_price']:,.0f}")
    if filters.get("features"):
        parts.append("features: " + ", ".join(filters["features"]))
    return "; ".join(parts) or "your request"


SELLER_VERIFICATION_EXPIRY_HOURS = 48


def _refresh_user_verification_status(user: models.User) -> None:
    if not user or user.role != "seller":
        return
    if user.verification_status != "pending" or not user.verification_submitted_at:
        return
    expires_at = user.verification_submitted_at + datetime.timedelta(hours=SELLER_VERIFICATION_EXPIRY_HOURS)
    if datetime.datetime.utcnow() > expires_at:
        user.verification_status = "expired"
        user.verification_notes = "ID verification was not completed in time. Account listing access is terminated."


def _public_user(user: models.User) -> dict[str, Any]:
    _refresh_user_verification_status(user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "verification_status": user.verification_status or ("pending" if user.role == "seller" else "not_required"),
        "verification_submitted_at": user.verification_submitted_at,
        "verified_at": user.verified_at,
        "verification_notes": user.verification_notes,
    }


def _require_verified_seller(db: Session, seller_id: str) -> models.User:
    seller = db.query(models.User).filter(models.User.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=403, detail="Seller profile not found")
    _refresh_user_verification_status(seller)
    if seller.role != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can create listings")
    if seller.verification_status != "verified":
        db.commit()
        raise HTTPException(status_code=403, detail=f"Seller verification required before listing. Current status: {seller.verification_status}")
    return seller

@app.get("/api/listings", response_model=list[schemas.ListingOut])
def get_listings(
    search: str = None, 
    seller_id: str = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_bedrooms: Optional[int] = None,
    min_bathrooms: Optional[int] = None,
    property_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Listing)
    if search:
        query = query.filter(models.Listing.title.ilike(f"%{search}%") | models.Listing.description.ilike(f"%{search}%"))
    if seller_id:
        query = query.filter(models.Listing.seller_id == seller_id)
    if min_price is not None:
        query = query.filter(models.Listing.price >= min_price)
    if max_price is not None:
        query = query.filter(models.Listing.price <= max_price)
    if min_bedrooms is not None:
        query = query.filter(models.Listing.bedrooms >= min_bedrooms)
    if min_bathrooms is not None:
        query = query.filter(models.Listing.bathrooms >= min_bathrooms)
    if property_type and property_type.lower() != 'all':
        query = query.filter(models.Listing.property_type.ilike(property_type))
        
    return query.all()

def _point_in_polygon(lat: float, lng: float, polygon: list) -> bool:
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        ilat, ilng = polygon[i][0], polygon[i][1]
        jlat, jlng = polygon[j][0], polygon[j][1]
        if ((ilat > lat) != (jlat > lat)) and \
           (lng < (jlng - ilng) * (lat - ilat) / (jlat - ilat) + ilng):
            inside = not inside
        j = i
    return inside


@app.post("/api/listings/search", response_model=list[schemas.ListingOut])
def search_listings_in_polygon(payload: schemas.ListingPolygonSearch, db: Session = Depends(get_db)):
    query = db.query(models.Listing)
    if payload.search:
        query = query.filter(models.Listing.title.ilike(f"%{payload.search}%") | models.Listing.description.ilike(f"%{payload.search}%"))
    if payload.min_price is not None:
        query = query.filter(models.Listing.price >= payload.min_price)
    if payload.max_price is not None:
        query = query.filter(models.Listing.price <= payload.max_price)
    if payload.min_bedrooms is not None:
        query = query.filter(models.Listing.bedrooms >= payload.min_bedrooms)
    if payload.min_bathrooms is not None:
        query = query.filter(models.Listing.bathrooms >= payload.min_bathrooms)
    if payload.property_type and payload.property_type.lower() != 'all':
        query = query.filter(models.Listing.property_type.ilike(payload.property_type))

    listings = query.all()
    return [l for l in listings if _point_in_polygon(l.location_lat, l.location_lng, payload.polygon)]


@app.post("/api/listings/nlp-search", response_model=schemas.NLPSearchOut)
def nlp_search_listings(payload: schemas.NLPSearchRequest, db: Session = Depends(get_db)):
    filters = _parse_nlp_query(payload.query)
    all_listings = db.query(models.Listing).all()

    exact_matches = [
        listing for listing in all_listings
        if _listing_matches_filters(listing, filters, require_text=True)
    ]

    matches = exact_matches
    if not matches:
        matches = [
            listing for listing in all_listings
            if _listing_matches_filters(listing, filters, require_text=False)
        ]

    matches = _sort_listings(matches, filters)[: max(1, min(payload.limit, 50))]
    filter_summary = _describe_filters(filters)

    if exact_matches:
        message = f"Found {len(exact_matches)} property{'ies' if len(exact_matches) != 1 else ''} matching {filter_summary}."
    elif matches:
        message = f"No exact match for {filter_summary}, but these are the closest listings that satisfy the structured filters."
    else:
        message = f"No listings match {filter_summary} yet."

    return {
        "query": payload.query,
        "interpreted_filters": filters,
        "message": message,
        "listings": matches,
    }


@app.post("/api/listings", response_model=schemas.ListingOut)
def create_listing(listing: schemas.ListingCreate, db: Session = Depends(get_db)):
    _require_verified_seller(db, listing.seller_id)
    db_listing = models.Listing(**listing.model_dump())
    db.add(db_listing)
    db.commit()
    db.refresh(db_listing)
    return db_listing

from pydantic import BaseModel
class StatusUpdate(BaseModel):
    status: str

@app.patch("/api/listings/{listing_id}/status")
def update_listing_status(listing_id: int, update: StatusUpdate, db: Session = Depends(get_db)):
    listing = db.query(models.Listing).filter(models.Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing.status = update.status
    db.commit()
    db.refresh(listing)
    return listing

@app.get("/api/listings/{listing_id}", response_model=schemas.ListingOut)
def get_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.query(models.Listing).filter(models.Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing

@app.get("/api/messages", response_model=list[schemas.MessageOut])
def get_messages(user_id: str, listing_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.Message).filter(
        (models.Message.sender_id == user_id) | (models.Message.receiver_id == user_id)
    )
    if listing_id:
        query = query.filter(models.Message.listing_id == listing_id)
        
    return query.order_by(models.Message.created_at.asc()).all()

@app.get("/api/inbox")
def get_inbox(user_id: str, db: Session = Depends(get_db)):
    # Find all messages where user is sender or receiver
    messages = db.query(models.Message).filter(
        (models.Message.sender_id == user_id) | (models.Message.receiver_id == user_id)
    ).order_by(models.Message.created_at.desc()).all()
    
    # Group by listing_id and the *other* user ID to form unique threads
    threads = {}
    for m in messages:
        other_user = m.receiver_id if m.sender_id == user_id else m.sender_id
        thread_key = f"{m.listing_id}_{other_user}"
        
        if thread_key not in threads:
            # Fetch listing and user context
            listing = db.query(models.Listing).filter(models.Listing.id == m.listing_id).first()
            other_user_obj = db.query(models.User).filter(models.User.id == other_user).first()
            
            threads[thread_key] = {
                "listing_id": m.listing_id,
                "listing_title": listing.title if listing else "Deleted Property",
                "listing_image": listing.image_urls[0] if listing and listing.image_urls else None,
                "other_user_id": other_user,
                "other_user_name": other_user_obj.name if other_user_obj else "User",
                "last_message": m.content,
                "last_message_at": m.created_at
            }
            
    return list(threads.values())


def _format_money(amount: float | None) -> str:
    if amount is None:
        return "the right number"
    return f"${amount:,.0f}"


def _get_or_create_negotiation_settings(db: Session, buyer_id: str) -> models.NegotiationSetting:
    settings = db.query(models.NegotiationSetting).filter(models.NegotiationSetting.buyer_id == buyer_id).first()
    if settings:
        return settings

    settings = models.NegotiationSetting(
        buyer_id=buyer_id,
        enabled=False,
        auto_finalize=False,
        area_terms=[],
        must_have_features=[],
        tone="warm",
        max_active_workflows=8,
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def _settings_as_filters(settings: models.NegotiationSetting) -> dict[str, Any]:
    return {
        "min_price": settings.min_price,
        "max_price": settings.max_price,
        "min_bedrooms": settings.min_bedrooms,
        "min_bathrooms": settings.min_bathrooms,
        "property_type": settings.property_type if settings.property_type and settings.property_type != "All" else None,
        "area_terms": settings.area_terms or [],
        "features": settings.must_have_features or [],
        "status": "Available",
    }


def _add_negotiation_event(
    db: Session,
    workflow: models.NegotiationWorkflow,
    event_type: str,
    actor: str,
    title: str,
    body: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(models.NegotiationEvent(
        workflow_id=workflow.id,
        event_type=event_type,
        actor=actor,
        title=title,
        body=body,
        event_metadata=metadata or {},
    ))


def _calculate_initial_offer(listing: models.Listing, settings: models.NegotiationSetting) -> float:
    if settings.target_price and settings.target_price > 0:
        offer = settings.target_price
    else:
        offer = (listing.price or 0) * 0.94

    if settings.max_offer and settings.max_offer > 0:
        offer = min(offer, settings.max_offer)

    return round(max(offer, 1), -3)


def _natural_outreach_message(listing: models.Listing, offer: float, settings: models.NegotiationSetting) -> str:
    templates = [
        "Hi, I came across {title} and it looks like a strong fit. Would you be open to talking through an offer around {offer}? I can move quickly if the terms make sense.",
        "Hello, I am interested in {title}. The place checks a lot of boxes for me. Is there room to discuss pricing around {offer}?",
        "Hi there, {title} caught my attention. I would like to understand how flexible you are on price. I am thinking near {offer} if that is worth a conversation.",
        "Hello, I like what I see with {title}. If you are open to it, I would like to start a conversation around {offer} and see whether we can make the numbers work.",
    ]
    template = templates[(listing.id or 0) % len(templates)]
    return template.format(title=listing.title, offer=_format_money(offer))


def _natural_counter_message(listing: models.Listing, offer: float) -> str:
    templates = [
        "Thanks for getting back to me. I can come up to {offer}. If that works for you, I am ready to keep things moving.",
        "I appreciate the reply. {offer} is where I can land right now. Let me know if that is workable on your side.",
        "That helps. I can stretch to {offer}, assuming the next steps look clean. Would that be acceptable?",
    ]
    return templates[(listing.id or 0) % len(templates)].format(offer=_format_money(offer))


def _natural_accept_message(final_offer: float) -> str:
    return f"That works for me at {_format_money(final_offer)}. I am approving this on my side so we can move to the next steps."


def _thread_messages(db: Session, workflow: models.NegotiationWorkflow) -> list[models.Message]:
    return db.query(models.Message).filter(
        models.Message.listing_id == workflow.listing_id,
        (
            ((models.Message.sender_id == workflow.buyer_id) & (models.Message.receiver_id == workflow.seller_id))
            | ((models.Message.sender_id == workflow.seller_id) & (models.Message.receiver_id == workflow.buyer_id))
        )
    ).order_by(models.Message.created_at.asc()).all()


def _serialize_workflow(db: Session, workflow: models.NegotiationWorkflow) -> dict[str, Any]:
    listing = db.query(models.Listing).filter(models.Listing.id == workflow.listing_id).first()
    messages = _thread_messages(db, workflow)
    events = db.query(models.NegotiationEvent).filter(
        models.NegotiationEvent.workflow_id == workflow.id
    ).order_by(models.NegotiationEvent.created_at.asc()).all()
    return {
        "id": workflow.id,
        "buyer_id": workflow.buyer_id,
        "listing_id": workflow.listing_id,
        "seller_id": workflow.seller_id,
        "status": workflow.status,
        "current_stage": workflow.current_stage,
        "target_price": workflow.target_price,
        "initial_offer": workflow.initial_offer,
        "current_offer": workflow.current_offer,
        "seller_counter": workflow.seller_counter,
        "final_offer": workflow.final_offer,
        "requires_buyer_approval": workflow.requires_buyer_approval,
        "last_agent_action": workflow.last_agent_action,
        "last_checked_at": workflow.last_checked_at,
        "created_at": workflow.created_at,
        "updated_at": workflow.updated_at,
        "listing": listing,
        "messages": messages,
        "events": events,
    }


def _active_workflow_count(db: Session, buyer_id: str) -> int:
    return db.query(models.NegotiationWorkflow).filter(
        models.NegotiationWorkflow.buyer_id == buyer_id,
        models.NegotiationWorkflow.status.in_(["waiting_for_seller", "awaiting_buyer_approval", "needs_buyer_input"]),
    ).count()


def _create_negotiation_workflow(
    db: Session,
    buyer_id: str,
    listing: models.Listing,
    settings: models.NegotiationSetting,
) -> models.NegotiationWorkflow:
    initial_offer = _calculate_initial_offer(listing, settings)
    workflow = models.NegotiationWorkflow(
        buyer_id=buyer_id,
        listing_id=listing.id,
        seller_id=listing.seller_id,
        status="waiting_for_seller",
        current_stage="outreach_sent",
        target_price=settings.target_price,
        initial_offer=initial_offer,
        current_offer=initial_offer,
        requires_buyer_approval=not settings.auto_finalize,
        last_agent_action=f"Sent initial outreach at {_format_money(initial_offer)}.",
        last_checked_at=datetime.datetime.utcnow(),
    )
    db.add(workflow)
    db.flush()

    message = models.Message(
        listing_id=listing.id,
        sender_id=buyer_id,
        receiver_id=listing.seller_id,
        content=_natural_outreach_message(listing, initial_offer, settings),
    )
    db.add(message)
    _add_negotiation_event(
        db,
        workflow,
        "outreach_sent",
        "agent",
        "Initial outreach sent",
        f"The agent opened a negotiation with {listing.title} at {_format_money(initial_offer)}.",
        {"offer": initial_offer},
    )
    return workflow


def _next_counter_offer(workflow: models.NegotiationWorkflow, settings: models.NegotiationSetting, listing: models.Listing) -> float | None:
    max_offer = settings.max_offer or listing.price
    current_offer = workflow.current_offer or workflow.initial_offer or _calculate_initial_offer(listing, settings)
    if current_offer >= max_offer:
        return None
    proposed = max(current_offer * 1.025, min(max_offer, current_offer + 10_000))
    return round(min(proposed, max_offer), -3)


def _advance_workflow_from_messages(
    db: Session,
    workflow: models.NegotiationWorkflow,
    settings: models.NegotiationSetting,
) -> bool:
    listing = db.query(models.Listing).filter(models.Listing.id == workflow.listing_id).first()
    if not listing or workflow.status in {"finalized", "approved", "rejected", "paused"}:
        return False

    messages = _thread_messages(db, workflow)
    if not messages:
        return False

    latest = messages[-1]
    if latest.created_at and workflow.last_checked_at and latest.created_at <= workflow.last_checked_at:
        return False

    workflow.last_checked_at = datetime.datetime.utcnow()
    if latest.sender_id != workflow.seller_id:
        return False

    latest_text = _normalize_text(latest.content)
    seller_counter = _extract_first_money(latest_text, listing.price)
    accepted_language = any(word in latest_text for word in ["accept", "accepted", "deal", "works", "yes", "agree"])
    rejected_language = any(word in latest_text for word in ["not interested", "no thanks", "decline", "reject"])
    max_offer = settings.max_offer or listing.price

    if rejected_language and not seller_counter:
        workflow.status = "rejected"
        workflow.current_stage = "seller_declined"
        workflow.last_agent_action = "Seller declined the negotiation."
        _add_negotiation_event(db, workflow, "seller_declined", "seller", "Seller declined", latest.content)
        return True

    if seller_counter:
        workflow.seller_counter = seller_counter

    final_offer = seller_counter or workflow.current_offer or workflow.initial_offer or listing.price
    if accepted_language or final_offer <= max_offer:
        workflow.final_offer = round(final_offer, -3)
        if settings.auto_finalize:
            workflow.status = "finalized"
            workflow.current_stage = "deal_finalized"
            workflow.requires_buyer_approval = False
            workflow.last_agent_action = f"Auto-finalized at {_format_money(workflow.final_offer)}."
            listing.status = "Pending"
            db.add(models.Message(
                listing_id=listing.id,
                sender_id=workflow.buyer_id,
                receiver_id=workflow.seller_id,
                content=_natural_accept_message(workflow.final_offer),
            ))
            _add_negotiation_event(
                db,
                workflow,
                "deal_finalized",
                "agent",
                "Deal auto-finalized",
                f"The seller terms were within your limits, so the agent finalized at {_format_money(workflow.final_offer)}.",
                {"final_offer": workflow.final_offer},
            )
        else:
            workflow.status = "awaiting_buyer_approval"
            workflow.current_stage = "buyer_review"
            workflow.requires_buyer_approval = True
            workflow.last_agent_action = f"Seller terms are within your limit at {_format_money(workflow.final_offer)}. Waiting for your approval."
            _add_negotiation_event(
                db,
                workflow,
                "awaiting_buyer_approval",
                "agent",
                "Offer ready for approval",
                f"The agent has an offer ready at {_format_money(workflow.final_offer)}.",
                {"final_offer": workflow.final_offer},
            )
        return True

    next_offer = _next_counter_offer(workflow, settings, listing)
    if next_offer:
        workflow.current_offer = next_offer
        workflow.status = "waiting_for_seller"
        workflow.current_stage = "counter_sent"
        workflow.last_agent_action = f"Sent a counter at {_format_money(next_offer)}."
        db.add(models.Message(
            listing_id=listing.id,
            sender_id=workflow.buyer_id,
            receiver_id=workflow.seller_id,
            content=_natural_counter_message(listing, next_offer),
        ))
        _add_negotiation_event(
            db,
            workflow,
            "counter_sent",
            "agent",
            "Counter offer sent",
            f"The agent responded with {_format_money(next_offer)}.",
            {"counter_offer": next_offer, "seller_counter": seller_counter},
        )
        return True

    workflow.status = "needs_buyer_input"
    workflow.current_stage = "max_offer_reached"
    workflow.last_agent_action = "Seller counter is above your max offer. Waiting for updated instructions."
    _add_negotiation_event(
        db,
        workflow,
        "needs_buyer_input",
        "agent",
        "Max offer reached",
        "The seller is above your max offer, so the agent stopped before crossing your limit.",
        {"seller_counter": seller_counter, "max_offer": max_offer},
    )
    return True


def _matching_available_listings(db: Session, buyer_id: str, settings: models.NegotiationSetting) -> list[models.Listing]:
    filters = _settings_as_filters(settings)
    listings = db.query(models.Listing).filter(models.Listing.seller_id != buyer_id).all()
    return [
        listing for listing in listings
        if (listing.status or "Available") == "Available"
        and _listing_matches_filters(listing, filters, require_text=True)
    ]


def _run_negotiation_agent_for_buyer(db: Session, buyer_id: str) -> tuple[models.NegotiationSetting, int, int, list[models.NegotiationWorkflow]]:
    settings = _get_or_create_negotiation_settings(db, buyer_id)
    created_count = 0
    advanced_count = 0

    if settings.enabled:
        existing_listing_ids = {
            row[0] for row in db.query(models.NegotiationWorkflow.listing_id)
            .filter(models.NegotiationWorkflow.buyer_id == buyer_id)
            .all()
        }
        active_count = _active_workflow_count(db, buyer_id)
        max_active = max(1, settings.max_active_workflows or 8)

        for listing in _matching_available_listings(db, buyer_id, settings):
            if listing.id in existing_listing_ids or active_count >= max_active:
                continue
            _create_negotiation_workflow(db, buyer_id, listing, settings)
            created_count += 1
            active_count += 1
            existing_listing_ids.add(listing.id)

        workflows_to_advance = db.query(models.NegotiationWorkflow).filter(
            models.NegotiationWorkflow.buyer_id == buyer_id,
            models.NegotiationWorkflow.status.in_(["waiting_for_seller", "needs_buyer_input", "awaiting_buyer_approval"]),
        ).all()
        for workflow in workflows_to_advance:
            if _advance_workflow_from_messages(db, workflow, settings):
                advanced_count += 1

        db.commit()
    else:
        db.commit()

    workflows = db.query(models.NegotiationWorkflow).filter(
        models.NegotiationWorkflow.buyer_id == buyer_id
    ).order_by(models.NegotiationWorkflow.updated_at.desc()).all()
    return settings, created_count, advanced_count, workflows


@app.on_event("startup")
async def start_negotiation_agent_loop():
    async def loop_enabled_agents():
        await asyncio.sleep(5)
        while True:
            db = SessionLocal()
            try:
                buyer_ids = [
                    row[0] for row in db.query(models.NegotiationSetting.buyer_id)
                    .filter(models.NegotiationSetting.enabled == True)
                    .all()
                ]
                for buyer_id in buyer_ids:
                    _run_negotiation_agent_for_buyer(db, buyer_id)
            except Exception as e:
                print("Negotiation agent loop error:", e)
            finally:
                db.close()
            await asyncio.sleep(60)

    asyncio.create_task(loop_enabled_agents())


@app.get("/api/negotiation/settings/{buyer_id}", response_model=schemas.NegotiationSettingsOut)
def get_negotiation_settings(buyer_id: str, db: Session = Depends(get_db)):
    return _get_or_create_negotiation_settings(db, buyer_id)


@app.put("/api/negotiation/settings/{buyer_id}", response_model=schemas.NegotiationSettingsOut)
def update_negotiation_settings(buyer_id: str, update: schemas.NegotiationSettingsUpdate, db: Session = Depends(get_db)):
    settings = _get_or_create_negotiation_settings(db, buyer_id)
    for field, value in update.model_dump().items():
        setattr(settings, field, value)
    settings.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(settings)

    if settings.enabled:
        _run_negotiation_agent_for_buyer(db, buyer_id)
        db.refresh(settings)

    return settings


@app.post("/api/negotiation/run", response_model=schemas.NegotiationRunOut)
def run_negotiation_agent(payload: schemas.NegotiationRunRequest, db: Session = Depends(get_db)):
    settings, created_count, advanced_count, workflows = _run_negotiation_agent_for_buyer(db, payload.buyer_id)
    return {
        "settings": settings,
        "created_workflows": created_count,
        "advanced_workflows": advanced_count,
        "workflows": [_serialize_workflow(db, workflow) for workflow in workflows],
    }


@app.get("/api/negotiation/workflows", response_model=list[schemas.NegotiationWorkflowOut])
def get_negotiation_workflows(buyer_id: str, db: Session = Depends(get_db)):
    settings = _get_or_create_negotiation_settings(db, buyer_id)
    if settings.enabled:
        _run_negotiation_agent_for_buyer(db, buyer_id)

    workflows = db.query(models.NegotiationWorkflow).filter(
        models.NegotiationWorkflow.buyer_id == buyer_id
    ).order_by(models.NegotiationWorkflow.updated_at.desc()).all()
    return [_serialize_workflow(db, workflow) for workflow in workflows]


@app.post("/api/negotiation/workflows/{workflow_id}/approve", response_model=schemas.NegotiationWorkflowOut)
def approve_negotiation_workflow(workflow_id: int, db: Session = Depends(get_db)):
    workflow = db.query(models.NegotiationWorkflow).filter(models.NegotiationWorkflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Negotiation workflow not found")
    if workflow.status != "awaiting_buyer_approval":
        raise HTTPException(status_code=400, detail="This workflow is not awaiting buyer approval")

    listing = db.query(models.Listing).filter(models.Listing.id == workflow.listing_id).first()
    final_offer = workflow.final_offer or workflow.current_offer or workflow.initial_offer or (listing.price if listing else None)

    workflow.status = "approved"
    workflow.current_stage = "deal_approved"
    workflow.final_offer = final_offer
    workflow.requires_buyer_approval = False
    workflow.last_agent_action = f"Buyer approved the deal at {_format_money(final_offer)}."
    workflow.updated_at = datetime.datetime.utcnow()
    if listing:
        listing.status = "Pending"
        db.add(models.Message(
            listing_id=listing.id,
            sender_id=workflow.buyer_id,
            receiver_id=workflow.seller_id,
            content=_natural_accept_message(final_offer),
        ))
    _add_negotiation_event(
        db,
        workflow,
        "deal_approved",
        "buyer",
        "Deal approved",
        f"You approved the negotiated offer at {_format_money(final_offer)}.",
        {"final_offer": final_offer},
    )
    db.commit()
    db.refresh(workflow)
    return _serialize_workflow(db, workflow)

@app.get("/api/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = _public_user(db_user)
    db.commit()
    return payload

@app.post("/api/users")
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user.id).first()
    if db_user:
        db_user.email = user.email
        db_user.name = user.name
        db_user.role = user.role
        if user.role == "seller" and user.id_document_image:
            db_user.id_document_image = user.id_document_image
            db_user.verification_status = "pending"
            db_user.verification_submitted_at = datetime.datetime.utcnow()
            db_user.verified_at = None
            db_user.verification_notes = "ID submitted for agent review."
        elif user.role != "seller":
            db_user.verification_status = "not_required"
        db.commit()
        db.refresh(db_user)
        return _public_user(db_user)

    verification_status = "not_required"
    submitted_at = None
    notes = None
    if user.role == "seller":
        verification_status = "pending" if user.id_document_image else "rejected"
        submitted_at = datetime.datetime.utcnow() if user.id_document_image else None
        notes = "ID submitted for agent review." if user.id_document_image else "Seller signup requires an ID capture."

    new_user = models.User(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        verification_status=verification_status,
        id_document_image=user.id_document_image if user.role == "seller" else None,
        verification_submitted_at=submitted_at,
        verification_notes=notes,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _public_user(new_user)

@app.put("/api/users/{user_id}")
def update_user(user_id: str, update: schemas.UserUpdate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.name = update.name
    db.commit()
    db.refresh(db_user)
    return {"message": "User updated successfully"}


@app.post("/api/users/{user_id}/verification/submit")
def submit_seller_verification(user_id: str, payload: schemas.SellerVerificationSubmit, db: Session = Depends(get_db)):
    if payload.user_id != user_id:
        raise HTTPException(status_code=400, detail="Verification user mismatch")
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.role != "seller":
        raise HTTPException(status_code=400, detail="Only sellers require ID verification")
    if not payload.id_document_image.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="ID capture must be an image data URL")

    db_user.id_document_image = payload.id_document_image
    db_user.verification_status = "pending"
    db_user.verification_submitted_at = datetime.datetime.utcnow()
    db_user.verified_at = None
    db_user.verification_notes = "ID submitted for agent review."
    db.commit()
    db.refresh(db_user)
    return _public_user(db_user)


@app.post("/api/users/{user_id}/verification/review")
def review_seller_verification(user_id: str, review: schemas.SellerVerificationReview, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.role != "seller":
        raise HTTPException(status_code=400, detail="Only sellers can be reviewed")

    status = review.status.lower().strip()
    if status not in {"verified", "rejected"}:
        raise HTTPException(status_code=400, detail="Review status must be verified or rejected")
    if status == "verified" and not db_user.id_document_image:
        raise HTTPException(status_code=400, detail="Cannot verify seller without an ID capture")

    db_user.verification_status = status
    db_user.verified_at = datetime.datetime.utcnow() if status == "verified" else None
    db_user.verification_notes = review.notes or ("Verified by review agent." if status == "verified" else "Rejected by review agent.")
    db.commit()
    db.refresh(db_user)
    return _public_user(db_user)


@app.get("/api/verifications/pending")
def get_pending_seller_verifications(db: Session = Depends(get_db)):
    sellers = db.query(models.User).filter(
        models.User.role == "seller",
        models.User.verification_status == "pending",
    ).order_by(models.User.verification_submitted_at.asc()).all()

    results = []
    for seller in sellers:
        _refresh_user_verification_status(seller)
        results.append({
            **_public_user(seller),
            "id_document_image": seller.id_document_image,
        })
    db.commit()
    return results

@app.post("/api/messages", response_model=schemas.MessageOut)
def create_message(message: schemas.MessageCreate, db: Session = Depends(get_db)):
    db_message = models.Message(**message.model_dump())
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message
