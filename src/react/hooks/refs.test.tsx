import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRef, useRegistrationRef } from "./refs.ts";

afterEach(cleanup);

describe("ref composition", () => {
  it("applies function, object, and absent refs", () => {
    const callback = vi.fn();
    const object = createRef<HTMLElement>();
    const element = document.createElement("div");
    applyRef(callback, element);
    applyRef(object, element);
    applyRef(undefined, element);
    expect(callback).toHaveBeenCalledWith(element);
    expect(object.current).toBe(element);
  });

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
});
