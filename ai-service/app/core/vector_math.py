"""Mathématiques vectorielles — fonctions **pures** (aucun I/O, aucun état global).

Contient :
- l'**embedding lexical de repli** (feature hashing signé de tokens + trigrammes, tf-log, L2)
  utilisé quand aucun modèle sémantique n'est disponible (réseau/build) ;
- des utilitaires (cosinus, normalisation, vecteur déterministe).
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import List

_TOKEN_RE = re.compile(r"[a-z0-9]{2,}")


def hash_bucket(token: str, dim: int) -> tuple[int, float]:
    """Bucket + signe par feature hashing signé (réduit le biais de collision)."""
    digest = hashlib.md5(token.encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "big") % dim
    sign = 1.0 if (digest[4] & 1) == 0 else -1.0
    return bucket, sign


def lexical_embedding(text: str, dim: int) -> List[float]:
    """Embedding lexical offline (sans dépendance).

    Feature hashing de tokens + trigrammes de caractères, pondéré tf-log et normalisé L2. Le cosinus
    reflète réellement le recouvrement lexical (≈ mini-IR vectoriel), pas du bruit. Interchangeable à
    chaud avec un vrai modèle sémantique (même dimension de sortie).
    """
    vec = [0.0] * dim
    if not text:
        return vec
    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        return vec

    term_freq: dict[str, int] = {}
    for token in tokens:
        term_freq[token] = term_freq.get(token, 0) + 1

    for token, count in term_freq.items():
        weight = 1.0 + math.log(count)
        bucket, sign = hash_bucket("w:" + token, dim)
        vec[bucket] += sign * weight
        padded = f"#{token}#"
        for i in range(len(padded) - 2):  # trigrammes de caractères
            tri_bucket, tri_sign = hash_bucket("c:" + padded[i : i + 3], dim)
            vec[tri_bucket] += tri_sign * 0.5

    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm > 1e-12 else vec


def stable_vector(text: str, dimensions: int = 16) -> List[float]:
    """Vecteur déterministe (placeholder de câblage) dérivé d'un hash SHA-256."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return [(digest[i % len(digest)] / 255.0) * 2.0 - 1.0 for i in range(dimensions)]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Similarité cosinus bornée à [-1, 1] ; 0.0 si l'un des vecteurs est nul/vide."""
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a <= 1e-12 or norm_b <= 1e-12:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm_a * norm_b)))


def clamp01(value: float) -> float:
    """Borne une valeur dans [0, 1]."""
    return max(0.0, min(1.0, value))
