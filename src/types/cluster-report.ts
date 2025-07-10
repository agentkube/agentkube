export interface PopeyeIssue {
  group: string;
  gvr: string;
  level: number;
  message: string;
}

export interface PopeyeTally {
  ok: number;
  info: number;
  warning: number;
  error: number;
  score: number;
}

export interface PopeyeSection {
  linter: string;
  gvr: string;
  tally: PopeyeTally;
  issues: Record<string, PopeyeIssue[]>;
}

export interface ClusterReport {
  popeye: {
    report_time: string;
    score: number;
    grade: string;
    sections: PopeyeSection[];
    errors?: string[];
  };
  ClusterName?: string;
  ContextName?: string;
}