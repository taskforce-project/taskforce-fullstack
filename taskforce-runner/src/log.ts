/** Journal horodaté sur stderr/stdout. Ne jamais y passer un jeton ni un secret. */
function stamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export const log = {
  info: (message: string): void => console.log(`${stamp()}  ${message}`),
  warn: (message: string): void => console.warn(`${stamp()}  [!] ${message}`),
  error: (message: string): void => console.error(`${stamp()}  [x] ${message}`),
};
