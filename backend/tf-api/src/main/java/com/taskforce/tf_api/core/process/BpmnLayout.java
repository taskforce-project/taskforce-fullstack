package com.taskforce.tf_api.core.process;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.taskforce.tf_api.core.process.ProcessModel.Flow;
import com.taskforce.tf_api.core.process.ProcessModel.Step;

/**
 * Le dessin d'un processus exporté (BPMN DI) : la forme de chaque élément et le tracé de chaque chemin, sans quoi un
 * modeleur n'ouvre pas le fichier. Ce dessin n'est qu'un format d'échange : TaskForce le calcule à chaque export, de
 * gauche à droite, et l'ignore à l'import ; il n'entre pas dans l'empreinte.
 *
 * <p>Dans chaque conteneur (le processus, une phase), une étape prend la colonne du plus long chemin qui la sépare du
 * début ; les étapes d'une même colonne s'empilent, centrées. Un chemin vers la droite tourne dans l'espace entre deux
 * colonnes ; un chemin qui revient en arrière passe sous le conteneur et entre par la gauche. Une zone d'agent empile
 * ses étapes ; une échéance ou un chemin d'échec se pose sur le bord bas de l'étape qu'il surveille, assez loin du
 * suivant pour que leurs noms ne se chevauchent pas, et son chemin passe sous ces noms.</p>
 */
final class BpmnLayout {

    record Box(int x, int y, int w, int h) {
        int cx() {
            return x + w / 2;
        }

        int cy() {
            return y + h / 2;
        }

        int right() {
            return x + w;
        }

        int bottom() {
            return y + h;
        }
    }

    record Point(int x, int y) {
    }

    static final int EVENT = 36;
    static final int GATEWAY = 50;
    static final int TASK_W = 100;
    static final int TASK_H = 80;
    static final int GAP_X = 60;
    static final int GAP_Y = 40;
    static final int STAGE_PAD = 30;
    static final int STAGE_TOP = 40;
    static final int ZONE_PAD = 20;
    static final int ZONE_TOP = 40;
    static final int ZONE_GAP = 20;
    /** D'une échéance à la suivante, sur le même bord : la place de leurs noms. */
    static final int BOUNDARY_STEP = 110;
    /** Sous une échéance, son nom ; son chemin passe dessous. */
    static final int BOUNDARY_LANE = 52;
    static final int LANE_STEP = 15;
    static final int ORIGIN_X = 160;
    static final int ORIGIN_Y = 100;

    final Map<String, Box> boxes = new LinkedHashMap<>();
    final Map<String, List<Point>> edges = new LinkedHashMap<>();
    private final Map<String, Plan> plans = new HashMap<>();
    /** Le bord droit de la colonne de chaque étape : un chemin y tourne, entre deux colonnes. */
    private final Map<String, Integer> columnRight = new HashMap<>();

    private BpmnLayout() {
    }

    static BpmnLayout of(ProcessModel model) {
        BpmnLayout layout = new BpmnLayout();
        Plan top = layout.plan("", model.stepsOrEmpty(), model.flowsOrEmpty());
        layout.position(top, ORIGIN_X, ORIGIN_Y);
        layout.route(top);
        return layout;
    }

    // ------------------------------------------------------------------------------------------------- mesurer

    /** Un conteneur mesuré : ses étapes en colonnes, sa taille, et ses chemins qui passent dessous. */
    private static final class Plan {
        final List<Step> steps;
        final List<Flow> flows;
        final List<List<Step>> columns = new ArrayList<>();
        final List<Integer> widths = new ArrayList<>();
        final Map<String, int[]> sizes = new HashMap<>();
        int contentW;
        int contentH;
        int loops;
        boolean boundaries;
        int contentY;

        Plan(List<Step> steps, List<Flow> flows) {
            this.steps = steps;
            this.flows = flows;
        }

        /** Le premier couloir des chemins qui reviennent en arrière, sous les étapes et les noms des échéances. */
        int firstLane() {
            return contentY + contentH + (boundaries ? BOUNDARY_LANE + 2 * LANE_STEP : 30);
        }

        int height() {
            int extra = boundaries ? BOUNDARY_LANE + 2 * LANE_STEP : 0;
            if (loops > 0) {
                extra = (boundaries ? extra : 30) + loops * LANE_STEP;
            }
            return contentH + extra;
        }
    }

    private Plan plan(String owner, List<Step> steps, List<Flow> flows) {
        Plan plan = new Plan(steps, flows);
        plans.put(owner, plan);
        Map<String, Step> local = new LinkedHashMap<>();
        steps.forEach(s -> local.put(s.id(), s));
        Map<String, Integer> watchers = new HashMap<>();
        for (Step s : steps) {
            if (s.boundary() && s.attachedTo() != null) {
                watchers.merge(s.attachedTo(), 1, Integer::sum);
                plan.boundaries = true;
            }
        }
        List<Step> nodes = steps.stream().filter(s -> !s.boundary()).toList();
        for (Step s : nodes) {
            plan.sizes.put(s.id(), size(s, watchers.getOrDefault(s.id(), 0)));
        }
        // Le rang : le plus long chemin depuis le début, sans les chemins qui reviennent en arrière.
        Map<String, List<String>> next = new LinkedHashMap<>();
        for (Flow f : flows) {
            String from = node(local, f.from());
            if (from != null && local.containsKey(f.to()) && !local.get(f.to()).boundary()) {
                next.computeIfAbsent(from, k -> new ArrayList<>()).add(f.to());
            }
        }
        String start = nodes.stream().filter(s -> ProcessModel.START.equals(s.type())).findFirst().map(Step::id)
            .orElse(nodes.isEmpty() ? null : nodes.get(0).id());
        List<String> order = new ArrayList<>();
        Map<String, Integer> state = new HashMap<>();
        List<String[]> forward = new ArrayList<>();
        if (start != null) {
            visit(start, next, state, order, forward);
        }
        for (Step s : nodes) {
            if (!state.containsKey(s.id())) {
                visit(s.id(), next, state, order, forward);
            }
        }
        Map<String, Integer> rank = new HashMap<>();
        nodes.forEach(s -> rank.put(s.id(), 0));
        // Ordre topologique : l'inverse de la sortie du parcours en profondeur.
        List<String> topo = new ArrayList<>(order);
        Collections.reverse(topo);
        Map<String, List<String>> dag = new HashMap<>();
        forward.forEach(e -> dag.computeIfAbsent(e[0], k -> new ArrayList<>()).add(e[1]));
        for (String id : topo) {
            for (String to : dag.getOrDefault(id, List.of())) {
                rank.put(to, Math.max(rank.get(to), rank.get(id) + 1));
            }
        }
        int columns = rank.values().stream().mapToInt(Integer::intValue).max().orElse(-1) + 1;
        for (int c = 0; c < columns; c++) {
            plan.columns.add(new ArrayList<>());
        }
        // Dans une colonne, les étapes gardent l'ordre où le parcours les a trouvées.
        for (String id : discovery(start, next, nodes)) {
            plan.columns.get(rank.get(id)).add(local.get(id));
        }
        int width = 0;
        int height = 0;
        for (List<Step> column : plan.columns) {
            int w = column.stream().mapToInt(s -> plan.sizes.get(s.id())[0]).max().orElse(0);
            int h = column.stream().mapToInt(s -> plan.sizes.get(s.id())[1]).sum() + GAP_Y * Math.max(0, column.size() - 1);
            plan.widths.add(w);
            width += w;
            height = Math.max(height, h);
        }
        plan.contentW = width + GAP_X * Math.max(0, columns - 1);
        plan.contentH = height;
        for (Flow f : flows) {
            Step from = local.get(f.from());
            String node = node(local, f.from());
            if (from != null && !from.boundary() && node != null && rank.containsKey(f.to())
                && rank.get(f.to()) <= rank.get(node)) {
                plan.loops++;
            }
        }
        return plan;
    }

    /** Le nœud d'où part un chemin : l'étape surveillée pour une échéance ou un chemin d'échec. */
    private static String node(Map<String, Step> local, String id) {
        Step s = local.get(id);
        if (s == null) {
            return null;
        }
        return s.boundary() ? (local.containsKey(s.attachedTo()) ? s.attachedTo() : null) : s.id();
    }

    private static void visit(String id, Map<String, List<String>> next, Map<String, Integer> state, List<String> order,
                              List<String[]> forward) {
        state.put(id, 1);
        for (String to : next.getOrDefault(id, List.of())) {
            Integer s = state.get(to);
            if (s == null) {
                forward.add(new String[] {id, to});
                visit(to, next, state, order, forward);
            } else if (s == 2) {
                forward.add(new String[] {id, to});
            }
            // s == 1 : un chemin qui revient en arrière, il ne compte pas pour le rang.
        }
        state.put(id, 2);
        order.add(id);
    }

    private static List<String> discovery(String start, Map<String, List<String>> next, List<Step> nodes) {
        List<String> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Deque<String> queue = new ArrayDeque<>();
        if (start != null) {
            queue.add(start);
            seen.add(start);
        }
        while (true) {
            while (!queue.isEmpty()) {
                String id = queue.poll();
                out.add(id);
                for (String to : next.getOrDefault(id, List.of())) {
                    if (seen.add(to)) {
                        queue.add(to);
                    }
                }
            }
            Step rest = nodes.stream().filter(s -> !seen.contains(s.id())).findFirst().orElse(null);
            if (rest == null) {
                return out;
            }
            seen.add(rest.id());
            queue.add(rest.id());
        }
    }

    /** La taille d'une étape ; une étape surveillée par plusieurs échéances s'élargit pour leurs noms. */
    private int[] size(Step s, int watchers) {
        int minWidth = watchers <= 1 ? 0 : 63 + (watchers - 1) * BOUNDARY_STEP + 20;
        return switch (s.type() == null ? "" : s.type()) {
            case ProcessModel.START, ProcessModel.END, ProcessModel.WAIT -> new int[] {EVENT, EVENT};
            case ProcessModel.DECISION, ProcessModel.PARALLEL -> new int[] {GATEWAY, GATEWAY};
            case ProcessModel.ZONE -> {
                int n = Math.max(1, s.stepsOrEmpty().size());
                yield new int[] {Math.max(TASK_W + 2 * ZONE_PAD, minWidth),
                    ZONE_TOP + n * TASK_H + (n - 1) * ZONE_GAP + ZONE_PAD};
            }
            case ProcessModel.STAGE -> {
                Plan inner = plan(s.id(), s.stepsOrEmpty(), s.flowsOrEmpty());
                yield new int[] {Math.max(inner.contentW + 2 * STAGE_PAD, minWidth), STAGE_TOP + inner.height() + STAGE_PAD};
            }
            default -> new int[] {Math.max(TASK_W, minWidth), TASK_H};
        };
    }

    // ------------------------------------------------------------------------------------------------- placer

    private void position(Plan plan, int ox, int oy) {
        plan.contentY = oy;
        int x = ox;
        for (int c = 0; c < plan.columns.size(); c++) {
            List<Step> column = plan.columns.get(c);
            int w = plan.widths.get(c);
            int h = column.stream().mapToInt(s -> plan.sizes.get(s.id())[1]).sum() + GAP_Y * Math.max(0, column.size() - 1);
            int y = oy + (plan.contentH - h) / 2;
            for (Step s : column) {
                int[] size = plan.sizes.get(s.id());
                Box box = new Box(x + (w - size[0]) / 2, y, size[0], size[1]);
                boxes.put(s.id(), box);
                columnRight.put(s.id(), x + w);
                if (ProcessModel.STAGE.equals(s.type())) {
                    Plan inner = plans.get(s.id());
                    position(inner, box.x() + (box.w() - inner.contentW) / 2, box.y() + STAGE_TOP);
                } else if (ProcessModel.ZONE.equals(s.type())) {
                    int i = 0;
                    for (Step inner : s.stepsOrEmpty()) {
                        boxes.put(inner.id(), new Box(box.cx() - TASK_W / 2, box.y() + ZONE_TOP + i * (TASK_H + ZONE_GAP),
                            TASK_W, TASK_H));
                        i++;
                    }
                }
                y += size[1] + GAP_Y;
            }
            x += w + GAP_X;
        }
        // Les échéances et les chemins d'échec, sur le bord bas de l'étape qu'ils surveillent, de droite à gauche.
        Map<String, Integer> perHost = new HashMap<>();
        for (Step s : plan.steps) {
            if (!s.boundary()) {
                continue;
            }
            Box host = boxes.get(s.attachedTo());
            if (host == null) {
                host = new Box(ox, oy, EVENT, EVENT);
            }
            int k = perHost.merge(s.attachedTo() == null ? "" : s.attachedTo(), 1, Integer::sum) - 1;
            int cx = host.right() - 45 - k * BOUNDARY_STEP;
            boxes.put(s.id(), new Box(cx - EVENT / 2, host.bottom() - EVENT / 2, EVENT, EVENT));
        }
    }

    // ------------------------------------------------------------------------------------------------- tracer

    private void route(Plan plan) {
        Map<String, Step> local = new LinkedHashMap<>();
        plan.steps.forEach(s -> local.put(s.id(), s));
        int lane = plan.firstLane();
        Map<String, Integer> boundaryLanes = new HashMap<>();
        for (Flow f : plan.flows) {
            Box s = boxes.get(f.from());
            Box t = boxes.get(f.to());
            if (s == null || t == null) {
                continue;
            }
            Step source = local.get(f.from());
            List<Point> points = new ArrayList<>();
            if (source != null && source.boundary()) {
                Point a = new Point(s.cx(), s.bottom());
                Box host = boxes.get(source.attachedTo());
                int k = boundaryLanes.merge(source.attachedTo() == null ? "" : source.attachedTo(), 1, Integer::sum) - 1;
                int low = (host == null ? s.bottom() : host.bottom()) + BOUNDARY_LANE + k * LANE_STEP;
                points.add(a);
                if (t.y() > low) {
                    // La cible est plus bas : on descend jusqu'à elle, puis on y entre par la gauche.
                    points.add(new Point(a.x(), t.cy()));
                } else {
                    // La cible est plus haut : on passe sous les noms des échéances, puis on y entre par le bas.
                    points.add(new Point(a.x(), low));
                    points.add(new Point(t.cx(), low));
                    points.add(new Point(t.cx(), t.bottom()));
                    edges.put(f.id(), points);
                    continue;
                }
                points.add(new Point(t.x(), t.cy()));
            } else if (t.x() >= s.right()) {
                Point a = new Point(s.right(), s.cy());
                Point b = new Point(t.x(), t.cy());
                points.add(a);
                if (a.y() != b.y()) {
                    // On tourne entre la colonne de la source et la suivante, jamais à travers une étape.
                    int turn = Math.min(columnRight.getOrDefault(f.from(), a.x()) + GAP_X / 2, b.x() - 10);
                    turn = Math.max(turn, a.x() + 10);
                    points.add(new Point(turn, a.y()));
                    points.add(new Point(turn, b.y()));
                }
                points.add(b);
            } else {
                // Un retour en arrière : sous le conteneur, puis dans la cible par la gauche.
                int enter = t.x() - GAP_X / 4;
                points.add(new Point(s.cx(), s.bottom()));
                points.add(new Point(s.cx(), lane));
                points.add(new Point(enter, lane));
                points.add(new Point(enter, t.cy()));
                points.add(new Point(t.x(), t.cy()));
                lane += LANE_STEP;
            }
            edges.put(f.id(), points);
        }
        for (Step s : plan.steps) {
            if (ProcessModel.STAGE.equals(s.type()) && plans.containsKey(s.id())) {
                route(plans.get(s.id()));
            }
        }
    }
}
