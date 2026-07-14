import { exitLabelFor, type CompiledTree } from "./tree.ts";
import type {
  GroupExit,
  Highlight,
  ScannerSnapshot,
  ScannerStatus,
  ScanGroupNode,
  ScanNode,
} from "./types.ts";

/** A single position the highlight can occupy inside one scan scope. */
export type Candidate =
  | { readonly kind: "group"; readonly id: string }
  | { readonly kind: "target"; readonly id: string }
  | { readonly kind: "exit"; readonly groupId: string };

interface ScopeFrame {
  /** `null` identifies the synthetic root scope; strings are always user IDs. */
  readonly groupId: string | null;
  candidates: readonly Candidate[];
  index: number;
  pass: number;
}

export type SessionEffect =
  | {
      readonly type: "landed";
      readonly previous: Highlight;
      readonly current: NonNullable<Highlight>;
      readonly label: string;
    }
  | {
      readonly type: "group-entered";
      readonly id: string;
      readonly label: string;
    }
  | {
      readonly type: "group-exited";
      readonly id: string;
      readonly label: string;
      readonly reason: "selected-exit" | "back" | "loops-complete" | "empty";
    }
  | { readonly type: "root-exhausted" }
  | { readonly type: "root-empty" };

export type SessionSelection =
  | { readonly kind: "target"; readonly id: string }
  | { readonly kind: "handled"; readonly effects: readonly SessionEffect[] }
  | { readonly kind: "none" };

/**
 * Owns the dynamic traversal of a compiled scan tree. It has no knowledge of
 * timers, input devices, hosts, subscribers, or event delivery.
 */
export class ScanSession {
  private frames: ScopeFrame[] = [];

  constructor(
    private tree: CompiledTree,
    private groupExit: GroupExit,
  ) {}

  setTree(tree: CompiledTree): void {
    this.tree = tree;
  }

  setGroupExit(groupExit: GroupExit): void {
    this.groupExit = groupExit;
  }

  clear(): void {
    this.frames = [];
  }

  get depth(): number {
    return this.frames.length;
  }

  get currentHighlight(): Highlight {
    const candidate = this.currentCandidate;
    return candidate ? candidateToHighlight(candidate) : null;
  }

  get firstOfPass(): boolean {
    return this.currentFrame?.index === 0;
  }

  get currentPresentation(): {
    highlight: NonNullable<Highlight>;
    label: string;
  } | null {
    const candidate = this.currentCandidate;
    return candidate
      ? {
          highlight: candidateToHighlight(candidate),
          label: this.labelFor(candidate),
        }
      : null;
  }

  snapshot(
    status: ScannerStatus,
    highlight: Highlight = this.currentHighlight,
    pending: ScannerSnapshot["pending"] = null,
  ): ScannerSnapshot {
    const frame = this.currentFrame;
    return {
      status,
      highlight,
      path: this.frames.flatMap((item) =>
        item.groupId === null ? [] : [item.groupId],
      ),
      pass: frame ? frame.pass : 0,
      position: frame
        ? { index: frame.index, count: frame.candidates.length }
        : null,
      pending,
    };
  }

  start(): readonly SessionEffect[] {
    const candidates = buildCandidates(this.tree.root, true, this.groupExit);
    if (candidates.length === 0) {
      this.frames = [];
      return [{ type: "root-empty" }];
    }
    this.frames = [{ groupId: null, candidates, index: 0, pass: 1 }];
    return this.land(null);
  }

  resetToRoot(): readonly SessionEffect[] {
    const candidates = buildCandidates(this.tree.root, true, this.groupExit);
    if (candidates.length === 0) {
      this.frames = [];
      return [{ type: "root-empty" }];
    }
    this.frames = [{ groupId: null, candidates, index: 0, pass: 1 }];
    return this.land(null);
  }

  resetCurrentScope(): readonly SessionEffect[] {
    const frame = this.currentFrame;
    if (!frame) return [];
    const previous = this.currentHighlight;
    frame.index = 0;
    frame.pass = 1;
    return this.land(previous);
  }

  stepForward(loopLimit: number | null): readonly SessionEffect[] {
    const frame = this.currentFrame;
    if (!frame || frame.candidates.length === 0) return [];
    const previous = this.currentHighlight;
    if (frame.index < frame.candidates.length - 1) {
      frame.index += 1;
      return this.land(previous);
    }

    const nextPass = frame.pass + 1;
    if (
      loopLimit !== null &&
      Number.isFinite(loopLimit) &&
      nextPass > loopLimit
    ) {
      return this.exhaustScope();
    }
    frame.pass = nextPass;
    frame.index = 0;
    return this.land(previous);
  }

  stepBackward(): readonly SessionEffect[] {
    const frame = this.currentFrame;
    if (!frame || frame.candidates.length === 0) return [];
    const previous = this.currentHighlight;
    frame.index =
      frame.index > 0 ? frame.index - 1 : frame.candidates.length - 1;
    return this.land(previous);
  }

  selectCurrent(): SessionSelection {
    const candidate = this.currentCandidate;
    if (!candidate) return { kind: "none" };
    if (candidate.kind === "group") {
      return { kind: "handled", effects: this.enterGroup(candidate.id) };
    }
    if (candidate.kind === "exit") {
      return { kind: "handled", effects: this.leaveGroup("selected-exit") };
    }
    return { kind: "target", id: candidate.id };
  }

  back(): readonly SessionEffect[] | null {
    if (this.frames.length <= 1) return null;
    return this.leaveGroup("back");
  }

  reconcile(): readonly SessionEffect[] {
    if (this.frames.length === 0) return [];

    const previousHighlight = this.currentHighlight;
    const rebuilt: ScopeFrame[] = [];
    const rootCandidates = buildCandidates(
      this.tree.root,
      true,
      this.groupExit,
    );
    rebuilt.push({
      groupId: null,
      candidates: rootCandidates,
      index: 0,
      pass: this.frames[0]!.pass,
    });

    for (let i = 1; i < this.frames.length; i += 1) {
      const frame = this.frames[i]!;
      if (frame.groupId === null) break;
      const parent = rebuilt[rebuilt.length - 1]!;
      const stillPresent = parent.candidates.some(
        (candidate) =>
          candidate.kind === "group" && candidate.id === frame.groupId,
      );
      const node = this.tree.byId.get(frame.groupId);
      if (!stillPresent || !node || node.kind !== "group") break;
      parent.index = parent.candidates.findIndex(
        (candidate) =>
          candidate.kind === "group" && candidate.id === frame.groupId,
      );
      const candidates = buildCandidates(node, false, this.groupExit);
      if (candidates.length === 0) break;
      rebuilt.push({
        groupId: frame.groupId,
        candidates,
        index: 0,
        pass: frame.pass,
      });
    }

    this.frames = rebuilt;
    if (rootCandidates.length === 0) return [{ type: "root-empty" }];
    return this.repairHighlight(previousHighlight);
  }

  private get currentFrame(): ScopeFrame | undefined {
    return this.frames[this.frames.length - 1];
  }

  private get currentCandidate(): Candidate | undefined {
    const frame = this.currentFrame;
    return frame?.candidates[frame.index];
  }

  private labelFor(candidate: Candidate): string {
    if (candidate.kind === "exit") {
      const group = this.tree.byId.get(candidate.groupId);
      return group && group.kind === "group" ? exitLabelFor(group) : "Back";
    }
    return this.tree.byId.get(candidate.id)?.label ?? candidate.id;
  }

  private land(previous: Highlight): readonly SessionEffect[] {
    const candidate = this.currentCandidate;
    if (!candidate) return [];
    return [
      {
        type: "landed",
        previous,
        current: candidateToHighlight(candidate),
        label: this.labelFor(candidate),
      },
    ];
  }

  private exhaustScope(): readonly SessionEffect[] {
    return this.frames.length <= 1
      ? [{ type: "root-exhausted" }]
      : this.leaveGroup("loops-complete");
  }

  private enterGroup(groupId: string): readonly SessionEffect[] {
    const node = this.tree.byId.get(groupId);
    if (!node || node.kind !== "group") return [];
    const previous = this.currentHighlight;
    const candidates = buildCandidates(node, false, this.groupExit);
    if (candidates.length === 0) {
      return [
        {
          type: "group-exited",
          id: node.id,
          label: node.label,
          reason: "empty",
        },
        ...this.land(previous),
      ];
    }
    this.frames.push({ groupId, candidates, index: 0, pass: 1 });
    return [
      { type: "group-entered", id: node.id, label: node.label },
      ...this.land(previous),
    ];
  }

  private leaveGroup(
    reason: "selected-exit" | "back" | "loops-complete" | "empty",
  ): readonly SessionEffect[] {
    const frame = this.currentFrame;
    if (!frame || frame.groupId === null) return [];
    const node = this.tree.byId.get(frame.groupId);
    const previous = this.currentHighlight;
    this.frames.pop();
    const effects: SessionEffect[] = [];
    if (node && node.kind === "group") {
      effects.push({
        type: "group-exited",
        id: node.id,
        label: node.label,
        reason,
      });
    }
    effects.push(...this.land(previous));
    return effects;
  }

  private repairHighlight(previous: Highlight): readonly SessionEffect[] {
    const frame = this.currentFrame;
    if (!frame) return [{ type: "root-empty" }];
    if (previous) {
      const index = frame.candidates.findIndex((candidate) =>
        highlightEquals(candidateToHighlight(candidate), previous),
      );
      if (index !== -1) {
        if (index !== frame.index) {
          frame.index = index;
          return this.land(previous);
        }
        return [];
      }
    }
    if (frame.index >= frame.candidates.length) {
      frame.index = Math.max(0, frame.candidates.length - 1);
    }
    return this.land(previous);
  }
}

function isEligible(node: ScanNode): boolean {
  if (node.disabled === true) return false;
  if (node.kind === "target") return true;
  return node.children.some(isEligible);
}

function buildCandidates(
  group: ScanGroupNode,
  isRoot: boolean,
  groupExit: GroupExit,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const child of group.children) {
    if (!isEligible(child)) continue;
    candidates.push(
      child.kind === "target"
        ? { kind: "target", id: child.id }
        : { kind: "group", id: child.id },
    );
  }
  if (!isRoot && groupExit !== "back-only") {
    const exit: Candidate = { kind: "exit", groupId: group.id };
    if (groupExit === "before") candidates.unshift(exit);
    else candidates.push(exit);
  }
  return candidates;
}

function candidateToHighlight(candidate: Candidate): NonNullable<Highlight> {
  return candidate.kind === "exit"
    ? { kind: "exit", groupId: candidate.groupId }
    : { kind: candidate.kind, id: candidate.id };
}

export function highlightEquals(a: Highlight, b: Highlight): boolean {
  if (a === null || b === null) return a === b;
  switch (a.kind) {
    case "exit":
      return b.kind === "exit" && a.groupId === b.groupId;
    case "group":
      return b.kind === "group" && a.id === b.id;
    case "target":
      return b.kind === "target" && a.id === b.id;
  }
}

export function snapshotEquals(
  a: ScannerSnapshot,
  b: ScannerSnapshot,
): boolean {
  if (a.status !== b.status || a.pass !== b.pass) return false;
  if (a.path.length !== b.path.length) return false;
  for (let i = 0; i < a.path.length; i += 1) {
    if (a.path[i] !== b.path[i]) return false;
  }
  if (!highlightEquals(a.highlight, b.highlight)) return false;
  if (!positionEquals(a.position, b.position)) return false;
  return pendingEquals(a.pending, b.pending);
}

function positionEquals(
  a: ScannerSnapshot["position"],
  b: ScannerSnapshot["position"],
): boolean {
  if (a === null || b === null) return a === b;
  return a.index === b.index && a.count === b.count;
}

function pendingEquals(
  a: ScannerSnapshot["pending"],
  b: ScannerSnapshot["pending"],
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.kind === b.kind && a.startedAt === b.startedAt && a.dueAt === b.dueAt
  );
}
