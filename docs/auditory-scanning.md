# Auditory scanning recipe

Speech is host-owned. The scanner supplies complete highlight and activation
events; the target's existing action remains the public message path.

The prompt controller below can pause movement while a cue plays, cancels stale
cues when presentation changes, and resumes after completion or speech errors.
Resuming does not emit another highlight landing, so it cannot create a replay
loop.

An armed single-step dwell survives this pause with its remaining time frozen,
so the documented recipe works with "Step and wait". Pass
`pauseWhileSpeaking: false` whenever the active interaction depends on a held
or eventual-release gesture. Inverse scanning is the built-in example: pausing
deliberately forgets held gestures, so the eventual release cannot select.
Without the pause, choose an interval long enough for the prompt; a new landing
cancels any stale cue.

```tsx
function useAuditoryPrompts(
  scanner: Scanner,
  enabled: boolean,
  { pauseWhileSpeaking = true } = {},
) {
  const generation = useRef(0);
  const pausedForPrompt = useRef(false);

  useScannerEvents(scanner, (event) => {
    if (event.type !== "highlight.changed") return;
    const token = ++generation.current;
    speechSynthesis.cancel();

    if (!enabled || event.current === null) return;
    if (pauseWhileSpeaking && scanner.getSnapshot().status === "scanning") {
      scanner.pause();
      pausedForPrompt.current = true;
    }
    const cue = new SpeechSynthesisUtterance(event.label);
    cue.voice = choosePromptVoice();

    const settle = () => {
      if (generation.current !== token) return;
      if (
        pausedForPrompt.current &&
        scanner.getSnapshot().status === "paused"
      ) {
        pausedForPrompt.current = false;
        scanner.resume();
      }
    };
    cue.onend = settle;
    cue.onerror = settle;
    speechSynthesis.speak(cue);
  });

  useEffect(
    () => () => {
      generation.current++;
      speechSynthesis.cancel();
      if (
        pausedForPrompt.current &&
        scanner.getSnapshot().status === "paused"
      ) {
        scanner.resume();
      }
    },
    [scanner],
  );
}
```

Keep final speech in the control's normal action path and use a distinct
message voice:

```tsx
<button {...scanTarget.props} onClick={() => speakMessage(phrase.text)}>
  {phrase.text}
</button>
```

This makes pointer, keyboard, screen-reader, and scanner activation produce
the same public output. For private prompt routing or two physical audio
outputs, choose/reroute the prompt voice in host code; the library deliberately
does not own browser speech policy.
