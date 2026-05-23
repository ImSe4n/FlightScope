import os, time
import requests
from jose import jwt, JWTError
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

AUTH0_DOMAIN   = os.getenv("AUTH0_DOMAIN", "")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "")

_bearer = HTTPBearer(auto_error=False)

_jwks_cache: dict = {"data": None, "ts": 0.0}
_JWKS_TTL = 3600  # re-fetch JWKS keys once per hour

def _get_jwks() -> dict:
    now = time.time()
    if _jwks_cache["data"] and now - _jwks_cache["ts"] < _JWKS_TTL:
        return _jwks_cache["data"]
    resp = requests.get(f"https://{AUTH0_DOMAIN}/.well-known/jwks.json", timeout=10)
    resp.raise_for_status()
    _jwks_cache.update({"data": resp.json(), "ts": now})
    return _jwks_cache["data"]

def verify_token(creds: HTTPAuthorizationCredentials = Security(_bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not AUTH0_DOMAIN:
        raise HTTPException(status_code=503, detail="Auth not configured on server")
    try:
        header  = jwt.get_unverified_header(creds.credentials)
        payload = jwt.decode(
            creds.credentials,
            _get_jwks(),
            algorithms=[header.get("alg", "RS256")],
            audience=AUTH0_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
