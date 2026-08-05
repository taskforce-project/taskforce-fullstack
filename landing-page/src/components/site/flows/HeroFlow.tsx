import { useEffect, type CSSProperties } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  useUpdateNodeInternals,
  useNodesInitialized,
} from "@xyflow/react";
import type { Node, Edge, NodeProps, NodeTypes, DefaultEdgeOptions } from "@xyflow/react";
import {
  Flag,
  Compass,
  Building2,
  CalendarClock,
  Terminal,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "@xyflow/react/dist/base.css";

/**
 * HeroFlow — le graphe de run de la page Orchestration, en React Flow (statique, façon Attio).
 * Cartes FIGÉES (aucune animation interne), connecteurs `smoothstep` à coins arrondis avec une vraie
 * flèche à l'arrivée et un « rond » (handle source) au départ. Interactions désactivées (pan/zoom/drag)
 * → c'est une illustration, pas un éditeur. D11 : le run est illustratif (légende « Illustrative » côté page).
 */

const KIND_STYLE: Record<string, string> = {
  Trigger: "bg-secondary text-muted-foreground border-border",
  CPO: "bg-violet-50 text-violet-700 border-violet-200",
  CTO: "bg-blue-50 text-blue-700 border-blue-200",
  COO: "bg-amber-50 text-amber-700 border-amber-200",
};
const STATE = {
  done: { label: "Approved", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  running: { label: "Running", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  queued: { label: "Queued", cls: "border-slate-200 bg-slate-100 text-slate-500" },
} as const;
type StateKey = keyof typeof STATE;

type StepData = {
  icon: LucideIcon;
  title: string;
  sub: string;
  kind?: string;
  state?: StateKey;
  hasSource: boolean;
  hasTarget: boolean;
  /** décalage d'apparition (ms) — cascade façon chaîne */
  delay: number;
};
type StepNodeT = Node<StepData, "step">;

function StepNode({ data }: NodeProps<StepNodeT>) {
  const Icon = data.icon;
  return (
    <div className="tf-node-anim" style={{ "--tf-delay": `${data.delay}ms` } as CSSProperties}>
      <div className="tf-node surface bg-card w-full rounded-xl p-3.5">
      {data.hasTarget && (
        <Handle type="target" position={Position.Top} isConnectable={false} className="tf-handle tf-handle--target" />
      )}
      <div className="flex items-center gap-2.5">
        <span className="bg-secondary/60 flex size-7 shrink-0 items-center justify-center rounded-lg border">
          <Icon className="text-foreground size-3.5" strokeWidth={1.75} />
        </span>
        <span className="text-foreground text-[12.5px] font-semibold">{data.title}</span>
        {data.state && (
          <span
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
              STATE[data.state].cls,
            )}
          >
            {data.state === "running" && <span className="size-1.5 rounded-full bg-current" />}
            {STATE[data.state].label}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-9">
        {data.kind && (
          <span className={cn("shrink-0 rounded border px-1.5 py-px text-[9px] font-medium", KIND_STYLE[data.kind])}>
            {data.kind}
          </span>
        )}
        <span className="text-muted-foreground text-[11px] leading-4">{data.sub}</span>
      </div>
      {data.hasSource && (
        <Handle type="source" position={Position.Bottom} isConnectable={false} className="tf-handle tf-handle--source" />
      )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { step: StepNode };

const W = 264; // largeur commune des cartes
const CX = 300; // centre horizontal du tronc
const TX = CX - W / 2; // 168

// initialWidth/initialHeight = dimensions réelles rendues (mesurées dans le navigateur).
// Dans un îlot Astro `client:only`, le ResizeObserver de React Flow ne mesure pas toujours les
// nœuds → ils resteraient invisibles et sans arêtes. En semant les dimensions (chemin « SSR » de
// RF), les cartes s'affichent et les connecteurs s'accrochent sans dépendre de la mesure.
function mkNode(
  id: string,
  x: number,
  y: number,
  h: number,
  delay: number,
  data: Omit<StepData, "delay">,
): StepNodeT {
  return {
    id,
    type: "step",
    position: { x, y },
    style: { width: W },
    initialWidth: W,
    initialHeight: h,
    data: { ...data, delay },
  };
}

// y calés sur les hauteurs réelles (n2 « Approach & contract » monte à 104) ; `delay` = cascade d'apparition.
const nodes: StepNodeT[] = [
  mkNode("n0", TX, 0, 94, 0, {
    icon: Flag,
    title: "Outcome set",
    sub: "“Let customers export their invoices”",
    kind: "Trigger",
    state: "done",
    hasSource: true,
    hasTarget: false,
  }),
  mkNode("n1", TX, 124, 94, 140, {
    icon: Compass,
    title: "Frame & spec",
    sub: "Users, acceptance criteria, definition of done",
    kind: "CPO",
    state: "done",
    hasSource: true,
    hasTarget: true,
  }),
  mkNode("n2", TX, 248, 104, 280, {
    icon: Building2,
    title: "Approach & contract",
    sub: "Architecture, endpoints, technical risks",
    kind: "CTO",
    state: "running",
    hasSource: true,
    hasTarget: true,
  }),
  mkNode("n3", TX, 382, 94, 420, {
    icon: CalendarClock,
    title: "Plan & sequence",
    sub: "Issues, dependencies, estimates",
    kind: "COO",
    state: "queued",
    hasSource: true,
    hasTarget: true,
  }),
  mkNode("exec", 0, 516, 78, 560, {
    icon: Terminal,
    title: "Execute",
    sub: "Approved context → your coding agent",
    hasSource: false,
    hasTarget: true,
  }),
  mkNode("qa", 600 - W, 516, 78, 560, {
    icon: ShieldCheck,
    title: "QA & sign-off",
    sub: "Verified against acceptance",
    hasSource: false,
    hasTarget: true,
  }),
];

const edges: Edge[] = [
  { id: "e0", source: "n0", target: "n1" },
  { id: "e1", source: "n1", target: "n2" },
  { id: "e2", source: "n2", target: "n3" },
  { id: "e3", source: "n3", target: "exec" },
  { id: "e4", source: "n3", target: "qa" },
];

// Style commun des arêtes : trait bleu de marque, coins arrondis, vraie flèche à l'arrivée.
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  style: { stroke: "#2563eb", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: "#2563eb" },
  pathOptions: { borderRadius: 16 },
};

function Flow() {
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    // Le ResizeObserver de RF ne mesure pas les nœuds dans un îlot Astro `client:only`
    // (handles jamais mesurés → aucune arête). On force la mesure des handles puis on recadre,
    // sur 2 frames (le DOM est peint), avec un dernier passage en filet.
    const measure = () => {
      nodes.forEach((n) => updateNodeInternals(n.id));
      fitView({ padding: 0.08 });
    };
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    const t = setTimeout(measure, 250);
    // Si l'îlot est monté dans un onglet en arrière-plan (rAF + ResizeObserver en pause côté
    // navigateur), rien n'est mesuré. On remesure dès que l'onglet redevient visible.
    const onVisible = () => {
      if (document.visibilityState === "visible") measure();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fitView, updateNodeInternals]);

  // Quand tous les nœuds sont mesurés : recadrer + lancer l'apparition en cascade (classe `tf-play`,
  // une seule fois). Filet à 900 ms si la mesure tarde, pour ne jamais laisser les cartes invisibles.
  useEffect(() => {
    const play = () => {
      fitView({ padding: 0.08 });
      document.querySelector<HTMLElement>(".tf-flow")?.classList.add("tf-play");
    };
    if (nodesInitialized) play();
    const t = setTimeout(play, 900);
    return () => clearTimeout(t);
  }, [nodesInitialized, fitView]);

  return (
    <ReactFlow
      className="tf-flow"
      defaultNodes={nodes}
      defaultEdges={edges}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      fitViewOptions={{ padding: 0.08 }}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      panOnDrag={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      minZoom={0.2}
      maxZoom={1.5}
    />
  );
}

export default function HeroFlow() {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </div>
  );
}
