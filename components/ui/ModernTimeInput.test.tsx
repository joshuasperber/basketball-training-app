import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ModernTimeInput from "@/components/ui/ModernTimeInput";

describe("ModernTimeInput", () => {
  it("renders a labelled, reusable time control", () => {
    const markup = renderToString(
      <ModernTimeInput value="18:30" onChange={() => undefined} label="Spielzeit" required controlClassName="shared-control" />,
    );

    expect(markup).toContain('type="time"');
    expect(markup).toContain('value="18:30"');
    expect(markup).toContain("Spielzeit");
    expect(markup).toContain("required");
    expect(markup).toContain("shared-control");
  });
});
