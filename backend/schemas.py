from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ListingBase(BaseModel):
    title: str
    description: str
    price: float
    bedrooms: int
    bathrooms: int
    property_type: str
    location_lat: float
    location_lng: float
    image_urls: List[str] = Field(default_factory=list)
    matterport_url: Optional[str] = None
    status: str = "Available"

class ListingCreate(ListingBase):
    seller_id: str

class ListingPolygonSearch(BaseModel):
    polygon: List[List[float]]  # [[lat, lng], ...]
    search: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_bedrooms: Optional[int] = None
    min_bathrooms: Optional[int] = None
    property_type: Optional[str] = None

class ListingOut(ListingBase):
    id: int
    seller_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class NLPSearchRequest(BaseModel):
    query: str
    limit: int = 25


class NLPSearchOut(BaseModel):
    query: str
    interpreted_filters: dict
    message: str
    listings: List[ListingOut]

class MessageBase(BaseModel):
    listing_id: int
    receiver_id: str
    content: str
    
class MessageCreate(MessageBase):
    sender_id: str
    
class MessageOut(MessageCreate):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    id: str
    email: str
    name: str
    role: str

class UserCreate(UserBase):
    id_document_image: Optional[str] = None
    
class UserUpdate(BaseModel):
    name: str

class UserOut(UserBase):
    verification_status: str = "not_required"
    verification_submitted_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    verification_notes: Optional[str] = None
    listings: List[ListingOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SellerVerificationSubmit(BaseModel):
    user_id: str
    id_document_image: str


class SellerVerificationReview(BaseModel):
    status: str
    notes: Optional[str] = None


class NegotiationSettingsBase(BaseModel):
    enabled: bool = False
    auto_finalize: bool = False
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    target_price: Optional[float] = None
    max_offer: Optional[float] = None
    min_bedrooms: Optional[int] = None
    min_bathrooms: Optional[int] = None
    property_type: Optional[str] = None
    area_terms: List[str] = Field(default_factory=list)
    must_have_features: List[str] = Field(default_factory=list)
    tone: str = "warm"
    max_active_workflows: int = 8


class NegotiationSettingsUpdate(NegotiationSettingsBase):
    pass


class NegotiationSettingsOut(NegotiationSettingsBase):
    buyer_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NegotiationRunRequest(BaseModel):
    buyer_id: str


class NegotiationEventOut(BaseModel):
    id: int
    workflow_id: int
    event_type: str
    actor: str
    title: str
    body: str
    event_metadata: dict = Field(default_factory=dict)
    created_at: datetime

    class Config:
        from_attributes = True


class NegotiationWorkflowOut(BaseModel):
    id: int
    buyer_id: str
    listing_id: int
    seller_id: str
    status: str
    current_stage: str
    target_price: Optional[float] = None
    initial_offer: Optional[float] = None
    current_offer: Optional[float] = None
    seller_counter: Optional[float] = None
    final_offer: Optional[float] = None
    requires_buyer_approval: bool
    last_agent_action: Optional[str] = None
    last_checked_at: datetime
    created_at: datetime
    updated_at: datetime
    listing: Optional[ListingOut] = None
    messages: List[MessageOut] = Field(default_factory=list)
    events: List[NegotiationEventOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class NegotiationRunOut(BaseModel):
    settings: NegotiationSettingsOut
    created_workflows: int
    advanced_workflows: int
    workflows: List[NegotiationWorkflowOut]
