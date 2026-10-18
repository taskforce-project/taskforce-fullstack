package com.taskforce.tf_api;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class TfApiApplication {

	public static void main(String[] args) {
		// Charger le fichier .env selon le profil actif
		loadEnvironmentVariables();
		SpringApplication.run(TfApiApplication.class, args);
	}

	/**
	 * Charge les variables d'environnement depuis le fichier .env approprié
	 * Ordre de priorité :
	 * 1. Variables d'environnement système (déjà définies)
	 * 2. .env.dev si SPRING_PROFILE=dev ou non défini
	 * 3. .env.prod si SPRING_PROFILE=prod
	 */
	private static void loadEnvironmentVariables() {
		try {
			// Déterminer le profil actif (par défaut: dev)
			String profile = System.getenv("SPRING_PROFILE");
			if (profile == null || profile.isEmpty()) {
				profile = "dev";
			}

			// Nom du fichier .env selon le profil
			String envFile = ".env." + profile;

			// Charger le fichier .env
			Dotenv dotenv = Dotenv.configure()
					.filename(envFile)
					.ignoreIfMissing()
					.systemProperties()
					.load();

			System.out.println("✅ Fichier " + envFile + " loaded for the profile: " + profile);

			// Appliquer les variables d'environnement dans les propriétés système
			dotenv.entries().forEach(entry -> {
				if (System.getProperty(entry.getKey()) == null) {
					System.setProperty(entry.getKey(), entry.getValue());
				}
			});

		} catch (Exception e) {
			System.err.println("Warning: couldn't load the .env file: " + e.getMessage());
			System.err.println("Warning: the application starts with the system environment variables only");
		}
	}
}
