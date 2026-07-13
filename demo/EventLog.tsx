import { useEffect, useRef, useState } from "react";
import {
  useScannerEvents,
  useScannerSnapshot,
  type Scanner,
  type ScannerEvent,
} from "@shayc/switch-scanning";
import type { ScanStyleKind } from "./App.tsx";

interface LoggedEvent {
  id: number;
  type: ScannerEvent["type"];
  text: string;
}

const MAX_EVENTS = 50;
const WIDE_INSPECTOR_QUERY = "(min-width: 90rem)";

/**
 * The documented "events → feedback" pattern: a single listener drives both the
 * on-screen log and (optionally) speech. Feedback observes; it never commands.
 */
export function EventLog({
  scanner,
  speech,
  styleKind,
}: {
  scanner: Scanner;
  speech: boolean;
  styleKind: ScanStyleKind;
}) {
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [view, setView] = useState<"events" | "state">("events");
  const [wideInspector, setWideInspector] = useState(
    () => window.matchMedia(WIDE_INSPECTOR_QUERY).matches,
  );
  const [inspectorOpen, setInspectorOpen] = useState(wideInspector);
  const nextId = useRef(0);
  const generation = useRef(0);
  const promptPaused = useRef(false);
  const messageActive = useRef(false);
  const queuedPrompt = useRef<string | null>(null);

  const finishPrompt = (token: number): void => {
    if (generation.current !== token || !promptPaused.current) return;
    promptPaused.current = false;
    if (scanner.getSnapshot().status === "paused") scanner.resume();
  };

  const speakPrompt = (label: string): void => {
    const synth = window.speechSynthesis;
    const token = ++generation.current;
    synth.cancel();
    // Inverse scanning owns a phaseful held gesture. Pausing here would reset
    // that gesture and make its eventual release unable to select.
    if (
      styleKind !== "inverse" &&
      scanner.getSnapshot().status === "scanning"
    ) {
      scanner.pause();
      promptPaused.current = true;
    }
    const cue = new SpeechSynthesisUtterance(label);
    cue.voice = synth.getVoices()[0] ?? null;
    cue.onend = () => finishPrompt(token);
    cue.onerror = () => finishPrompt(token);
    synth.speak(cue);
  };

  const speakMessage = (label: string): void => {
    const synth = window.speechSynthesis;
    generation.current++;
    synth.cancel();
    messageActive.current = true;
    const cue = new SpeechSynthesisUtterance(label);
    cue.voice = synth.getVoices().at(-1) ?? null;
    const settle = () => {
      messageActive.current = false;
      const prompt = queuedPrompt.current;
      queuedPrompt.current = null;
      if (prompt) speakPrompt(prompt);
    };
    cue.onend = settle;
    cue.onerror = settle;
    synth.speak(cue);
  };

  useScannerEvents((event) => {
    const entry: LoggedEvent = {
      id: nextId.current++,
      type: event.type,
      text: describe(event),
    };
    // Newest-first, capped so the log cannot grow without bound.
    setEvents((prev) => [entry, ...prev].slice(0, MAX_EVENTS));
    if (!speech || typeof SpeechSynthesisUtterance === "undefined") return;
    if (event.type === "target.activated") {
      speakMessage(event.label);
    } else if (event.type === "highlight.changed") {
      if (event.current === null) {
        queuedPrompt.current = null;
        if (promptPaused.current) {
          generation.current++;
          window.speechSynthesis.cancel();
          promptPaused.current = false;
        }
      } else if (messageActive.current) {
        if (
          styleKind !== "inverse" &&
          scanner.getSnapshot().status === "scanning"
        ) {
          scanner.pause();
          promptPaused.current = true;
        }
        queuedPrompt.current = event.label;
      } else {
        speakPrompt(event.label);
      }
    }
  });

  useEffect(() => {
    if (speech) return;
    generation.current++;
    queuedPrompt.current = null;
    messageActive.current = false;
    window.speechSynthesis?.cancel();
    if (promptPaused.current) {
      promptPaused.current = false;
      if (scanner.getSnapshot().status === "paused") scanner.resume();
    }
  }, [scanner, speech]);

  useEffect(() => {
    const media = window.matchMedia(WIDE_INSPECTOR_QUERY);
    const updateLayout = (matches: boolean) => {
      setWideInspector(matches);
      setInspectorOpen(matches);
    };
    const handleChange = (event: MediaQueryListEvent) =>
      updateLayout(event.matches);

    updateLayout(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(
    () => () => {
      generation.current++;
      window.speechSynthesis?.cancel();
    },
    [],
  );

  return (
    <section
      className="panel diagnostics-panel"
      aria-label="Event inspector"
      data-scanner-controls=""
    >
      <details
        open={inspectorOpen}
        onToggle={(event) => {
          if (wideInspector && !event.currentTarget.open) {
            event.currentTarget.open = true;
            return;
          }
          setInspectorOpen(event.currentTarget.open);
        }}
      >
        <summary>
          <span className="console-summary">
            <strong>Inspect events</strong>
          </span>
          {events.length > 0 && (
            <span className="event-count">
              {events.length} {events.length === 1 ? "event" : "events"}
            </span>
          )}
        </summary>
        <div className="console-body">
          <div className="console-tabs" aria-label="Console view">
            <button
              type="button"
              aria-pressed={view === "events"}
              onClick={() => setView("events")}
            >
              Events
            </button>
            <button
              type="button"
              aria-pressed={view === "state"}
              onClick={() => setView("state")}
            >
              State
            </button>
            {view === "events" && events.length > 0 && (
              <button
                type="button"
                className="clear-events"
                onClick={() => setEvents([])}
              >
                Clear events
              </button>
            )}
          </div>

          {view === "events" ? (
            events.length === 0 ? (
              <div className="console-empty">
                <strong>No events yet</strong>
                <span>Start the preview or press a mapped switch.</span>
              </div>
            ) : (
              <ol className="event-list">
                {events.map((event) => (
                  <li key={event.id} data-event={event.type}>
                    <code>{event.type}</code>
                    <span>{event.text}</span>
                  </li>
                ))}
              </ol>
            )
          ) : (
            <StatusLine scanner={scanner} />
          )}
        </div>
      </details>
    </section>
  );
}

function StatusLine({ scanner }: { scanner: Scanner }) {
  const status = useScannerSnapshot(scanner, (snapshot) => snapshot.status);
  const loop = useScannerSnapshot(scanner, (snapshot) => snapshot.loop);
  const path = useScannerSnapshot(
    scanner,
    (snapshot) => snapshot.path.join(" › "),
    (a, b) => a === b,
  );
  const position = useScannerSnapshot(scanner, (snapshot) => snapshot.position);
  const pending = useScannerSnapshot(scanner, (snapshot) => snapshot.pending);

  return (
    <dl className="status">
      <div>
        <dt>Status</dt>
        <dd data-status={status}>{status}</dd>
      </div>
      <div>
        <dt>Position</dt>
        <dd>{position ? `${position.index + 1}/${position.count}` : "—"}</dd>
      </div>
      <div>
        <dt>Timer</dt>
        <dd>{pending?.kind ?? "none"}</dd>
      </div>
      <div>
        <dt>Scope</dt>
        <dd>{path === "" ? "root" : path}</dd>
      </div>
      <div>
        <dt>Pass index</dt>
        <dd>{loop}</dd>
      </div>
    </dl>
  );
}

function describe(event: ScannerEvent): string {
  switch (event.type) {
    case "scan.started":
      return "scanning started";
    case "scan.paused":
      return "paused";
    case "scan.resumed":
      return "resumed";
    case "scan.transitionStarted":
      return "selection transition started";
    case "scan.transitionEnded":
      return "selection transition ended";
    case "scan.completed":
      return `completed (${event.reason})`;
    case "scan.stopped":
      return `stopped (${event.reason})`;
    case "highlight.changed":
      return event.current === null ? "highlight cleared" : event.label;
    case "group.entered":
      return `entered ${event.label}`;
    case "group.exited":
      return `exited ${event.label} (${event.reason})`;
    case "target.activationRequested":
      return `requested ${event.label}`;
    case "target.activated":
      return `activated ${event.label}`;
    case "target.activationFailed":
      return `failed ${event.label} (${event.reason})`;
    case "diagnostic":
      return `${event.code}: ${event.message}`;
  }
}
