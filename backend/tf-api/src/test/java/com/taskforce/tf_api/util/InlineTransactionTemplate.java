package com.taskforce.tf_api.util;

import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link TransactionTemplate} pour les tests unitaires : exécute le bloc tout de suite, sans gestionnaire de
 * transactions. Permet de tester un service qui délimite ses transactions courtes à la main (appels au modèle
 * hors transaction) avec des dépôts mockés.
 */
public class InlineTransactionTemplate extends TransactionTemplate {

    @Override
    public <T> T execute(TransactionCallback<T> action) {
        TransactionStatus status = new SimpleTransactionStatus();
        return action.doInTransaction(status);
    }
}
