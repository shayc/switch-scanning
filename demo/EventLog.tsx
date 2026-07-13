import { useEffect, useRef, useState } from "react";
import {
  useScannerEvents,
  type Scanner,
  type ScannerEvent,
} from "@shayc/switch-scanning";

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
export function EventLog({
  scanner,
  speech,
}: {
  scanner: Scanner;
  speech: boolean;
}) {
  const [events, setEvents] = useState<LoggedEvent[]>([]);
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
    if (scanner.getSnapshot().status === "scanning") {
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
        if (scanner.getSnapshot().status === "scanning") {
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

  useEffect(
    () => () => {
      generation.current++;
      window.speechSynthesis?.cancel();
    },
    [],
  );

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
