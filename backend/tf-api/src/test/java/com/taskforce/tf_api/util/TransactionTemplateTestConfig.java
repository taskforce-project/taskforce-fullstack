package com.taskforce.tf_api.util;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link TransactionTemplate} pour les tests en tranche {@code @DataJpaTest} des services qui gardent leurs appels
 * réseau hors transaction (PC-022) : ils découpent leur travail en transactions courtes avec ce gabarit.
 */
@TestConfiguration
public class TransactionTemplateTestConfig {

    @Bean
    TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }
}
