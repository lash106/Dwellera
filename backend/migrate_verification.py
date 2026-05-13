from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv("backend/.env")
load_dotenv(".env")

from database import engine


STATEMENTS = [
    "ALTER TABLE listings ADD COLUMN IF NOT EXISTS matterport_url VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR DEFAULT 'not_required'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_image TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes VARCHAR",
]


with engine.begin() as conn:
    for statement in STATEMENTS:
        conn.execute(text(statement))

print("verification columns ready")
