/**
 * Kit de composants chat agentique - vendus à la main (no-dep ; le réseau du poste corrompt
 * npm/prompt-kit). Themables via tokens Tailwind, prêts à câbler sur le deep-path agentique
 * (tool calling, reasoning, recherche web, tâches longues).
 */
export { Tool, type ToolProps, type ToolStatus } from "./tool"
export { Reasoning, type ReasoningProps } from "./reasoning"
export { Steps, type Step, type StepStatus, type StepsProps } from "./steps"
export { Source, Sources, type SourceItem } from "./source"
export { PromptSuggestion } from "./prompt-suggestion"
export { FeedbackBar } from "./feedback-bar"
export { ScrollButton } from "./scroll-button"
export { ThinkingBar } from "./thinking-bar"
export { TokenMeter } from "./token-meter"
export { Message, type MessageRole, type MessageProps } from "./message"

// Réexports des primitives déjà en place (cohérence du kit).
export { Loader } from "@/components/ui/loader"
export { Markdown } from "@/components/ui/lightweight-markdown"
export { ShimmeringText } from "@/components/ui/shimmering-text"
