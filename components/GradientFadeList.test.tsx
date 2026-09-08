import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GradientFadeList from "@/components/GradientFadeList";

describe("GradientFadeList hydration markup", () => {
  it("renders deterministic initial markup without a generated React id", () => {
    const render = () =>
      renderToString(
        <GradientFadeList
          items={["Handles", "Shooting", "Defense"]}
          previewCount={2}
          getKey={(item) => item}
          renderItem={(item) => <span>{item}</span>}
        />,
      );

    const serverMarkup = render();
    const clientInitialMarkup = render();

    expect(clientInitialMarkup).toBe(serverMarkup);
    expect(serverMarkup).not.toContain('id="_R_');
    expect(serverMarkup).not.toContain("aria-controls");
  });

  it("renders all badge candidates before client-side row measurement", () => {
    const markup = renderToString(
      <GradientFadeList
        items={["A", "B", "C", "D"]}
        previewRows={1}
        getKey={(item) => item}
        renderItem={(item) => <span>{item}</span>}
      />,
    );

    expect(markup).toContain(">A<");
    expect(markup).toContain(">D<");
    expect(markup).not.toContain("Mehr anzeigen");
  });
});
