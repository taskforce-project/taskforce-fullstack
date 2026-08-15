import { useEffect } from "react";
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
  Sparkles,
  GitPullRequest,
  BrainCircuit,
  BarChart3,
  Repeat,
  Bot,
  FileText,
  Check,
  Boxes,
  Plug,
  Inbox,
  Scale,
  UserCheck,
  ListChecks,
  Zap,
  Lightbulb,
  Cpu,
  Gauge,
  Clock,
  GitBranch,
  Pencil,
  X,
  KeyRound,
  Database,
  Users,
  Ticket,
  Eye,
  Rocket,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "../BrandLogo";
import "@xyflow/react/dist/base.css";

/**
 * OrchestrationFlows — tous les schémas de la page Orchestration en React Flow, STATIQUES (aucune
 * animation, cf. retour user), structurés façon Attio. Un seul socle `StaticFlow` (interactions
 * coupées, badge masqué, canvas transparent) + 3 types de nœuds partagés. Le hero est ré-aligné à
 * partir des hauteurs DOM réelles (cartes de hauteurs variables) ; les autres nœuds ont une hauteur
 * fixe → espacement régulier sans mesure. D11 : illustratif (légende « Illustrative » côté page).
 */

/* ─────────────────────────── Partagé ─────────────────────────── */

const STATE = {
  done: { label: "Approved", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  running: { label: "Running", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  queued: { label: "Queued", cls: "border-slate-200 bg-slate-100 text-slate-500" },
} as const;
type StateKey = keyof typeof STATE;

const KIND_STYLE: Record<string, string> = {
  Trigger: "bg-secondary text-muted-foreground border-border",
  CPO: "bg-violet-50 text-violet-700 border-violet-200",
  CTO: "bg-blue-50 text-blue-700 border-blue-200",
  COO: "bg-amber-50 text-amber-700 border-amber-200",
};

type HandleSpec = { type: "source" | "target"; position: Position; id?: string; ring?: boolean };

function Handles({ handles }: { handles: HandleSpec[] }) {
  return (
    <>
      {handles.map((h, i) => (
        <Handle
          key={h.id ?? `${h.type}-${i}`}
          id={h.id}
          type={h.type}
          position={h.position}
          isConnectable={false}
          className={cn("tf-handle", h.type === "source" ? "tf-handle--source" : "tf-handle--target")}
        />
      ))}
    </>
  );
}

/* ── Types de nœuds ── */

type StepData = {
  icon: LucideIcon;
  title: string;
  sub: string;
  badge?: string;
  state?: StateKey;
  handles: HandleSpec[];
};
function StepNode({ data }: NodeProps<Node<StepData>>) {
  const Icon = data.icon;
  return (
    <div className="tf-node bg-card w-full border p-3.5">
      <Handles handles={data.handles} />
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
        {data.badge && (
          <span className={cn("shrink-0 rounded border px-1.5 py-px text-[9px] font-medium", KIND_STYLE[data.badge])}>
            {data.badge}
          </span>
        )}
        <span className="text-muted-foreground text-[11px] leading-4">{data.sub}</span>
      </div>
    </div>
  );
}

type MiniData = {
  icon?: LucideIcon;
  dot?: string;
  title: string;
  sub?: string;
  highlight?: boolean;
  handles: HandleSpec[];
};
function MiniNode({ data }: NodeProps<Node<MiniData>>) {
  const Icon = data.icon;
  const accent = data.dot;
  const tinted = !data.highlight && accent;
  return (
    <div
      className={cn(
        "tf-node flex h-full w-full items-center gap-3 border px-3",
        data.highlight ? "border-primary/30 bg-primary/[0.05]" : "bg-card",
      )}
    >
      <Handles handles={data.handles} />
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          data.highlight ? "border-primary/20 bg-primary/10" : "bg-secondary/60",
        )}
        style={
          tinted
            ? {
                background: `color-mix(in oklab, ${accent} 12%, var(--card))`,
                borderColor: `color-mix(in oklab, ${accent} 26%, transparent)`,
              }
            : undefined
        }
      >
        {Icon ? (
          <Icon
            className={cn("size-[18px]", data.highlight && "text-primary")}
            strokeWidth={1.75}
            style={tinted ? { color: accent } : undefined}
          />
        ) : accent ? (
          <span className="size-2.5 rounded-full" style={{ background: accent }} />
        ) : (
          <Sparkles className={cn("size-[18px]", data.highlight ? "text-primary" : "text-foreground")} strokeWidth={1.75} />
        )}
      </span>
      <div className="min-w-0">
        <div className="text-foreground text-[13px] font-semibold leading-tight">{data.title}</div>
        {data.sub && <div className="text-muted-foreground mt-0.5 text-[11.5px] leading-tight">{data.sub}</div>}
      </div>
    </div>
  );
}

type CtxData = { label: string; value: string; handles: HandleSpec[] };
function CtxNode({ data }: NodeProps<Node<CtxData>>) {
  return (
    <div className="tf-node bg-card flex h-full w-full items-center gap-2.5 border px-3">
      <Handles handles={data.handles} />
      <span className="text-primary w-[68px] shrink-0 font-mono text-[9px] font-semibold tracking-wide uppercase">
        {data.label}
      </span>
      <span className="text-foreground text-[11.5px] leading-tight">{data.value}</span>
    </div>
  );
}

type RunStepData = { n: number; text: string; accent?: boolean; handles: HandleSpec[] };
function RunStepNode({ data }: NodeProps<Node<RunStepData>>) {
  return (
    <div
      className={cn(
        "tf-node flex w-full items-start gap-3 border p-3.5",
        data.accent ? "border-primary/30 bg-primary/[0.05]" : "bg-card",
      )}
    >
      <Handles handles={data.handles} />
      <span
        className={cn(
          "mt-px flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
          data.accent ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground bg-card",
        )}
      >
        {data.n}
      </span>
      <span className="text-foreground text-[13px] leading-5">{data.text}</span>
    </div>
  );
}

// Nœud « hub » : soit le cœur (TaskForce/Memory, mis en avant), soit un outil connecté (vrai logo).
// Sert aux graphes RADIAUX (ex. Integrations) — une FORME différente des chaînes, pour varier.
type HubData = {
  label: string;
  sub?: string;
  brand?: string;
  icon?: LucideIcon;
  core?: boolean;
  handles: HandleSpec[];
};
function HubNode({ data }: NodeProps<Node<HubData>>) {
  if (data.core) {
    const Icon = data.icon ?? BrainCircuit;
    return (
      <div className="tf-node border-primary/30 bg-primary/[0.05] flex h-full w-full flex-col items-center justify-center gap-1.5 border px-3 text-center">
        <Handles handles={data.handles} />
        <span className="border-primary/20 bg-primary/10 flex size-9 items-center justify-center rounded-lg border">
          <Icon className="text-primary size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="text-foreground text-[13px] leading-tight font-semibold">{data.label}</div>
        {data.sub && <div className="text-muted-foreground text-[10.5px] leading-tight">{data.sub}</div>}
      </div>
    );
  }
  return (
    <div className="tf-node bg-card flex h-full w-full items-center gap-2 border px-2.5">
      <Handles handles={data.handles} />
      {data.brand ? (
        <BrandLogo brand={data.brand} label={data.label} className="size-4 shrink-0 object-contain" />
      ) : data.icon ? (
        <data.icon className="text-foreground size-4 shrink-0" strokeWidth={1.75} />
      ) : null}
      <span className="text-foreground text-[12px] leading-tight font-medium">{data.label}</span>
    </div>
  );
}

const nodeTypes: NodeTypes = { step: StepNode, mini: MiniNode, ctx: CtxNode, runStep: RunStepNode, hub: HubNode };

/* ── Arêtes ── */

const EDGE: DefaultEdgeOptions = {
  type: "smoothstep",
  style: { stroke: "#2563eb", strokeWidth: 1.75 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#2563eb" },
  pathOptions: { borderRadius: 0 },
};
// arête colorée (boucles de retour) avec libellé
function tinted(color: string) {
  return {
    type: "smoothstep" as const,
    style: { stroke: color, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color },
    pathOptions: { borderRadius: 0 },
    labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#ffffff" },
    labelBgPadding: [6, 2] as [number, number],
    labelBgBorderRadius: 4,
  };
}

/* ── Socle : canvas React Flow statique ── */

const OFF = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  edgesFocusable: false,
  elementsSelectable: false,
  panOnDrag: false,
  panOnScroll: false,
  zoomOnScroll: false,
  zoomOnPinch: false,
  zoomOnDoubleClick: false,
  preventScrolling: false,
} as const;

type Respace = { trunk: string[]; gap: number; branch?: string[]; branchGap?: number };

function CanvasInner({
  nodes,
  edges,
  flowClass,
  respace,
  padding = 0.08,
}: {
  nodes: Node[];
  edges: Edge[];
  flowClass: string;
  respace?: Respace;
  padding?: number;
}) {
  const { fitView, setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodesInitialized = useNodesInitialized();

  // Force la mesure des handles : dans un îlot `client:only` (onglet parfois caché au montage),
  // le ResizeObserver de RF ne se déclenche pas toujours → sans ça, aucune arête.
  useEffect(() => {
    const kick = () => nodes.forEach((n) => updateNodeInternals(n.id));
    const raf = requestAnimationFrame(() => requestAnimationFrame(kick));
    const t = setTimeout(kick, 250);
    const onVisible = () => document.visibilityState === "visible" && kick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [updateNodeInternals]);

  // Espacement régulier à partir des hauteurs DOM RÉELLES (cartes de hauteur variable) + recadrage.
  useEffect(() => {
    if (!nodesInitialized) return;
    if (respace) {
      const h = (id: string) =>
        document.querySelector<HTMLElement>(`.${flowClass} .react-flow__node[data-id="${id}"]`)?.offsetHeight ?? 90;
      setNodes((nds) => {
        const y = new Map<string, number>();
        let cur = 0;
        for (const id of respace.trunk) {
          y.set(id, cur);
          cur += h(id) + respace.gap;
        }
        if (respace.branch) {
          const last = respace.trunk[respace.trunk.length - 1]!;
          const by = (y.get(last) ?? 0) + h(last) + (respace.branchGap ?? respace.gap);
          for (const id of respace.branch) y.set(id, by);
        }
        return nds.map((n) => (y.has(n.id) ? { ...n, position: { ...n.position, y: y.get(n.id)! } } : n));
      });
    }
    requestAnimationFrame(() => fitView({ padding }));
  }, [nodesInitialized, respace, flowClass, padding, setNodes, fitView]);

  return (
    <ReactFlow
      className={cn("tf-flow", flowClass)}
      defaultNodes={nodes}
      defaultEdges={edges}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={EDGE}
      fitView
      fitViewOptions={{ padding }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={1}
      {...OFF}
    />
  );
}

function StaticFlow(props: {
  nodes: Node[];
  edges: Edge[];
  flowClass: string;
  respace?: Respace;
  padding?: number;
}) {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

/* ─────────────────────────── 1) Hero — pipeline ─────────────────────────── */

const HW = 264;
const HX = 168; // tronc centré (300 - 264/2)
const step = (
  id: string,
  x: number,
  y: number,
  h: number,
  data: StepData,
): Node<StepData> => ({ id, type: "step", position: { x, y }, style: { width: HW }, initialWidth: HW, initialHeight: h, data });

const src = (ring = true): HandleSpec => ({ type: "source", position: Position.Bottom, ring });
const tgt = (): HandleSpec => ({ type: "target", position: Position.Top });

const HERO_NODES: Node<StepData>[] = [
  step("n0", HX, 0, 94, { icon: Flag, title: "Outcome set", sub: "“Let customers export their invoices”", badge: "Trigger", state: "done", handles: [src()] }),
  step("n1", HX, 130, 94, { icon: Compass, title: "Frame & spec", sub: "Users, acceptance criteria, definition of done", badge: "CPO", state: "done", handles: [tgt(), src()] }),
  step("n2", HX, 260, 104, { icon: Building2, title: "Approach & contract", sub: "Architecture, endpoints, technical risks", badge: "CTO", state: "running", handles: [tgt(), src()] }),
  step("n3", HX, 390, 94, { icon: CalendarClock, title: "Plan & sequence", sub: "Issues, dependencies, estimates", badge: "COO", state: "queued", handles: [tgt(), src()] }),
  step("exec", 20, 520, 78, { icon: Terminal, title: "Execute", sub: "Approved context → your coding agent", handles: [tgt()] }),
  step("qa", 316, 520, 78, { icon: ShieldCheck, title: "QA & sign-off", sub: "Verified against acceptance", handles: [tgt()] }),
];
const HERO_EDGES: Edge[] = [
  { id: "h0", source: "n0", target: "n1" },
  { id: "h1", source: "n1", target: "n2" },
  { id: "h2", source: "n2", target: "n3" },
  { id: "h3", source: "n3", target: "exec" },
  { id: "h4", source: "n3", target: "qa" },
];

export function HeroFlow() {
  return (
    <StaticFlow
      flowClass="tf-hero"
      nodes={HERO_NODES}
      edges={HERO_EDGES}
      respace={{ trunk: ["n0", "n1", "n2", "n3"], gap: 34, branch: ["exec", "qa"], branchGap: 48 }}
    />
  );
}

/* ─────────────────────────── 2) Grounding — contexte → proposition ─────────────────────────── */

const CTX = [
  { label: "Decision", value: "Postgres over Mongo — tenant isolation" },
  { label: "Constraint", value: "EU data residency (GDPR)" },
  { label: "Convention", value: "Trunk-based, squash-merge" },
  { label: "Rejected", value: "Third-party billing — lock-in" },
];
const GND_NODES: Node[] = [
  ...CTX.map(
    (c, i): Node<CtxData> => ({
      id: `c${i}`,
      type: "ctx",
      position: { x: 0, y: i * 70 },
      style: { width: 224, height: 60 },
      initialWidth: 224,
      initialHeight: 60,
      data: { label: c.label, value: c.value, handles: [{ type: "source", position: Position.Right, ring: true }] },
    }),
  ),
  {
    id: "prop",
    type: "mini",
    position: { x: 336, y: 105 },
    style: { width: 200, height: 60 },
    initialWidth: 200,
    initialHeight: 60,
    data: {
      icon: Sparkles,
      title: "A proposal",
      sub: "grounded in your context",
      highlight: true,
      handles: [{ type: "target", position: Position.Left }],
    } as MiniData,
  },
];
const GND_EDGES: Edge[] = CTX.map((_, i) => ({ id: `g${i}`, source: `c${i}`, target: "prop" }));

export function GroundingFlow() {
  return <StaticFlow flowClass="tf-grounding" nodes={GND_NODES} edges={GND_EDGES} padding={0.1} />;
}

/* ─────────────────────────── 3) Approval loop ─────────────────────────── */

const AP_H = 60;
const AP_Y = 20;
const mini = (id: string, x: number, w: number, data: MiniData): Node<MiniData> => ({
  id,
  type: "mini",
  position: { x, y: AP_Y },
  style: { width: w, height: AP_H },
  initialWidth: w,
  initialHeight: AP_H,
  data,
});
const APP_NODES: Node<MiniData>[] = [
  mini("propose", 0, 200, {
    dot: "#2563eb",
    title: "Propose",
    sub: "the agent",
    handles: [
      { type: "source", position: Position.Right, id: "r", ring: true },
      { type: "target", position: Position.Bottom, id: "b" },
    ],
  }),
  mini("review", 250, 200, {
    dot: "#b45309",
    title: "Review",
    sub: "your team",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Right, id: "r", ring: true },
      { type: "source", position: Position.Bottom, id: "b" },
    ],
  }),
  mini("approve", 500, 200, {
    dot: "#059669",
    title: "Approve",
    sub: "human gate",
    handles: [{ type: "target", position: Position.Left, id: "l" }],
  }),
];
const APP_EDGES: Edge[] = [
  { id: "p1", source: "propose", sourceHandle: "r", target: "review", targetHandle: "l" },
  { id: "p2", source: "review", sourceHandle: "r", target: "approve", targetHandle: "l" },
  {
    id: "pL",
    source: "review",
    sourceHandle: "b",
    target: "propose",
    targetHandle: "b",
    label: "Request changes",
    ...tinted("#b45309"),
  },
];

export function ApprovalFlow() {
  return <StaticFlow flowClass="tf-approval" nodes={APP_NODES} edges={APP_EDGES} padding={0.06} />;
}

/* ─────────────────────────── 4) Handoff — plan → agent → PR (vertical) ─────────────────────────── */

const HO_H = 60;
const hoNode = (id: string, y: number, data: MiniData): Node<MiniData> => ({
  id,
  type: "mini",
  position: { x: 0, y },
  style: { width: 220, height: HO_H },
  initialWidth: 220,
  initialHeight: HO_H,
  data,
});
const HO_NODES: Node<MiniData>[] = [
  hoNode("plan", 0, {
    icon: ShieldCheck,
    title: "Approved plan",
    sub: "full context + acceptance",
    handles: [{ type: "source", position: Position.Bottom, ring: true }],
  }),
  hoNode("agent", 100, {
    icon: Terminal,
    title: "Your coding agent",
    sub: "receives the approved context",
    handles: [
      { type: "target", position: Position.Top },
      { type: "source", position: Position.Bottom, ring: true },
    ],
  }),
  hoNode("pr", 200, {
    icon: GitPullRequest,
    title: "Pull request",
    sub: "built, then reported back",
    handles: [{ type: "target", position: Position.Top }],
  }),
];
const HO_EDGES: Edge[] = [
  { id: "o1", source: "plan", target: "agent" },
  { id: "o2", source: "agent", target: "pr" },
];

export function HandoffFlow() {
  return <StaticFlow flowClass="tf-handoff" nodes={HO_NODES} edges={HO_EDGES} padding={0.06} />;
}

/* ─────────────────────────── 5) Calibration loop ─────────────────────────── */

const CA_H = 60;
const CA_Y = 20;
const caNode = (id: string, x: number, data: MiniData): Node<MiniData> => ({
  id,
  type: "mini",
  position: { x, y: CA_Y },
  style: { width: 200, height: CA_H },
  initialWidth: 200,
  initialHeight: CA_H,
  data,
});
const CAL_NODES: Node<MiniData>[] = [
  caNode("predict", 0, {
    dot: "#2563eb",
    title: "Predict",
    sub: "effort · risk · cost",
    handles: [
      { type: "source", position: Position.Right, id: "r", ring: true },
      { type: "target", position: Position.Bottom, id: "b" },
    ],
  }),
  caNode("ship", 240, {
    dot: "#64748b",
    title: "Ship",
    sub: "the step goes live",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Right, id: "r", ring: true },
    ],
  }),
  caNode("measure", 480, {
    dot: "#b45309",
    title: "Measure",
    sub: "actual vs forecast",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Right, id: "r", ring: true },
    ],
  }),
  caNode("recal", 720, {
    dot: "#059669",
    title: "Recalibrate",
    sub: "improves the next run",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Bottom, id: "b" },
    ],
  }),
];
const CAL_EDGES: Edge[] = [
  { id: "k1", source: "predict", sourceHandle: "r", target: "ship", targetHandle: "l" },
  { id: "k2", source: "ship", sourceHandle: "r", target: "measure", targetHandle: "l" },
  { id: "k3", source: "measure", sourceHandle: "r", target: "recal", targetHandle: "l" },
  {
    id: "kL",
    source: "recal",
    sourceHandle: "b",
    target: "predict",
    targetHandle: "b",
    label: "the next run starts better calibrated",
    ...tinted("#2563eb"),
  },
];

export function CalibrationFlow() {
  return <StaticFlow flowClass="tf-calibration" nodes={CAL_NODES} edges={CAL_EDGES} padding={0.06} />;
}

/* ─────────────────────────── 6) Agents — chaîne de rôles (vertical) ─────────────────────────── */
// `vChain` est une déclaration de fonction (hoistée) → utilisable ici même si définie plus bas.
const AGENTS = vChain(
  [
    { dot: "#64748b", icon: Flag, title: "Outcome", sub: "the goal", handles: [] },
    { dot: "#7c3aed", icon: Compass, title: "CPO", sub: "Framing · Spec · Acceptance", handles: [] },
    { dot: "#2563eb", icon: Building2, title: "CTO", sub: "Architecture · APIs · Risk", handles: [] },
    { dot: "#d97706", icon: CalendarClock, title: "COO", sub: "Sequencing · Dependencies", handles: [] },
    { icon: ShieldCheck, title: "Human approval", sub: "sign-off", highlight: true, handles: [] },
    { dot: "#059669", icon: GitPullRequest, title: "Delivery", sub: "ships", handles: [] },
  ],
  86,
  260,
);
export function AgentsFlow() {
  return <StaticFlow flowClass="tf-agents" nodes={AGENTS.nodes} edges={AGENTS.edges} padding={0.05} />;
}

/* ─── assembleur data-driven (chaîne verticale : texte à gauche, flux à droite) ─── */
function vChain(items: MiniData[], step: number, w: number): { nodes: Node<MiniData>[]; edges: Edge[] } {
  const nodes = items.map((d, i) => ({
    id: `n${i}`,
    type: "mini",
    position: { x: 0, y: i * step },
    style: { width: w, height: 60 },
    initialWidth: w,
    initialHeight: 60,
    data: {
      ...d,
      handles: [
        ...(i > 0 ? [{ type: "target", position: Position.Top, id: "t" } as HandleSpec] : []),
        ...(i < items.length - 1 ? [{ type: "source", position: Position.Bottom, id: "b" } as HandleSpec] : []),
      ],
    },
  })) as Node<MiniData>[];
  const edges = items.slice(1).map((_, i) => ({ id: `e${i}`, source: `n${i}`, sourceHandle: "b", target: `n${i + 1}`, targetHandle: "t" }));
  return { nodes, edges };
}

/* ─── 7) Analytics — boucle Delivery → … → Next run (vertical) ─── */
const ANALYTICS = vChain(
  [
    { dot: "#64748b", icon: GitPullRequest, title: "Delivery", handles: [] },
    { dot: "#2563eb", icon: BarChart3, title: "Analytics", handles: [] },
    { dot: "#d97706", icon: Repeat, title: "Recurring pattern", handles: [] },
    { icon: BrainCircuit, title: "Memory", highlight: true, handles: [] },
    { dot: "#059669", icon: Sparkles, title: "Next run", handles: [] },
  ],
  80,
  210,
);
export function AnalyticsLoopFlow() {
  return <StaticFlow flowClass="tf-analytics" nodes={ANALYTICS.nodes} edges={ANALYTICS.edges} padding={0.04} />;
}

/* ─── 8) Approvals — la primitive du checkpoint (vertical) ─── */
const APPROVALS = vChain(
  [
    { dot: "#64748b", icon: Bot, title: "Agent", sub: "proposes", handles: [] },
    { dot: "#2563eb", icon: FileText, title: "Artifact", sub: "spec · approach · plan", handles: [] },
    { icon: ShieldCheck, title: "Human review", sub: "approve · edit · reject", highlight: true, handles: [] },
    { dot: "#059669", icon: Check, title: "Approved decision", sub: "the checkpoint", handles: [] },
    { dot: "#7c3aed", icon: BrainCircuit, title: "Memory", sub: "written back", handles: [] },
    { dot: "#64748b", icon: Flag, title: "Next checkpoint", sub: "context for what follows", handles: [] },
  ],
  86,
  260,
);
export function ApprovalsFlow() {
  return <StaticFlow flowClass="tf-approvals" nodes={APPROVALS.nodes} edges={APPROVALS.edges} padding={0.05} />;
}

/* ─── 9) Integrations — connect → remember → act (vertical) ─── */
const INTEGRATIONS = vChain(
  [
    { dot: "#64748b", icon: Boxes, title: "Your systems", sub: "GitHub · Linear · Postgres · …", handles: [] },
    { dot: "#2563eb", icon: BrainCircuit, title: "Memory", sub: "context preserved", handles: [] },
    { dot: "#7c3aed", icon: Bot, title: "Agents", sub: "propose actions", handles: [] },
    { icon: ShieldCheck, title: "Human approval", sub: "sign-off", highlight: true, handles: [] },
    { dot: "#059669", icon: Plug, title: "External systems", sub: "PR · issue · Slack", handles: [] },
  ],
  90,
  280,
);
export function IntegrationsFlow() {
  return <StaticFlow flowClass="tf-integrations" nodes={INTEGRATIONS.nodes} edges={INTEGRATIONS.edges} padding={0.05} />;
}

/* ─── 9b) Integrations — HUB RADIAL (custom) : ton stack se connecte à une mémoire commune.
   Forme volontairement DIFFÉRENTE des chaînes verticales → illustre « connecter », pas un pipeline. ─── */
const IH_CW = 150, IH_CH = 74; // cœur
const IH_TW = 118, IH_TH = 46; // outil
const IH_TOOLS: { id: string; x: number; y: number; brand: string; label: string; src: Position; core: string }[] = [
  // Mix VOLONTAIREMENT business (review user : « des tools type business, pas full tech ») —
  // CRM · paiement · e-commerce · docs · comms, avec un seul ancrage dev (GitHub, connecteur prouvé).
  { id: "t0", x: 406, y: 197, brand: "github", label: "GitHub", src: Position.Left, core: "cr" },
  { id: "t1", x: 318, y: 84, brand: "salesforce", label: "Salesforce", src: Position.Bottom, core: "ct" },
  { id: "t2", x: 143, y: 84, brand: "slack", label: "Slack", src: Position.Bottom, core: "ct" },
  { id: "t3", x: 56, y: 197, brand: "stripe", label: "Stripe", src: Position.Right, core: "cl" },
  { id: "t4", x: 143, y: 310, brand: "notion", label: "Notion", src: Position.Top, core: "cb" },
  { id: "t5", x: 318, y: 310, brand: "shopify", label: "Shopify", src: Position.Top, core: "cb" },
];
const IH_NODES: Node<HubData>[] = [
  {
    id: "core",
    type: "hub",
    position: { x: 215, y: 183 },
    style: { width: IH_CW, height: IH_CH },
    initialWidth: IH_CW,
    initialHeight: IH_CH,
    data: {
      core: true,
      icon: BrainCircuit,
      label: "TaskForce",
      sub: "Brain OS · Memory",
      handles: [
        { type: "target", position: Position.Top, id: "ct" },
        { type: "target", position: Position.Right, id: "cr" },
        { type: "target", position: Position.Bottom, id: "cb" },
        { type: "target", position: Position.Left, id: "cl" },
      ],
    },
  },
  ...IH_TOOLS.map(
    (t): Node<HubData> => ({
      id: t.id,
      type: "hub",
      position: { x: t.x, y: t.y },
      style: { width: IH_TW, height: IH_TH },
      initialWidth: IH_TW,
      initialHeight: IH_TH,
      data: { brand: t.brand, label: t.label, handles: [{ type: "source", position: t.src, id: "s" }] },
    }),
  ),
];
const IH_EDGES: Edge[] = IH_TOOLS.map((t) => ({
  id: `ih-${t.id}`,
  source: t.id,
  sourceHandle: "s",
  target: "core",
  targetHandle: t.core,
  type: "straight",
  style: { stroke: "#2563eb", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: "#2563eb" },
}));
export function IntegrationsHubFlow() {
  return <StaticFlow flowClass="tf-inthub" nodes={IH_NODES} edges={IH_EDGES} padding={0.14} />;
}

/* ─── 10) Brain OS — la boucle Memory → … → Memory (horizontale, façon Calibration) ─── */
const BR_W = 190;
const BR_STEP = 230;
const brNode = (id: string, i: number, data: MiniData): Node<MiniData> => ({
  id,
  type: "mini",
  position: { x: i * BR_STEP, y: 20 },
  style: { width: BR_W, height: 60 },
  initialWidth: BR_W,
  initialHeight: 60,
  data,
});
const BRAIN_NODES: Node<MiniData>[] = [
  brNode("mem", 0, {
    icon: BrainCircuit,
    title: "Memory",
    sub: "knows why",
    highlight: true,
    handles: [
      { type: "source", position: Position.Right, id: "r", ring: true },
      { type: "target", position: Position.Bottom, id: "b" },
    ],
  }),
  brNode("orch", 1, {
    dot: "#2563eb",
    icon: Compass,
    title: "Orchestration",
    sub: "decides what's next",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Right, id: "r", ring: true },
    ],
  }),
  brNode("human", 2, {
    dot: "#d97706",
    icon: ShieldCheck,
    title: "Humans",
    sub: "approve",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Right, id: "r", ring: true },
    ],
  }),
  brNode("agents", 3, {
    dot: "#7c3aed",
    icon: Bot,
    title: "Agents",
    sub: "execute",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Right, id: "r", ring: true },
    ],
  }),
  brNode("valid", 4, {
    dot: "#059669",
    icon: Check,
    title: "Validated decisions",
    sub: "written back",
    handles: [
      { type: "target", position: Position.Left, id: "l" },
      { type: "source", position: Position.Bottom, id: "b" },
    ],
  }),
];
const BRAIN_EDGES: Edge[] = [
  { id: "bm1", source: "mem", sourceHandle: "r", target: "orch", targetHandle: "l" },
  { id: "bm2", source: "orch", sourceHandle: "r", target: "human", targetHandle: "l" },
  { id: "bm3", source: "human", sourceHandle: "r", target: "agents", targetHandle: "l" },
  { id: "bm4", source: "agents", sourceHandle: "r", target: "valid", targetHandle: "l" },
  {
    id: "bLoop",
    source: "valid",
    sourceHandle: "b",
    target: "mem",
    targetHandle: "b",
    label: "every run writes back to it",
    ...tinted("#2563eb"),
  },
];
export function BrainLoopFlow() {
  return <StaticFlow flowClass="tf-brain" nodes={BRAIN_NODES} edges={BRAIN_EDGES} padding={0.1} />;
}

/* ─── 11) Smart Assign — routage d'une tâche vers le bon responsable (vertical) ─── */
const ROUTING = vChain(
  [
    { dot: "#64748b", icon: Inbox, title: "New task", sub: "needs an owner", handles: [] },
    { dot: "#2563eb", icon: Scale, title: "Weigh signals", sub: "skills · load · availability", handles: [] },
    { icon: Sparkles, title: "Best match", sub: "proposed owner + reason", highlight: true, handles: [] },
    { dot: "#d97706", icon: ShieldCheck, title: "Human approves", sub: "or overrides", handles: [] },
    { dot: "#059669", icon: UserCheck, title: "Assignee", sub: "teammate or coding agent", handles: [] },
  ],
  84,
  260,
);
export function RoutingFlow() {
  return <StaticFlow flowClass="tf-routing" nodes={ROUTING.nodes} edges={ROUTING.edges} padding={0.05} />;
}

/* ─── 11b) Smart Assign — CONVERGENCE + fan-out (custom) : 3 signaux → pondération → le bon owner
   parmi plusieurs candidats (le choisi en vert). Forme DISTINCTE de la chaîne verticale. ─── */
const SA_H = 56;
const saNode = (id: string, x: number, y: number, w: number, data: MiniData): Node<MiniData> => ({
  id, type: "mini", position: { x, y }, style: { width: w, height: SA_H }, initialWidth: w, initialHeight: SA_H, data,
});
const SA_NODES: Node<MiniData>[] = [
  saNode("sk", 0, 8, 172, { dot: "#7c3aed", icon: Sparkles, title: "Skills", sub: "strengths", handles: [{ type: "source", position: Position.Right, id: "r" }] }),
  saNode("ld", 0, 100, 172, { dot: "#0891b2", icon: Gauge, title: "Load", sub: "current work", handles: [{ type: "source", position: Position.Right, id: "r" }] }),
  saNode("av", 0, 192, 172, { dot: "#2563eb", icon: Clock, title: "Availability", sub: "free now", handles: [{ type: "source", position: Position.Right, id: "r" }] }),
  saNode("match", 252, 100, 160, { icon: Scale, title: "Weigh & match", sub: "with the reason", highlight: true, handles: [{ type: "target", position: Position.Left, id: "l" }, { type: "source", position: Position.Right, id: "r" }] }),
  saNode("c0", 492, 8, 176, { dot: "#64748b", icon: Users, title: "Dana · Design", handles: [{ type: "target", position: Position.Left, id: "l" }] }),
  saNode("c1", 492, 100, 176, { dot: "#059669", icon: UserCheck, title: "Best match", sub: "proposed owner", handles: [{ type: "target", position: Position.Left, id: "l" }] }),
  saNode("c2", 492, 192, 176, { dot: "#64748b", icon: Bot, title: "Claude Code", sub: "coding agent", handles: [{ type: "target", position: Position.Left, id: "l" }] }),
];
const SA_EDGES: Edge[] = [
  { id: "sa1", source: "sk", sourceHandle: "r", target: "match", targetHandle: "l" },
  { id: "sa2", source: "ld", sourceHandle: "r", target: "match", targetHandle: "l" },
  { id: "sa3", source: "av", sourceHandle: "r", target: "match", targetHandle: "l" },
  { id: "sa4", source: "match", sourceHandle: "r", target: "c1", targetHandle: "l", label: "best match", ...tinted("#059669") },
  { id: "sa5", source: "match", sourceHandle: "r", target: "c0", targetHandle: "l", ...tinted("#94a3b8") },
  { id: "sa6", source: "match", sourceHandle: "r", target: "c2", targetHandle: "l", ...tinted("#94a3b8") },
];
export function SmartAssignFlow() {
  return <StaticFlow flowClass="tf-smartassign" nodes={SA_NODES} edges={SA_EDGES} padding={0.1} />;
}

/* ─── 12) Labs — la boucle Signal → Memory → … → Decision → ↩ Memory (horizontale) ─── */
const LB_W = 186;
const LB_STEP = 214;
const lbNode = (id: string, i: number, data: MiniData): Node<MiniData> => ({
  id,
  type: "mini",
  position: { x: i * LB_STEP, y: 20 },
  style: { width: LB_W, height: 60 },
  initialWidth: LB_W,
  initialHeight: 60,
  data,
});
const LR = (): HandleSpec => ({ type: "target", position: Position.Left, id: "l" });
const RR = (): HandleSpec => ({ type: "source", position: Position.Right, id: "r", ring: true });
const LABS_NODES: Node<MiniData>[] = [
  lbNode("sig", 0, { dot: "#cbd5e1", icon: Zap, title: "Signal", sub: "Input", handles: [RR()] }),
  lbNode("mem", 1, {
    dot: "#d97706",
    icon: BrainCircuit,
    title: "Memory",
    sub: "Beta",
    handles: [LR(), RR(), { type: "target", position: Position.Bottom, id: "b" }],
  }),
  lbNode("reason", 2, { dot: "#94a3b8", icon: Lightbulb, title: "Reasoning", sub: "Planned", handles: [LR(), RR()] }),
  lbNode("model", 3, { dot: "#059669", icon: Cpu, title: "Model", sub: "Live", handles: [LR(), RR()] }),
  lbNode("eval", 4, { dot: "#0284c7", icon: Gauge, title: "Evaluation", sub: "Research", handles: [LR(), RR()] }),
  lbNode("decide", 5, {
    dot: "#d97706",
    icon: GitBranch,
    title: "Decision",
    sub: "Beta",
    handles: [LR(), { type: "source", position: Position.Bottom, id: "b" }],
  }),
];
const LABS_EDGES: Edge[] = [
  { id: "l1", source: "sig", sourceHandle: "r", target: "mem", targetHandle: "l" },
  { id: "l2", source: "mem", sourceHandle: "r", target: "reason", targetHandle: "l" },
  { id: "l3", source: "reason", sourceHandle: "r", target: "model", targetHandle: "l" },
  { id: "l4", source: "model", sourceHandle: "r", target: "eval", targetHandle: "l" },
  { id: "l5", source: "eval", sourceHandle: "r", target: "decide", targetHandle: "l" },
  {
    id: "lLoop",
    source: "decide",
    sourceHandle: "b",
    target: "mem",
    targetHandle: "b",
    label: "feeds back into memory",
    ...tinted("#2563eb"),
  },
];
export function LabsLoopFlow() {
  return <StaticFlow flowClass="tf-labs" nodes={LABS_NODES} edges={LABS_EDGES} padding={0.1} />;
}

/* ─── 13) AI transparency — le chemin d'une proposition (chaîne + fourche de décision) ─── */
const PP_NODES: Node<MiniData>[] = [
  { id: "ctx", type: "mini", position: { x: 0, y: 0 }, style: { width: 200, height: 60 }, initialWidth: 200, initialHeight: 60, data: { dot: "#64748b", icon: BrainCircuit, title: "Context + Memory", sub: "workspace + decisions", handles: [{ type: "source", position: Position.Right, id: "r", ring: true }] } },
  { id: "agent", type: "mini", position: { x: 240, y: 0 }, style: { width: 168, height: 60 }, initialWidth: 168, initialHeight: 60, data: { dot: "#2563eb", icon: Sparkles, title: "Agent", sub: "drafts a proposal", handles: [LR(), RR()] } },
  { id: "artifact", type: "mini", position: { x: 448, y: 0 }, style: { width: 190, height: 60 }, initialWidth: 190, initialHeight: 60, data: { dot: "#64748b", icon: FileText, title: "Proposal", sub: "spec · approach · plan", handles: [LR(), RR()] } },
  { id: "review", type: "mini", position: { x: 690, y: 0 }, style: { width: 190, height: 60 }, initialWidth: 190, initialHeight: 60, data: { icon: ShieldCheck, title: "Human review", sub: "a person decides", highlight: true, handles: [LR(), { type: "source", position: Position.Bottom, id: "b" }] } },
  { id: "approve", type: "mini", position: { x: 612, y: 128 }, style: { width: 120, height: 56 }, initialWidth: 120, initialHeight: 56, data: { dot: "#059669", icon: Check, title: "Approve", handles: [{ type: "target", position: Position.Top, id: "t" }, { type: "source", position: Position.Bottom, id: "b" }] } },
  { id: "edit", type: "mini", position: { x: 748, y: 128 }, style: { width: 110, height: 56 }, initialWidth: 110, initialHeight: 56, data: { dot: "#64748b", icon: Pencil, title: "Edit", handles: [{ type: "target", position: Position.Top, id: "t" }] } },
  { id: "reject", type: "mini", position: { x: 872, y: 128 }, style: { width: 120, height: 56 }, initialWidth: 120, initialHeight: 56, data: { dot: "#dc2626", icon: X, title: "Reject", handles: [{ type: "target", position: Position.Top, id: "t" }] } },
  { id: "next", type: "mini", position: { x: 582, y: 246 }, style: { width: 200, height: 60 }, initialWidth: 200, initialHeight: 60, data: { icon: Flag, title: "Next checkpoint", sub: "only an approved step continues", highlight: true, handles: [{ type: "target", position: Position.Top, id: "t" }] } },
];
const PP_EDGES: Edge[] = [
  { id: "pp1", source: "ctx", sourceHandle: "r", target: "agent", targetHandle: "l" },
  { id: "pp2", source: "agent", sourceHandle: "r", target: "artifact", targetHandle: "l" },
  { id: "pp3", source: "artifact", sourceHandle: "r", target: "review", targetHandle: "l" },
  { id: "pp4", source: "review", sourceHandle: "b", target: "approve", targetHandle: "t", label: "approve", ...tinted("#059669") },
  { id: "pp5", source: "review", sourceHandle: "b", target: "edit", targetHandle: "t", label: "edit", ...tinted("#64748b") },
  { id: "pp6", source: "review", sourceHandle: "b", target: "reject", targetHandle: "t", label: "reject", ...tinted("#dc2626") },
  { id: "pp7", source: "approve", sourceHandle: "b", target: "next", targetHandle: "t", ...tinted("#059669") },
];
export function ProposalPathFlow() {
  return <StaticFlow flowClass="tf-proposal" nodes={PP_NODES} edges={PP_EDGES} padding={0.08} />;
}

/* ─── 14) Enterprise — comment TaskForce s'insère (IdP → TaskForce → systèmes/données/modèles) ─── */
const ES_NODES: Node<MiniData>[] = [
  { id: "idp", type: "mini", position: { x: 190, y: 0 }, style: { width: 240, height: 60 }, initialWidth: 240, initialHeight: 60, data: { dot: "#64748b", icon: KeyRound, title: "Your identity provider", sub: "OIDC / SAML", handles: [{ type: "source", position: Position.Bottom, id: "b", ring: true }] } },
  { id: "tf", type: "mini", position: { x: 150, y: 116 }, style: { width: 320, height: 64 }, initialWidth: 320, initialHeight: 64, data: { icon: ShieldCheck, title: "TaskForce", sub: "Governance · Memory · Orchestration", highlight: true, handles: [{ type: "target", position: Position.Top, id: "t" }, { type: "source", position: Position.Bottom, id: "b", ring: true }] } },
  { id: "conn", type: "mini", position: { x: 0, y: 240 }, style: { width: 200, height: 60 }, initialWidth: 200, initialHeight: 60, data: { dot: "#64748b", icon: Plug, title: "Connected systems", sub: "GitHub · Linear · Slack", handles: [{ type: "target", position: Position.Top, id: "t" }] } },
  { id: "data", type: "mini", position: { x: 210, y: 240 }, style: { width: 200, height: 60 }, initialWidth: 200, initialHeight: 60, data: { dot: "#64748b", icon: Database, title: "Data", sub: "PostgreSQL · S3 / MinIO", handles: [{ type: "target", position: Position.Top, id: "t" }] } },
  { id: "models", type: "mini", position: { x: 420, y: 240 }, style: { width: 200, height: 60 }, initialWidth: 200, initialHeight: 60, data: { dot: "#2563eb", icon: Cpu, title: "Models", sub: "Hosted · Local", handles: [{ type: "target", position: Position.Top, id: "t" }] } },
];
const ES_EDGES: Edge[] = [
  { id: "es1", source: "idp", sourceHandle: "b", target: "tf", targetHandle: "t" },
  { id: "es2", source: "tf", sourceHandle: "b", target: "conn", targetHandle: "t" },
  { id: "es3", source: "tf", sourceHandle: "b", target: "data", targetHandle: "t" },
  { id: "es4", source: "tf", sourceHandle: "b", target: "models", targetHandle: "t" },
];
export function EnterpriseStackFlow() {
  return <StaticFlow flowClass="tf-enterprise" nodes={ES_NODES} edges={ES_EDGES} padding={0.1} />;
}

/* ─── 15) Solutions/Engineering — le run, de l'outcome à la livraison relue (vertical) ─── */
const ENG_RUN = vChain(
  [
    { dot: "#7c3aed", icon: Compass, title: "Frame & spec", sub: "problem · DoD · acceptance", handles: [] },
    { dot: "#2563eb", icon: Building2, title: "Approach & contract", sub: "architecture · API · risks", handles: [] },
    { dot: "#d97706", icon: ListChecks, title: "Break into issues", sub: "sequenced work", handles: [] },
    { dot: "#64748b", icon: Terminal, title: "Hand off", sub: "to your coding agent", handles: [] },
    { dot: "#059669", icon: ShieldCheck, title: "QA & sign-off", sub: "against acceptance", handles: [] },
  ],
  84,
  260,
);
export function EngineeringRunFlow() {
  return <StaticFlow flowClass="tf-engrun" nodes={ENG_RUN.nodes} edges={ENG_RUN.edges} padding={0.05} />;
}

/* Map nom→icône pour les flows pilotés par props : une `.astro` ne peut pas passer un composant icône
   à un îlot `client:only` (non sérialisable) → on passe un nom, résolu ici. */
const ICON_MAP: Record<string, LucideIcon> = {
  flag: Flag, compass: Compass, building: Building2, calendar: CalendarClock, terminal: Terminal,
  shield: ShieldCheck, sparkles: Sparkles, pr: GitPullRequest, brain: BrainCircuit, chart: BarChart3,
  repeat: Repeat, bot: Bot, file: FileText, check: Check, boxes: Boxes, plug: Plug, inbox: Inbox,
  scale: Scale, userCheck: UserCheck, list: ListChecks, zap: Zap, lightbulb: Lightbulb, cpu: Cpu,
  gauge: Gauge, branch: GitBranch, pencil: Pencil, x: X, key: KeyRound, database: Database,
  users: Users, ticket: Ticket, eye: Eye, rocket: Rocket, board: LayoutGrid,
};

/* Palette sémantique des icônes — teinte par FAMILLE, pas par icône, pour que la couleur PORTE un
   sens et reste cohérente d'un flux à l'autre (bleu = build/spec · violet = IA/pensée · émeraude =
   livré · ambre = gouvernance · cyan = data · rose = rejet · ardoise = neutre/entrée). Alignée sur
   les `dot` déjà posés à la main sur les flux Orchestration. `StepChainFlow` la lit par défaut. */
const ICON_COLOR: Record<string, string> = {
  // neutre / entrée / structurel — ardoise
  inbox: "#64748b", boxes: "#64748b", database: "#64748b", key: "#64748b", users: "#64748b", eye: "#64748b",
  // cadrage / pensée / IA / modèle — violet
  compass: "#7c3aed", sparkles: "#7c3aed", brain: "#7c3aed", bot: "#7c3aed", lightbulb: "#7c3aed",
  repeat: "#7c3aed", cpu: "#7c3aed",
  // build / spec / plan / exécution — bleu de marque
  file: "#2563eb", building: "#2563eb", calendar: "#2563eb", list: "#2563eb", terminal: "#2563eb",
  plug: "#2563eb", branch: "#2563eb", flag: "#2563eb",
  // data / mesure — cyan
  chart: "#0891b2", gauge: "#0891b2", scale: "#0891b2", board: "#0891b2",
  // gouvernance / revue / attention — ambre
  shield: "#d97706", pencil: "#d97706", zap: "#d97706",
  // livré / validé / succès — émeraude
  check: "#059669", rocket: "#059669", pr: "#059669", userCheck: "#059669",
  // rejet / incident — rose
  x: "#e11d48", ticket: "#e11d48",
};

/* ─── 17) Chaîne d'étapes générique (props) — pour les sections home (What ships today, Before/After) ─── */
export function StepChainFlow({
  steps,
  id,
  dir = "v",
  highlight,
  accentAll,
  w = 220,
}: {
  steps: { title: string; sub?: string; icon?: string; dot?: string }[];
  id: string;
  dir?: "v" | "h";
  highlight?: number;
  accentAll?: boolean;
  w?: number;
}) {
  const H = 58;
  const gap = dir === "v" ? 90 : w + 24;
  const last = steps.length - 1;
  const nodes: Node<MiniData>[] = steps.map((s, i) => ({
    id: `n${i}`,
    type: "mini",
    position: dir === "v" ? { x: 0, y: i * gap } : { x: i * gap, y: 0 },
    style: { width: w, height: H },
    initialWidth: w,
    initialHeight: H,
    data: {
      title: s.title,
      sub: s.sub,
      icon: s.icon ? ICON_MAP[s.icon] : undefined,
      // teinte : celle passée à la main, sinon dérivée de l'icône (palette sémantique cohérente).
      dot: s.dot ?? (s.icon ? ICON_COLOR[s.icon] : undefined),
      highlight: accentAll || i === highlight,
      handles:
        dir === "v"
          ? [
              ...(i > 0 ? [{ type: "target", position: Position.Top, id: "t" } as HandleSpec] : []),
              ...(i < last ? [{ type: "source", position: Position.Bottom, id: "b" } as HandleSpec] : []),
            ]
          : [
              ...(i > 0 ? [{ type: "target", position: Position.Left, id: "l" } as HandleSpec] : []),
              ...(i < last ? [{ type: "source", position: Position.Right, id: "r", ring: true } as HandleSpec] : []),
            ],
    },
  }));
  const edges: Edge[] = steps.slice(1).map((_, i) => ({
    id: `e${i}`,
    source: `n${i}`,
    target: `n${i + 1}`,
    sourceHandle: dir === "v" ? "b" : "r",
    targetHandle: dir === "v" ? "t" : "l",
  }));
  return <StaticFlow flowClass={`tf-chain-${id}`} nodes={nodes} edges={edges} padding={0.05} />;
}

/* ─── 16) Use cases — les étapes « In a run » (verticales, texte qui wrap, hauteur mesurée) ─── */
export function UseCaseRunFlow({ steps }: { steps: string[] }) {
  const W = 440;
  const accentOf = (t: string) => /human|approv|sign off|review/i.test(t);
  const nodes: Node<RunStepData>[] = steps.map((text, i) => ({
    id: `s${i}`,
    type: "runStep",
    position: { x: 0, y: i * 92 },
    style: { width: W },
    initialWidth: W,
    initialHeight: 64,
    data: {
      n: i + 1,
      text,
      accent: accentOf(text),
      handles: [
        ...(i > 0 ? [{ type: "target", position: Position.Top, id: "t" } as HandleSpec] : []),
        ...(i < steps.length - 1 ? [{ type: "source", position: Position.Bottom, id: "b" } as HandleSpec] : []),
      ],
    },
  }));
  const edges: Edge[] = steps.slice(1).map((_, i) => ({
    id: `e${i}`,
    source: `s${i}`,
    sourceHandle: "b",
    target: `s${i + 1}`,
    targetHandle: "t",
  }));
  return (
    <StaticFlow
      flowClass="tf-usecase"
      nodes={nodes}
      edges={edges}
      respace={{ trunk: steps.map((_, i) => `s${i}`), gap: 16 }}
      padding={0.06}
    />
  );
}

/* ─── 18) Decision graph — Requirement → Decision → Impacts (+ Rejected en pointillés) ─── */
const DG_NODES: Node<MiniData>[] = [
  { id: "req", type: "mini", position: { x: 130, y: 0 }, style: { width: 250, height: 60 }, initialWidth: 250, initialHeight: 60, data: { dot: "#64748b", icon: FileText, title: "Vector search + billing", sub: "Requirement", handles: [{ type: "source", position: Position.Bottom, id: "b", ring: true }] } },
  { id: "decision", type: "mini", position: { x: 100, y: 122 }, style: { width: 310, height: 66 }, initialWidth: 310, initialHeight: 66, data: { icon: BrainCircuit, title: "Postgres + pgvector", sub: "Decision", highlight: true, handles: [{ type: "target", position: Position.Top, id: "t" }, { type: "source", position: Position.Bottom, id: "b", ring: true }, { type: "source", position: Position.Right, id: "r", ring: true }] } },
  { id: "impacts", type: "mini", position: { x: 130, y: 256 }, style: { width: 250, height: 60 }, initialWidth: 250, initialHeight: 60, data: { dot: "#2563eb", icon: Boxes, title: "Billing · Search · Users", sub: "Impacts", handles: [{ type: "target", position: Position.Top, id: "t" }] } },
  { id: "rejected", type: "mini", position: { x: 470, y: 125 }, style: { width: 210, height: 60 }, initialWidth: 210, initialHeight: 60, data: { dot: "#cbd5e1", icon: X, title: "MongoDB", sub: "Rejected · weaker transactions", handles: [{ type: "target", position: Position.Left, id: "l" }] } },
];
const DG_EDGES: Edge[] = [
  { id: "dg1", source: "req", sourceHandle: "b", target: "decision", targetHandle: "t", label: "drives", ...tinted("#94a3b8") },
  { id: "dg2", source: "decision", sourceHandle: "b", target: "impacts", targetHandle: "t", label: "impacts", ...tinted("#94a3b8") },
  {
    id: "dg3",
    source: "decision",
    sourceHandle: "r",
    target: "rejected",
    targetHandle: "l",
    type: "smoothstep",
    label: "rejected",
    style: { stroke: "#cbd5e1", strokeWidth: 1.5, strokeDasharray: "5 4" },
    markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: "#cbd5e1" },
    pathOptions: { borderRadius: 0 },
    labelStyle: { fill: "#94a3b8", fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#ffffff" },
    labelBgPadding: [6, 2] as [number, number],
    labelBgBorderRadius: 4,
  },
];
export function DecisionGraphFlow() {
  return <StaticFlow flowClass="tf-decision" nodes={DG_NODES} edges={DG_EDGES} padding={0.12} />;
}
