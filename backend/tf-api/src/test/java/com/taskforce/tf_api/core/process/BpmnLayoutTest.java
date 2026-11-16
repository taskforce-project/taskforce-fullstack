package com.taskforce.tf_api.core.process;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.core.process.BpmnLayout.Box;
import com.taskforce.tf_api.core.process.BpmnLayout.Point;
import com.taskforce.tf_api.core.process.ProcessModel.Flow;
import com.taskforce.tf_api.core.process.ProcessModel.Step;

/**
 * Le dessin de l'export (BPMN DI) : chaque élément a sa forme, chaque chemin son tracé ; une étape tient dans sa phase
 * ou sa zone ; deux étapes d'un même conteneur ne se chevauchent pas ; une échéance se pose sur le bord de son étape ;
 * un chemin part de sa source et arrive à sa cible. Ce que le Desktop Modeler montrera, sans le lancer.
 */
@DisplayName("Le dessin de l'export d'un processus")
class BpmnLayoutTest {

    private final ProcessModel model = ProcessFixtures.integrateAModule();
    private final BpmnLayout layout = BpmnLayout.of(model);

    @Test
    @DisplayName("chaque élément a sa forme, chaque chemin au moins deux points")
    void everything_is_drawn() {
        for (Step step : model.allSteps()) {
            assertThat(layout.boxes).as(step.id()).containsKey(step.id());
        }
        model.flowsOrEmpty().forEach(f -> assertThat(layout.edges.get(f.id())).as(f.id()).hasSizeGreaterThanOrEqualTo(2));
        model.allSteps().forEach(s -> s.flowsOrEmpty()
            .forEach(f -> assertThat(layout.edges.get(f.id())).as(f.id()).hasSizeGreaterThanOrEqualTo(2)));
    }

    @Test
    @DisplayName("une étape tient dans son conteneur, et ne chevauche pas ses voisines")
    void inside_and_apart() {
        check(null, model.stepsOrEmpty());
    }

    private void check(Step parent, List<Step> steps) {
        List<Step> nodes = steps.stream().filter(s -> !s.boundary()).toList();
        for (int i = 0; i < nodes.size(); i++) {
            Box a = layout.boxes.get(nodes.get(i).id());
            if (parent != null) {
                Box p = layout.boxes.get(parent.id());
                assertThat(a.x() >= p.x() && a.y() >= p.y() && a.right() <= p.right() && a.bottom() <= p.bottom())
                    .as(nodes.get(i).id() + " inside " + parent.id()).isTrue();
            }
            for (int j = i + 1; j < nodes.size(); j++) {
                Box b = layout.boxes.get(nodes.get(j).id());
                boolean apart = a.right() <= b.x() || b.right() <= a.x() || a.bottom() <= b.y() || b.bottom() <= a.y();
                assertThat(apart).as(nodes.get(i).id() + " apart from " + nodes.get(j).id()).isTrue();
            }
            if (nodes.get(i).container()) {
                check(nodes.get(i), nodes.get(i).stepsOrEmpty());
            }
        }
        for (Step s : steps) {
            if (s.boundary()) {
                Box b = layout.boxes.get(s.id());
                Box host = layout.boxes.get(s.attachedTo());
                assertThat(b.cy()).as(s.id() + " on the edge of " + s.attachedTo()).isEqualTo(host.bottom());
                assertThat(b.x() >= host.x() && b.right() <= host.right()).as(s.id() + " under " + s.attachedTo()).isTrue();
            }
        }
    }

    @Test
    @DisplayName("un chemin part de sa source et arrive à sa cible, par des segments droits")
    void edges_touch_their_ends() {
        check(model.flowsOrEmpty());
        model.allSteps().forEach(s -> check(s.flowsOrEmpty()));
    }

    private void check(List<Flow> flows) {
        for (Flow f : flows) {
            List<Point> points = layout.edges.get(f.id());
            assertThat(touches(layout.boxes.get(f.from()), points.get(0))).as(f.id() + " leaves " + f.from()).isTrue();
            assertThat(touches(layout.boxes.get(f.to()), points.get(points.size() - 1))).as(f.id() + " reaches " + f.to())
                .isTrue();
            for (int i = 1; i < points.size(); i++) {
                Point a = points.get(i - 1);
                Point b = points.get(i);
                assertThat(a.x() == b.x() || a.y() == b.y()).as(f.id() + " goes straight").isTrue();
            }
        }
    }

    private static boolean touches(Box box, Point p) {
        boolean onX = p.x() == box.x() || p.x() == box.right() || p.x() == box.cx();
        boolean onY = p.y() == box.y() || p.y() == box.bottom() || p.y() == box.cy();
        return onX && onY && p.x() >= box.x() && p.x() <= box.right() && p.y() >= box.y() && p.y() <= box.bottom();
    }
}
