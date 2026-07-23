import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/lib/api/issue-service';
import { exportIssuesToCsv } from './export-issues-csv';

/**
 * `exportIssuesToCsv` ne retourne rien : elle construit un Blob puis déclenche un téléchargement.
 * Pour lire le CSV produit, on intercepte `URL.createObjectURL` et on récupère le Blob qui lui est
 * passé. C'est aussi ce qui permet de vérifier que l'URL objet est bien révoquée.
 */
let capturedBlob: Blob | null = null;

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    sequenceNumber: 1,
    identifier: 'TF-1',
    projectId: 1,
    projectName: 'TaskForce',
    title: 'Titre simple',
    description: null,
    priority: 'MEDIUM',
    status: { id: 1, name: 'En cours', color: '#000', category: 'STARTED', position: 0, isDefault: false },
    type: null,
    assignee: { id: 2, email: 'alice@example.com', displayName: 'Alice', avatarUrl: null },
    reporter: { id: 3, email: 'bob@example.com', displayName: 'Bob', avatarUrl: null },
    parent: null,
    childCount: 0,
    startDate: null,
    dueDate: '2026-08-01',
    completedAt: null,
    storyPoints: 5,
    labels: [{ id: 1, name: 'bug', color: '#f00' }],
    commentCount: 0,
    archived: false,
    pinned: false,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-01T10:00:00Z',
    ...overrides,
  } as Issue;
}

/** Rend le CSV effectivement écrit dans le Blob, BOM compris. */
async function exportAndRead(issues: Issue[], filenameBase?: string): Promise<string> {
  exportIssuesToCsv(issues, filenameBase);
  expect(capturedBlob).not.toBeNull();
  return capturedBlob!.text();
}

describe('exportIssuesToCsv', () => {
  beforeEach(() => {
    capturedBlob = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // La date sert au nom de fichier : figée pour que l'assertion soit déterministe.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T08:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('échappement RFC 4180', () => {
    /**
     * La fonction ne cite que si la valeur contient `"`, `,`, un retour à la ligne ou `;`.
     * Le point-virgule ne relève pas de la RFC : c'est un choix délibéré, Excel en locale française
     * l'utilisant comme séparateur de colonnes. Il est donc testé comme les autres.
     */
    it.each([
      ['texte sans caractère spécial', 'Corriger le login', 'Corriger le login'],
      ['une virgule', 'Corriger, puis tester', '"Corriger, puis tester"'],
      ['un guillemet double', 'Le champ "email"', '"Le champ ""email"""'],
      ['un retour à la ligne', 'Ligne 1\nLigne 2', '"Ligne 1\nLigne 2"'],
      ['un point-virgule', 'Corriger; tester', '"Corriger; tester"'],
      ['une chaîne vide', '', ''],
      ['des accents sans caractère spécial', 'Été déjà prêt', 'Été déjà prêt'],
      ['guillemet et virgule ensemble', 'a"b,c', '"a""b,c"'],
    ])('cite correctement un titre contenant %s', async (_cas, titre, attendu) => {
      const csv = await exportAndRead([makeIssue({ title: titre })]);
      const colonneTitre = csv.split('\r\n')[1].split(',').length; // sanity: la ligne existe

      expect(colonneTitre).toBeGreaterThan(0);
      expect(csv).toContain(attendu);
    });
  });

  describe('valeurs absentes', () => {
    it.each([
      ['storyPoints null', { storyPoints: null } as Partial<Issue>],
      ['dueDate null', { dueDate: null } as Partial<Issue>],
      ['assignee null', { assignee: null } as Partial<Issue>],
    ])('remplace %s par une cellule vide', async (_cas, overrides) => {
      const csv = await exportAndRead([makeIssue(overrides)]);
      const ligne = csv.split('\r\n')[1];

      // Une cellule vide se manifeste par deux séparateurs consécutifs ou une fin de ligne vide.
      expect(ligne).toMatch(/(,,)|(,$)/);
    });

    it('retombe sur l\'e-mail quand le nom affiché est absent', async () => {
      const csv = await exportAndRead([
        makeIssue({ assignee: { id: 2, email: 'alice@example.com', displayName: null, avatarUrl: null } }),
      ]);

      expect(csv).toContain('alice@example.com');
    });

    it('laisse la cellule vide quand ni nom ni e-mail ne sont exploitables', async () => {
      const csv = await exportAndRead([
        makeIssue({ assignee: { id: 2, email: '', displayName: null, avatarUrl: null } }),
      ]);
      const cellules = csv.split('\r\n')[1].split(',');

      expect(cellules[4]).toBe('');
    });
  });

  describe('structure du fichier', () => {
    it('écrit la ligne d\'en-tête même sans aucune issue', async () => {
      const csv = await exportAndRead([]);

      expect(csv.split('\r\n')).toHaveLength(1);
      expect(csv).toContain('Identifier,Title,Status,Priority,Assignee,Reporter,Labels,Story Points,Due Date,Created At');
    });

    it('écrit une ligne par issue, séparées par CRLF', async () => {
      const csv = await exportAndRead([
        makeIssue({ identifier: 'TF-1' }),
        makeIssue({ identifier: 'TF-2' }),
      ]);

      expect(csv.split('\r\n')).toHaveLength(3); // en-tête + 2 issues
    });

    it('préfixe le contenu d\'un BOM UTF-8, sans quoi Excel casse les accents', async () => {
      const csv = await exportAndRead([makeIssue({ title: 'Été' })]);

      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });

    it('assemble les libellés multiples avec un séparateur lisible', async () => {
      const csv = await exportAndRead([
        makeIssue({
          labels: [
            { id: 1, name: 'bug', color: '#f00' },
            { id: 2, name: 'urgent', color: '#00f' },
          ],
        }),
      ]);

      expect(csv).toContain('bug | urgent');
    });

    it('produit une cellule vide quand le statut est absent', async () => {
      const csv = await exportAndRead([makeIssue({ status: null as unknown as Issue['status'] })]);
      const cellules = csv.split('\r\n')[1].split(',');

      expect(cellules[2]).toBe('');
    });
  });

  describe('déclenchement du téléchargement', () => {
    it('nomme le fichier avec la base fournie et la date du jour', async () => {
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const ancres: string[] = [];
      const creerElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = creerElement(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'download', {
            set: (v: string) => ancres.push(v),
            get: () => ancres[ancres.length - 1],
            configurable: true,
          });
        }
        return el;
      });

      exportIssuesToCsv([makeIssue()], 'sprint-42');

      expect(ancres).toContain('sprint-42-2026-07-23.csv');
      expect(clic).toHaveBeenCalledOnce();
    });

    it('révoque l\'URL objet et ne laisse aucun lien dans le DOM', async () => {
      const revoque = vi.spyOn(URL, 'revokeObjectURL');
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      exportIssuesToCsv([makeIssue()]);

      expect(revoque).toHaveBeenCalledWith('blob:mock');
      expect(document.querySelectorAll('a')).toHaveLength(0);
    });
  });
});
