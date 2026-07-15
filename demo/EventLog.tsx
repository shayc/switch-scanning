import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import {
  useScannerEvents,
  useScannerSnapshot,
  type Scanner,
  type ScannerEvent,
} from "@shayc/switch-scanning/react";
import { useRef, useState } from "react";
import classes from "./EventLog.module.css";

interface LoggedEvent {
  id: number;
  type: ScannerEvent["type"];
  text: string;
}

const MAX_EVENTS = 50;

/**
 * The documented "events → feedback" pattern: one listener observes scanner
 * events and renders an on-screen log. Feedback observes; it never commands.
 */
export function EventLog({ scanner }: { scanner: Scanner }) {
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [view, setView] = useState<"events" | "state">("events");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const nextId = useRef(0);

  useScannerEvents((event) => {
    const entry: LoggedEvent = {
      id: nextId.current++,
      type: event.type,
      text: describe(event),
    };
    // Newest-first, capped so the log cannot grow without bound.
    setEvents((prev) => [entry, ...prev].slice(0, MAX_EVENTS));
  });

  return (
    <Paper
      component="section"
      className={classes.diagnosticsPanel}
      withBorder
      radius="md"
      aria-label="Event inspector"
      data-scanner-controls=""
    >
      <details
        role="group"
        aria-label="Inspect events"
        open={inspectorOpen}
        onToggle={(event) => setInspectorOpen(event.currentTarget.open)}
      >
        <Group component="summary" justify="space-between" p="md" wrap="nowrap">
          <Text component="strong" size="sm">
            Inspect events
          </Text>
          {events.length > 0 && (
            <Badge variant="light" color="gray">
              {events.length} {events.length === 1 ? "event" : "events"}
            </Badge>
          )}
        </Group>
        <Box className={classes.consoleBody} p="md">
          <Tabs
            value={view}
            onChange={(value) => {
              if (value === "events" || value === "state") setView(value);
            }}
            variant="pills"
          >
            <Group justify="space-between" mb="sm" wrap="nowrap">
              <Tabs.List aria-label="Console view">
                <Tabs.Tab value="events">Events</Tabs.Tab>
                <Tabs.Tab value="state">State</Tabs.Tab>
              </Tabs.List>
              {view === "events" && events.length > 0 && (
                <Button
                  type="button"
                  variant="subtle"
                  color="gray"
                  size="compact-xs"
                  onClick={() => setEvents([])}
                >
                  Clear events
                </Button>
              )}
            </Group>

            <Tabs.Panel value="events">
              {events.length === 0 ? (
                <Center mih={112}>
                  <Stack gap={0} align="center">
                    <Text fw={600} size="sm">
                      No events yet
                    </Text>
                    <Text c="dimmed" size="sm" ta="center">
                      Start the preview or press a mapped switch.
                    </Text>
                  </Stack>
                </Center>
              ) : (
                <ol className={classes.eventList}>
                  {events.map((event) => (
                    <li key={event.id} data-event={event.type}>
                      <code>{event.type}</code>
                      <span>{event.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="state">
              <StatusLine scanner={scanner} />
            </Tabs.Panel>
          </Tabs>
        </Box>
      </details>
    </Paper>
  );
}

function StatusLine({ scanner }: { scanner: Scanner }) {
  const status = useScannerSnapshot(scanner, (snapshot) => snapshot.status);
  const pass = useScannerSnapshot(scanner, (snapshot) => snapshot.pass);
  const path = useScannerSnapshot(
    scanner,
    (snapshot) => snapshot.path.join(" › "),
    (a, b) => a === b,
  );
  const position = useScannerSnapshot(scanner, (snapshot) => snapshot.position);
  const pending = useScannerSnapshot(scanner, (snapshot) => snapshot.pending);

  return (
    <SimpleGrid
      component="dl"
      className={classes.status}
      cols={{ base: 2, sm: 5, xl: 1 }}
      spacing="sm"
      p="sm"
    >
      <Stack gap={0}>
        <Text component="dt" size="xs" c="dimmed" tt="uppercase" fw={700}>
          Status
        </Text>
        <Text
          component="dd"
          size="sm"
          fw={600}
          data-status={status}
          aria-label="Status"
        >
          {status}
        </Text>
      </Stack>
      <Stack gap={0}>
        <Text component="dt" size="xs" c="dimmed" tt="uppercase" fw={700}>
          Position
        </Text>
        <Text component="dd" size="sm" fw={600} aria-label="Position">
          {position ? `${position.index + 1}/${position.count}` : "—"}
        </Text>
      </Stack>
      <Stack gap={0}>
        <Text component="dt" size="xs" c="dimmed" tt="uppercase" fw={700}>
          Timer
        </Text>
        <Text component="dd" size="sm" fw={600} aria-label="Timer">
          {pending?.kind ?? "none"}
        </Text>
      </Stack>
      <Stack gap={0}>
        <Text component="dt" size="xs" c="dimmed" tt="uppercase" fw={700}>
          Scope
        </Text>
        <Text component="dd" size="sm" fw={600} aria-label="Scope">
          {path === "" ? "root" : path}
        </Text>
      </Stack>
      <Stack gap={0}>
        <Text component="dt" size="xs" c="dimmed" tt="uppercase" fw={700}>
          Pass index
        </Text>
        <Text component="dd" size="sm" fw={600} aria-label="Pass index">
          {pass}
        </Text>
      </Stack>
    </SimpleGrid>
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
    case "input.pressed":
      return `pressed ${event.switchId} (${event.recognition.kind})`;
    case "input.holdRecognized":
      return `hold recognized on ${event.switchId} (${event.action})`;
    case "input.released":
      return `released ${event.switchId} after ${Math.round(event.heldMs)}ms`;
    case "input.cancelled":
      return `cancelled ${event.switchId}`;
    case "diagnostic":
      return `${event.code}: ${event.message}`;
  }
}
