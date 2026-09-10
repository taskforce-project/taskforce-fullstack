/**
 * Version produit TaskForce affichée dans le footer de la landing - **le MÊME numéro que le footer de
 * l'app**.
 *
 * <p>Copie synchronisée de `frontend/product-version.json` (source de vérité) : les deux contextes de
 * build Docker étant isolés (l'app n'a que `frontend/`, la landing que `landing-page/`), la valeur est
 * dupliquée et gardée en sync par `scripts/bump-product-version.mjs` (le plus fort bump parmi les
 * services touchés). La CI crée le tag produit unique `taskforce-v<version>`.</p>
 */
export const PRODUCT_VERSION = "0.18.0";
