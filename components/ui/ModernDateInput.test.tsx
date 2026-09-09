import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ModernDateInput from "@/components/ui/ModernDateInput";

describe("ModernDateInput", () => {
  it("renders deterministic markup without falling back to a native date picker", () => {
    const render = () => renderToString(<ModernDateInput value="2026-10-10" onChange={() => undefined} label="Datum" required />);
    const serverMarkup = render();
    expect(render()).toBe(serverMarkup);
    expect(serverMarkup).toContain("10.10.2026");
    expect(serverMarkup).toContain('aria-haspopup="dialog"');
    expect(serverMarkup).not.toContain('type="date"');
  });

  it("forwards a shared control class to the trigger", () => {
    const markup = renderToString(
      <ModernDateInput value="2026-10-10" onChange={() => undefined} controlClassName="shared-control" />,
    );

    expect(markup).toContain("shared-control");
  });
});
