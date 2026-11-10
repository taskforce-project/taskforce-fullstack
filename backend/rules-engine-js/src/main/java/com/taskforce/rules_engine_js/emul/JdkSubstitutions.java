package com.taskforce.rules_engine_js.emul;

import org.teavm.extension.spi.substitution.SimpleSubstitutionPolicy;
import org.teavm.extension.spi.substitution.SubstitutionSink;

/**
 * Les classes du JDK qui manquent à la bibliothèque de TeaVM 0.16 sur le chemin de l'empreinte ({@code MessageDigest},
 * {@code HexFormat}), remplacées dans la seule compilation en JavaScript par celles de
 * {@code com.taskforce.rules_engine_js.emul}, comme un polyfill. Le moteur garde les sources du serveur, et le serveur
 * les classes du JDK. Déclarée dans {@code META-INF/services}, où TeaVM la trouve.
 */
public class JdkSubstitutions extends SimpleSubstitutionPolicy {

    @Override
    public void contribute(SubstitutionSink sink) {
        sink.selectClasses(named("java.security.MessageDigest").or(named("java.util.HexFormat")))
            .packagePrefix("com.taskforce.rules_engine_js.emul.")
            .simpleNamePrefix("T");
    }
}
