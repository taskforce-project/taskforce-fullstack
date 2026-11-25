package com.taskforce.tf_api.core.harness.evidence;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.EdECPrivateKey;
import java.security.spec.NamedParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * La clé qui scelle les dossiers des missions (Ed25519, {@link EvidenceSeal}). Elle vient de l'environnement, jamais du
 * code : {@code DELIVERY_EVIDENCE_SIGNING_KEY} (une clé PKCS#8, en PEM ou en base64), sinon le fichier
 * {@code DELIVERY_EVIDENCE_SIGNING_KEY_FILE}, créé au premier démarrage s'il n'existe pas ; sans l'un ni l'autre, une clé
 * tirée au démarrage et perdue à l'arrêt, et le journal le dit. La clé privée ne sort jamais de ce composant : aucune
 * route ne la rend, aucun journal ne l'écrit.
 *
 * <p>Où elle vit compte plus que l'algorithme (R198, signal d'arrêt) : {@code DELIVERY_EVIDENCE_KEY_CUSTODY} dit si
 * l'exploitant la garde sur une machine où aucun agent ne tourne ({@code separate-machine}, une déclaration que TaskForce
 * ne peut pas vérifier), ou non ({@code same-machine}, le défaut, et toujours le cas de l'app desktop). Chaque sceau le
 * porte, et la page de vérification le dit.</p>
 */
@Slf4j
@Component
public class EvidenceSigner {

    private static final String PRIVATE_BEGIN = "-----BEGIN PRIVATE KEY-----";
    private static final String PRIVATE_END = "-----END PRIVATE KEY-----";

    private final KeyPair keys;
    private final EvidenceSeal.Key key;
    private final boolean kept;

    /** La clé comme avant la relecture R159 : sans fichier par défaut. */
    public EvidenceSigner(String inline, String file, String custody) {
        this(inline, file, "", custody);
    }

    /**
     * @param inline      la clé donnée par l'environnement, en PEM ou en base64
     * @param file        un fichier que l'exploitant désigne : illisible, le démarrage s'arrête
     * @param defaultFile le fichier par défaut, dans le volume de données persistant du serveur (R159, M3) : créé au
     *                    premier démarrage et relu ensuite ; s'il ne peut pas l'être, une clé tirée pour ce démarrage, et le
     *                    journal le dit
     */
    @Autowired
    public EvidenceSigner(
        @Value("${delivery.evidence.signing-key:}") String inline,
        @Value("${delivery.evidence.signing-key-file:}") String file,
        @Value("${delivery.evidence.default-key-file:}") String defaultFile,
        @Value("${delivery.evidence.key-custody:" + EvidenceSeal.SAME_MACHINE + "}") String custody
    ) {
        try {
            if (inline != null && !inline.isBlank()) {
                this.keys = fromPrivate(parsePrivate(inline));
                this.kept = true;
            } else if (file != null && !file.isBlank()) {
                this.keys = fromFile(Path.of(file.strip()));
                this.kept = true;
            } else {
                KeyPair fromVolume = defaultFile == null || defaultFile.isBlank() ? null : fromDefaultFile(Path.of(defaultFile.strip()));
                this.keys = fromVolume != null ? fromVolume : generate();
                this.kept = fromVolume != null;
                if (fromVolume == null) {
                    log.warn("Evidence signing key not configured (DELIVERY_EVIDENCE_SIGNING_KEY or DELIVERY_EVIDENCE_SIGNING_KEY_FILE): "
                        + "a key was drawn for this run and is lost when it stops.");
                }
            }
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("The evidence signing key cannot be read: " + e.getMessage(), e);
        }
        byte[] spki = keys.getPublic().getEncoded();
        this.key = new EvidenceSeal.Key(EvidenceSeal.keyId(spki), Base64.getEncoder().encodeToString(spki), custodyOf(custody),
            kept);
        log.info("Evidence signing key {} ({}{})", key.id(), key.custody(), kept ? "" : ", not kept");
    }

    /** La clé publique, son identifiant et sa garde, tels que chaque sceau les porte. */
    public EvidenceSeal.Key key() {
        return key;
    }

    /** Vrai si la clé est gardée d'un démarrage à l'autre : l'exploitant peut alors la publier. */
    public boolean kept() {
        return kept;
    }

    /** Signe en Ed25519 l'encodage DSSE de l'énoncé. */
    public byte[] sign(byte[] pae) {
        try {
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(keys.getPrivate());
            signer.update(pae);
            return signer.sign();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("The evidence could not be signed", e);
        }
    }

    // ---------------------------------------------------------------------

    static String custodyOf(String declared) {
        String value = declared == null ? "" : declared.strip().toLowerCase();
        if (EvidenceSeal.SEPARATE_MACHINE.equals(value)) {
            return EvidenceSeal.SEPARATE_MACHINE;
        }
        if (!value.isEmpty() && !EvidenceSeal.SAME_MACHINE.equals(value)) {
            log.warn("Unknown DELIVERY_EVIDENCE_KEY_CUSTODY \"{}\": the seals say the key is on the agent's machine", value);
        }
        return EvidenceSeal.SAME_MACHINE;
    }

    /**
     * Le fichier par défaut, dans le volume de données du serveur : relu, ou créé au premier démarrage. Un fichier qu'on
     * ne peut ni lire ni créer (pas de volume, un dossier en lecture seule) n'arrête pas le serveur : null, et une clé
     * tirée pour ce démarrage. Un fichier qui existe mais ne porte pas une clé arrête le démarrage, comme une clé donnée.
     */
    static KeyPair fromDefaultFile(Path path) throws GeneralSecurityException {
        try {
            return fromFile(path);
        } catch (UncheckedIOException e) {
            log.error("The default evidence signing key file {} cannot be used ({}): set DELIVERY_EVIDENCE_SIGNING_KEY or a volume "
                + "for it; a key was drawn for this run.", path, e.getCause() == null ? e.getMessage() : e.getCause().getMessage());
            return null;
        }
    }

    /** Le fichier de la clé, créé avec une clé neuve s'il n'existe pas, lisible par son seul propriétaire quand le système le permet. */
    static KeyPair fromFile(Path path) throws GeneralSecurityException {
        try {
            if (Files.exists(path)) {
                return fromPrivate(parsePrivate(Files.readString(path, StandardCharsets.UTF_8)));
            }
            KeyPair fresh = generate();
            Path parent = path.toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Path tmp = Files.createTempFile(parent == null ? Path.of(".") : parent, ".evidence-key", ".tmp");
            restrict(tmp);
            Files.writeString(tmp, pem(fresh.getPrivate()), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, path, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, path);
            }
            log.info("Evidence signing key created in {}", path);
            return fresh;
        } catch (IOException e) {
            throw new UncheckedIOException("The evidence signing key file cannot be used: " + path, e);
        }
    }

    private static void restrict(Path file) throws IOException {
        if (FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
        }
    }

    static String pem(PrivateKey key) {
        String body = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(key.getEncoded());
        return PRIVATE_BEGIN + "\n" + body + "\n" + PRIVATE_END + "\n";
    }

    /** Une clé privée Ed25519 en PKCS#8 : un bloc PEM {@code PRIVATE KEY}, ou son contenu en base64. */
    static PrivateKey parsePrivate(String text) throws GeneralSecurityException {
        String body = text.strip();
        int begin = body.indexOf(PRIVATE_BEGIN);
        if (begin >= 0) {
            int end = body.indexOf(PRIVATE_END, begin);
            if (end < 0) {
                throw new GeneralSecurityException("the PEM block has no end");
            }
            body = body.substring(begin + PRIVATE_BEGIN.length(), end);
        }
        byte[] der;
        try {
            der = Base64.getMimeDecoder().decode(body.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new GeneralSecurityException("not a PKCS#8 key in PEM or base64", e);
        }
        return KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    static KeyPair generate() throws GeneralSecurityException {
        return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    }

    /**
     * La paire d'une clé privée : le JDK ne tire pas la clé publique d'une clé privée Ed25519, mais un générateur nourri
     * de ses 32 octets (la graine, RFC 8032) refait la même paire. La paire est vérifiée par une signature.
     */
    static KeyPair fromPrivate(PrivateKey privateKey) throws GeneralSecurityException {
        if (!(privateKey instanceof EdECPrivateKey ed) || !"Ed25519".equalsIgnoreCase(ed.getParams().getName())) {
            throw new GeneralSecurityException("the key is not an Ed25519 key");
        }
        byte[] seed = ed.getBytes().orElseThrow(() -> new GeneralSecurityException("the Ed25519 key has no bytes"));
        KeyPairGenerator generator = KeyPairGenerator.getInstance("Ed25519");
        generator.initialize(NamedParameterSpec.ED25519, new Seeded(seed));
        KeyPair pair = generator.generateKeyPair();
        byte[] again = ((EdECPrivateKey) pair.getPrivate()).getBytes().orElse(new byte[0]);
        if (!Arrays.equals(seed, again)) {
            throw new GeneralSecurityException("the public key could not be derived");
        }
        byte[] probe = "taskforce-evidence".getBytes(StandardCharsets.US_ASCII);
        Signature signer = Signature.getInstance("Ed25519");
        signer.initSign(privateKey);
        signer.update(probe);
        byte[] signature = signer.sign();
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(pair.getPublic());
        verifier.update(probe);
        if (!verifier.verify(signature)) {
            throw new GeneralSecurityException("the derived public key does not match the private key");
        }
        return new KeyPair(pair.getPublic(), privateKey);
    }

    /** Une source qui rend toujours la même graine : le générateur refait la paire de cette clé privée. */
    private static final class Seeded extends SecureRandom {
        private static final long serialVersionUID = 1L;
        private final byte[] seed;

        Seeded(byte[] seed) {
            this.seed = seed.clone();
        }

        @Override
        public void nextBytes(byte[] bytes) {
            System.arraycopy(seed, 0, bytes, 0, Math.min(seed.length, bytes.length));
        }
    }
}
