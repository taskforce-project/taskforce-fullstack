/**
 * Version produit TaskForce - **source de vérité unique** affichée dans le footer.
 *
 * <p>Regroupe en un seul numéro les versions par service (backend/frontend/landing) gérées
 * indépendamment par la CI. Se bumpe au release via `scripts/bump-product-version.mjs`
 * (major/minor/patch = le plus fort bump parmi les services touchés) ; la CI crée en plus le
 * tag `taskforce-v<version>` à partir de cette valeur.</p>
 */
export const PRODUCT_VERSION = "0.4.0";
