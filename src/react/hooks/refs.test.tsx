import { act, cleanup, render } from "@testing-library/react";
import { startTransition, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommittedRef, useRegistrationRef } from "./refs.ts";

afterEach(cleanup);

describe("ref composition", () => {
  it("honors React 19 forwarded-ref cleanup without returning it to React", () => {
    const detachRegistration = vi.fn();
    const detachForwarded = vi.fn();
    const forwarded = vi.fn(() => detachForwarded);

    function Registered({ show }: { show: boolean }) {
      const ref = useRegistrationRef(() => detachRegistration, forwarded);
      return show ? <div ref={ref}>Registered</div> : null;
    }

    const view = render(<Registered show />);
    expect(forwarded).toHaveBeenCalledWith(expect.any(HTMLElement));
    view.rerender(<Registered show={false} />);
    expect(detachRegistration).toHaveBeenCalledOnce();
    expect(detachForwarded).toHaveBeenCalledOnce();
    expect(forwarded).not.toHaveBeenCalledWith(null);
  });

  it("does not expose values from an abandoned concurrent render", () => {
    const never = new Promise<void>(() => undefined);
    let readCommitted = (): string => "missing";

    function Probe({ value, suspend }: { value: string; suspend: boolean }) {
      const committed = useCommittedRef(value);
      readCommitted = () => committed.current;
      // Suspense boundaries use thrown promises to represent pending work.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (suspend) throw never;
      return <output>{value}</output>;
    }

    const app = (value: string, suspend: boolean) => (
      <Suspense fallback={<output>Loading</output>}>
        <Probe value={value} suspend={suspend} />
      </Suspense>
    );

    const view = render(app("committed", false));
    expect(readCommitted()).toBe("committed");

    act(() => {
      startTransition(() => view.rerender(app("abandoned", true)));
    });
    expect(readCommitted()).toBe("committed");

    view.rerender(app("next", false));
    expect(readCommitted()).toBe("next");
  });
});
