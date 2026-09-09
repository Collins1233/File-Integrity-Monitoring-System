import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, Set
from enum import Enum

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, APIKeyHeader

from config import PROJECT_ROOT

SECRET_KEY_FILE = os.path.join(PROJECT_ROOT, 'session_secret.key')
ADMIN_KEY_FILE = os.path.join(PROJECT_ROOT, 'admin_api_key.key')


class Role(str, Enum):
    ADMIN = 'admin'
    ANALYST = 'analyst'
    AUDITOR = 'auditor'
    VIEWER = 'viewer'


ROLE_PERMISSIONS: dict[str, Set[str]] = {
    Role.ADMIN.value: {'admin', 'analyst', 'auditor', 'viewer'},
    Role.ANALYST.value: {'analyst', 'auditor', 'viewer'},
    Role.AUDITOR.value: {'auditor', 'viewer'},
    Role.VIEWER.value: {'viewer'},
}


def _get_or_create_key(filepath: str, default_prefix: str = '') -> str:
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                val = f.read().strip()
                if val:
                    return val
        except OSError:
            pass

    val = f'{default_prefix}{secrets.token_hex(32)}'
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(val)
    except OSError:
        pass
    return val


JWT_SECRET = _get_or_create_key(SECRET_KEY_FILE, 'secret_')
DEFAULT_ADMIN_API_KEY = _get_or_create_key(ADMIN_KEY_FILE, 'fim_admin_')
ALGORITHM = 'HS256'
TOKEN_EXPIRE_MINUTES = 480

bearer_scheme = HTTPBearer(auto_error=False)
api_key_scheme = APIKeyHeader(name='X-API-Key', auto_error=False)


def create_access_token(user_id: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    if role not in ROLE_PERMISSIONS:
        raise ValueError(f'Invalid role: {role}')

    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=TOKEN_EXPIRE_MINUTES))
    payload = {
        'sub': user_id,
        'role': role,
        'permissions': list(ROLE_PERMISSIONS[role]),
        'exp': expire,
        'iat': datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Token has expired. Please authenticate again.',
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid authorization token.',
        )


def get_current_user_and_role(
    bearer: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
    api_key: Optional[str] = Security(api_key_scheme),
) -> dict:
    # 1. Check API Key Header (X-API-Key)
    if api_key:
        if api_key == DEFAULT_ADMIN_API_KEY:
            return {'user': 'system_admin', 'role': Role.ADMIN.value, 'permissions': list(ROLE_PERMISSIONS[Role.ADMIN.value])}
        elif api_key.startswith('fim_analyst_'):
            return {'user': 'analyst_user', 'role': Role.ANALYST.value, 'permissions': list(ROLE_PERMISSIONS[Role.ANALYST.value])}
        elif api_key.startswith('fim_auditor_'):
            return {'user': 'auditor_user', 'role': Role.AUDITOR.value, 'permissions': list(ROLE_PERMISSIONS[Role.AUDITOR.value])}
        elif api_key.startswith('fim_viewer_'):
            return {'user': 'viewer_user', 'role': Role.VIEWER.value, 'permissions': list(ROLE_PERMISSIONS[Role.VIEWER.value])}
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid API Key provided.',
            )

    # 2. Check Bearer JWT Token Header
    if bearer and bearer.credentials:
        payload = decode_access_token(bearer.credentials)
        return {
            'user': payload.get('sub', 'user'),
            'role': payload.get('role', Role.VIEWER.value),
            'permissions': payload.get('permissions', []),
        }

    # 3. Seamless Default Desktop/Local Mode Fallback -> Admin
    return {
        'user': 'local_desktop_admin',
        'role': Role.ADMIN.value,
        'permissions': list(ROLE_PERMISSIONS[Role.ADMIN.value]),
        'is_local_fallback': True,
    }


def require_role(required_role: str):
    def role_checker(auth: dict = Depends(get_current_user_and_role)):
        user_role = auth.get('role', Role.VIEWER.value)
        allowed = ROLE_PERMISSIONS.get(user_role, set())
        if required_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Access denied. Required permission: [{required_role}]. Your active role is [{user_role}].',
            )
        return auth

    return role_checker


require_admin = require_role('admin')
require_analyst = require_role('analyst')
require_auditor = require_role('auditor')
require_viewer = require_role('viewer')
