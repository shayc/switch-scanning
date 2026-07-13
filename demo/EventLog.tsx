import { useRef, useState } from "react";
import { useScannerEvents, type ScannerEvent } from "@shayc/switch-scanning";

interface LoggedEvent {
  id: number;
  type: ScannerEvent["type"];
  text: string;
}

const MAX_EVENTS = 50;

/**
 * The documented "events → feedback" pattern: a single listener drives both the
 * on-screen log and (optionally) speech. Feedback observes; it never commands.
 */
export function EventLog({ speech }: { speech: boolean }) {
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const nextId = useRef(0);

  useScannerEvents((event) => {
    const entry: LoggedEvent = {
      id: nextId.current++,
      type: event.type,
      text: describe(event),
    };
    // Newest-first, capped so the log cannot grow without bound.
    setEvents((prev) => [entry, ...prev].slice(0, MAX_EVENTS));
    if (speech) speakFor(event);
  });

  return (
    <section className="panel log-panel" aria-label="Event log">
      <h2>Event log</h2>
      {events.length === 0 ? (
        <p className="hint">Start scanning to see events stream in.</p>
      ) : (
        <ol className="event-list">
          {events.map((event) => (
            <li key={event.id} data-event={event.type}>
              <code>{event.type}</code>
              <span>{event.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
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
    case "scan.completed":
      return `completed (${event.reason})`;
    case "scan.stopped":
      return `stopped (${event.reason})`;
    case "highlight.changed":
      return event.label;
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

/** Speak highlight moves and activations when the speech toggle is on. */
function speakFor(event: ScannerEvent): void {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;

  let text: string | null = null;
  if (event.type === "highlight.changed") text = event.label;
  else if (event.type === "target.activated") text = event.label;
  if (text === null) return;

  synth.cancel();
  synth.speak(new SpeechSynthesisUtterance(text));
}
