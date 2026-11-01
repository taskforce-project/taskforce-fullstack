package com.taskforce.e16.emul;

import org.teavm.extension.spi.substitution.SimpleSubstitutionPolicy;
import org.teavm.extension.spi.substitution.SubstitutionSink;

/**
 * E16 : les classes du JDK qui manquent à TeaVM 0.16 sur le chemin de l'empreinte (MessageDigest, HexFormat),
 * remplacées dans la seule compilation en JavaScript par celles de {@code com.taskforce.e16.emul}, comme un polyfill.
 * Les sources du moteur restent celles du serveur.
 */
public class E16SubstitutionPolicy extends SimpleSubstitutionPolicy {

    @Override
    public void contribute(SubstitutionSink sink) {
        sink.selectClasses(named("java.security.MessageDigest").or(named("java.util.HexFormat")))
            .packagePrefix("com.taskforce.e16.emul.")
            .simpleNamePrefix("T");
    }
}
