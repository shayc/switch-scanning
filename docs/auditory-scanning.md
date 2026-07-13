# Auditory scanning recipe

Speech is host-owned. The scanner supplies complete highlight and activation
events; the target's existing action remains the public message path.

The prompt controller below pauses automatic movement while a cue plays,
cancels stale cues when presentation changes, and resumes after completion or
speech errors. Resuming does not emit another highlight landing, so it cannot
create a replay loop.

```tsx
function useAuditoryPrompts(scanner: Scanner, enabled: boolean) {
  const generation = useRef(0);

  useScannerEvents(scanner, (event) => {
    if (event.type !== "highlight.changed") return;
    const token = ++generation.current;
    speechSynthesis.cancel();

    if (!enabled || event.current === null) return;
    scanner.pause();
    const cue = new SpeechSynthesisUtterance(event.label);
    cue.voice = choosePromptVoice();

    const settle = () => {
      if (generation.current !== token) return;
      if (scanner.getSnapshot().status === "paused") scanner.resume();
    };
    cue.onend = settle;
    cue.onerror = settle;
    speechSynthesis.speak(cue);
  });

  useEffect(
    () => () => {
      generation.current++;
      speechSynthesis.cancel();
    },
    [],
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
