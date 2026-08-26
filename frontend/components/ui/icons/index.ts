// Icônes animées « clés » (animateicons.in, réécrites sur framer-motion déjà présent dans le bundle).
// Portée volontairement resserrée aux spots à fort survol (nav sidebar, cloche, création) pour ne
// pas alourdir le JS d'hydratation — cf. objectif Lighthouse perf.
export { LayoutDashboardIcon } from "./layout-dashboard-icon"
export { RadioIcon } from "./radio-icon"
export { ListChecksIcon } from "./list-checks-icon"
export { LayersIcon } from "./layers-icon"
export { ActivityIcon } from "./activity-icon"
export { BrainIcon } from "./brain-icon"
export { UserIcon } from "./user-icon"
export { PlusIcon } from "./plus-icon"
export { BellIcon } from "./bell-icon"

// Replis génériques (glyphe lucide exact conservé) pour les icônes absentes du registry.
export { Settings2Icon, HelpCircleIcon } from "./animated-lucide"

export type { AnimatedIconHandle, AnimatedIconComponent } from "./types"
