package com.taskforce.tf_api.modules.storage.service;

import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Un dossier de la machine, choisi par la personne dans l'app desktop (R156) : le backend local tourne sur son
 * ordinateur et y écrit lui-même. Sur un serveur, la machine n'est pas une cible : ce serait le disque du serveur.
 * Un fichier du même nom reste ; le document prend un nom libre (« Rapport (2).md »).
 */
@Component
public class MachineDocumentWriter implements DocumentWriter {

    private static final int MAX_COPIES = 100;

    private final boolean desktop;

    @Autowired
    public MachineDocumentWriter(Environment environment) {
        this(environment.matchesProfiles("desktop"));
    }

    MachineDocumentWriter(boolean desktop) {
        this.desktop = desktop;
    }

    /** L'instance est-elle l'app desktop, sur la machine de la personne ? */
    @Override
    public boolean offered() {
        return desktop;
    }

    @Override
    public StorageKind kind() {
        return StorageKind.MACHINE;
    }

    @Override
    public StorageTarget check(Long workspaceId, Long userId, StorageTarget wanted) {
        Path folder = folder(wanted.getLocalPath());
        return StorageTarget.builder().workspaceId(workspaceId).kind(StorageKind.MACHINE)
            .localPath(folder.toString()).folderName(folder.getFileName() == null ? folder.toString()
                : folder.getFileName().toString())
            .build();
    }

    @Override
    public Written write(Long workspaceId, Long userId, StorageTarget target, DocumentFile file) {
        Path folder = folder(target.getLocalPath());
        String name = file.fileName();
        for (int copy = 1; copy <= MAX_COPIES; copy++) {
            Path path = folder.resolve(copy == 1 ? name : numbered(name, copy));
            try {
                Files.write(path, file.content(), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                return new Written(path.toString(), null, path.getFileName().toString(), null, null);
            } catch (FileAlreadyExistsException taken) {
                // Le nom est pris : le suivant.
            } catch (IOException e) {
                throw new BusinessException("TaskForce couldn't write in " + folder + ": " + e.getMessage());
            }
        }
        throw new BusinessException("This folder already has " + MAX_COPIES + " files with this name.");
    }

    /** Le dossier, s'il est sur cette machine, absolu, et ouvert à l'écriture. */
    private Path folder(String raw) {
        if (!desktop) {
            throw new BusinessException("A folder on your computer can only be chosen in the TaskForce desktop app.");
        }
        Path folder;
        try {
            folder = raw == null || raw.isBlank() ? null : Path.of(raw.strip()).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            folder = null;
        }
        if (folder == null || !Files.isDirectory(folder)) {
            throw new BusinessException("This folder doesn't exist on your computer. Choose another one.");
        }
        if (!Files.isWritable(folder)) {
            throw new BusinessException("TaskForce can't write in this folder. Choose one you can write in.");
        }
        return folder;
    }

    /** « Rapport.md » devient « Rapport (2).md ». */
    static String numbered(String name, int copy) {
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        return stem + " (" + copy + ")" + ext;
    }
}
