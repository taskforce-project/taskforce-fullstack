/**
 * Les suggestions sous la barre unique (R76, séance n°13) : elles disent ce qu'on peut demander sur cet écran (Norman,
 * Zhuo). Une suggestion remplit la barre, elle n'envoie rien ; « Create a project » laisse la place du nom.
 */
export interface BarSuggestion {
  label: string;
  /** Ce que la suggestion écrit dans la barre. */
  text: string;
}

const ANYWHERE: BarSuggestion[] = [
  { label: "Create a project", text: "Create a project " },
  { label: "Which issues are blocked?", text: "Which issues are blocked, and why?" },
  { label: "What changed this week?", text: "What changed this week?" },
];

const IN_A_PROJECT: BarSuggestion[] = [
  { label: "Create an issue", text: "Create an issue " },
  { label: "Which issues are blocked?", text: "Which issues are blocked, and why?" },
  { label: "What changed this week?", text: "What changed in this project this week?" },
];

const MY_WORK: BarSuggestion[] = [
  { label: "What should I do next?", text: "What should I work on next?" },
  { label: "What is due this week?", text: "Which of my issues are due this week?" },
  { label: "Create an issue", text: "Create an issue " },
];

export function suggestionsFor(pathname: string): BarSuggestion[] {
  if (/\/projects\/[^/]+/.test(pathname)) return IN_A_PROJECT;
  if (/\/my-work(\/|$)/.test(pathname)) return MY_WORK;
  return ANYWHERE;
}
