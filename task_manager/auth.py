import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt


def jwt_secret():
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is required")
    return secret


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def sign_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "email": user["email"],
        "name": user["name"],
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, jwt_secret(), algorithm="HS256")


def decode_token(token):
    return jwt.decode(token, jwt_secret(), algorithms=["HS256"])
