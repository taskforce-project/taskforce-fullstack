package com.taskforce.tf_api.core.service.process;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.process.ProcessJson;
import com.taskforce.tf_api.core.process.ProcessModel;

/**
 * Les workflows par défaut (ADR-027, point 9 ; R103) : un par nature de travail, publiés avec le code, dans
 * {@code resources/process/defaults}. Le premier est celui de la livraison logicielle, « intégrer un module » (E20),
 * avec ses étapes verrouillées, dont les points de pause de TF-J2-10. Une personne en dérive le processus de son
 * projet ; ses étapes verrouillées restent (le vérificateur le tient).
 */
@Component
public class ProcessDefaults {

    static final String LOCATION = "classpath:process/defaults/*.json";

    private final Map<String, ProcessModel> byKey;

    public ProcessDefaults() {
        this.byKey = load();
    }

    private static Map<String, ProcessModel> load() {
        Map<String, ProcessModel> out = new LinkedHashMap<>();
        try {
            Resource[] files = new PathMatchingResourcePatternResolver().getResources(LOCATION);
            Arrays.sort(files, Comparator.comparing(r -> String.valueOf(r.getFilename())));
            for (Resource file : files) {
                try (InputStream in = file.getInputStream()) {
                    ProcessModel model = ProcessJson.read(new String(in.readAllBytes(), StandardCharsets.UTF_8));
                    out.put(model.key(), model);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("The default workflows can't be read", e);
        }
        return Map.copyOf(out);
    }

    public List<ProcessModel> all() {
        return byKey.values().stream().sorted(Comparator.comparing(ProcessModel::key)).toList();
    }

    public Optional<ProcessModel> get(String key) {
        return Optional.ofNullable(key == null ? null : byKey.get(key));
    }

    public Map<String, ProcessModel> byKey() {
        return byKey;
    }
}
