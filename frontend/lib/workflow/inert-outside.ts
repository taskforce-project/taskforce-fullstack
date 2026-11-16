/**
 * Rend inerte tout ce qui entoure `element` dans `stop` : à chaque niveau, les frères de l'élément et de ses parents, jusqu'aux
 * enfants de `stop` ; ni focus, ni lecteur d'écran (R161, N4). Ce qui était déjà inerte le reste ; la fonction rendue ne
 * rend que ce qu'elle a pris. Un élément hors de `stop` ne touche à rien.
 */
export function inertOutside(element: Element, stop: Element): () => void {
  if (element === stop || !stop.contains(element)) return () => undefined
  const marked: Element[] = []
  let node: Element = element
  while (node !== stop && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || sibling.hasAttribute("inert")) continue
      sibling.setAttribute("inert", "")
      marked.push(sibling)
    }
    node = node.parentElement
  }
  return () => {
    for (const sibling of marked) sibling.removeAttribute("inert")
  }
}
