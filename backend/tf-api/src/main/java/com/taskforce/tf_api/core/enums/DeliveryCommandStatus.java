package com.taskforce.tf_api.core.enums;

/** La vie d'un ordre donné au runner : en attente, pris par le runner, fait, en échec, ou resté sans réponse. */
public enum DeliveryCommandStatus {
    PENDING,
    RUNNING,
    DONE,
    FAILED,
    EXPIRED
}
