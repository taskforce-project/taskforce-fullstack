package com.taskforce.tf_api.core.service.brain;

import com.taskforce.tf_api.core.enums.EdgeRelation;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;

/**
 * Parsing tolérant des enums du Brain OS (erreur explicite si valeur invalide).
 * Util sans état — partagé par les services brain pour éviter la duplication.
 */
public final class BrainEnums {

    private BrainEnums() {}

    public static NodeType type(String v) {
        try { return NodeType.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Type de node invalide: " + v); }
    }

    public static NodeDomain domain(String v) {
        try { return NodeDomain.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Domaine invalide: " + v); }
    }

    public static NodeStatus status(String v) {
        try { return NodeStatus.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Statut invalide: " + v); }
    }

    public static NodeRefType refType(String v) {
        try { return NodeRefType.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("refType invalide: " + v); }
    }

    public static EdgeRelation relation(String v) {
        try { return EdgeRelation.valueOf(v.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("Type de relation invalide: " + v); }
    }
}
