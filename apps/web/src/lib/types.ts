export type FilterTree = {
  agencies: Array<{
    id: string;
    name: string;
    modes: Array<{
      type: number;
      label: string;
      routes: Array<{ id: string; shortName: string | null; longName: string | null }>;
    }>;
  }>;
};
