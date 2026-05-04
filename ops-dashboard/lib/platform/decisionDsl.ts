export type DslOp = ">" | ">=" | "<" | "<=" | "==" | "!=";

export type DslAtom = { metric: string; op: DslOp; value: number | string | boolean };
export type DslNode = { all: DslNode[] } | { any: DslNode[] } | DslAtom;

function getMetricValue(metrics: Record<string, unknown>, key: string): unknown {
  return metrics[key];
}

function compare(a: unknown, op: DslOp, b: unknown): boolean {
  if (op === "==" || op === "!=") {
    const eq = a === b;
    return op === "==" ? eq : !eq;
  }
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  if (op === ">") return na > nb;
  if (op === ">=") return na >= nb;
  if (op === "<") return na < nb;
  if (op === "<=") return na <= nb;
  return false;
}

export function evalDecisionDsl(expr: DslNode, metrics: Record<string, unknown>): boolean {
  if ("all" in expr) return expr.all.every((n) => evalDecisionDsl(n, metrics));
  if ("any" in expr) return expr.any.some((n) => evalDecisionDsl(n, metrics));
  const atom = expr as DslAtom;
  const v = getMetricValue(metrics, atom.metric);
  return compare(v, atom.op, atom.value);
}

