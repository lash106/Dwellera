from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime, JSON, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True) # UUID from Supabase auth
    email = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String) # 'buyer' or 'seller'
    verification_status = Column(String, default="not_required") # not_required, pending, verified, rejected, expired
    id_document_image = Column(Text, nullable=True)
    verification_submitted_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verification_notes = Column(String, nullable=True)


class Listing(Base):
    __tablename__ = "listings"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    price = Column(Float)
    bedrooms = Column(Integer)
    bathrooms = Column(Integer)
    property_type = Column(String) # House, Apartment, Condo, etc
    location_lat = Column(Float)
    location_lng = Column(Float)
    image_urls = Column(JSON) # Array of Cloudinary URLs
    matterport_url = Column(String, nullable=True)
    status = Column(String, default="Available") # Available, Sold
    seller_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"))
    sender_id = Column(String, index=True)
    receiver_id = Column(String, index=True)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class NegotiationSetting(Base):
    __tablename__ = "negotiation_settings"

    buyer_id = Column(String, primary_key=True, index=True)
    enabled = Column(Boolean, default=False)
    auto_finalize = Column(Boolean, default=False)
    min_price = Column(Float, nullable=True)
    max_price = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    max_offer = Column(Float, nullable=True)
    min_bedrooms = Column(Integer, nullable=True)
    min_bathrooms = Column(Integer, nullable=True)
    property_type = Column(String, nullable=True)
    area_terms = Column(JSON, default=list)
    must_have_features = Column(JSON, default=list)
    tone = Column(String, default="warm")
    max_active_workflows = Column(Integer, default=8)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class NegotiationWorkflow(Base):
    __tablename__ = "negotiation_workflows"
    __table_args__ = (
        UniqueConstraint("buyer_id", "listing_id", name="uq_negotiation_buyer_listing"),
    )

    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(String, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), index=True)
    seller_id = Column(String, index=True)
    status = Column(String, default="waiting_for_seller")
    current_stage = Column(String, default="outreach_sent")
    target_price = Column(Float, nullable=True)
    initial_offer = Column(Float, nullable=True)
    current_offer = Column(Float, nullable=True)
    seller_counter = Column(Float, nullable=True)
    final_offer = Column(Float, nullable=True)
    requires_buyer_approval = Column(Boolean, default=True)
    last_agent_action = Column(String, nullable=True)
    last_checked_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class NegotiationEvent(Base):
    __tablename__ = "negotiation_events"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("negotiation_workflows.id"), index=True)
    event_type = Column(String, index=True)
    actor = Column(String)
    title = Column(String)
    body = Column(String)
    event_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
