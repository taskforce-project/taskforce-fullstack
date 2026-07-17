package com.taskforce.tf_api.core.service.brain;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * Écrit un vecteur d'embedding, <b>chacun dans sa propre transaction</b>.
 *
 * <p>Ça n'est pas une coquetterie : c'est le correctif d'un bug qui tuait la recherche sémantique.
 * L'indexation est « best-effort » — un vecteur refusé (dimension inattendue, `ai-service` qui
 * change de modèle…) ne doit pas casser l'appelant. Or PostgreSQL ne l'entend pas ainsi : dès qu'une
 * requête échoue, il marque <b>toute la transaction</b> comme avortée et rejette tout ce qui suit
 * avec {@code 25P02 — current transaction is aborted}. Un {@code try/catch} autour de l'UPDATE
 * donne l'illusion d'avoir absorbé l'erreur, mais la transaction est déjà morte : la requête
 * vectorielle suivante échouait, et l'analyse entière avec elle.
 *
 * <p>D'où le bean séparé + {@link Propagation#REQUIRES_NEW} : l'écriture vit dans une transaction
 * <b>à elle</b>. Si elle échoue, seule celle-là est annulée ; celle de l'appelant n'est pas touchée
 * et le {@code try/catch} redevient honnête. Bean distinct car Spring n'applique pas ses proxys sur
 * un auto-appel.
 */
@Service
@RequiredArgsConstructor
public class BrainEmbeddingWriter {

    private final JdbcTemplate jdbcTemplate;

    /** @throws org.springframework.dao.DataAccessException si le vecteur est refusé — à l'appelant de décider. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void write(Long nodeId, String vectorLiteral) {
        jdbcTemplate.update(
            "UPDATE knowledge_nodes SET embedding = CAST(? AS vector) WHERE id = ?",
            vectorLiteral, nodeId);
    }
}
