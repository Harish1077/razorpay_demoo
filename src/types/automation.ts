export type WorkspaceSection = 'live-demo' | 'code';

export interface AutomationFile {
  path: string;
  name: string;
  category: 'tests' | 'pages' | 'utils' | 'config';
  language: string;
  content: string;
  lines: number;
}
