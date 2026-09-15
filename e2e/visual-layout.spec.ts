import { expect, test } from "@playwright/test";

const TRAINING_HEADER_FIXTURE = `
  <main class="app-container">
    <div class="training-top">
      <div class="training-top__left">
        <div class="training-top__intro">
          <h1 class="page-title">Training</h1>
          <p class="page-subtitle">Workouts und Übungen verwalten, filtern und starten.</p>
        </div>
        <div class="training-top__primary-tabs">
          <div class="top-tabs-wrap"><div class="top-tabs top-tabs--training">
            <a class="top-tabs__btn">Woche</a><a class="top-tabs__btn top-tabs__btn--active">Katalog</a>
          </div></div>
        </div>
        <div class="training-top__catalog-tabs">
          <div class="segmented-wrap"><div class="segmented segmented--brand">
            <button class="segmented__btn segmented__btn--active">Workouts</button><button class="segmented__btn">Übungen</button>
          </div></div>
        </div>
      </div>
      <div class="training-top__right">
        <div class="training-top__tools"><button class="icon-btn">⌕</button><button class="icon-btn icon-btn--primary">+</button></div>
        <div class="training-top__game-actions">
          <div><button class="btn btn-outline btn-xs btn-block">Spieltag starten</button></div>
          <div><button class="btn btn-outline btn-xs btn-block">Spieltraining starten</button></div>
        </div>
      </div>
    </div>
  </main>`;

const TEAM_VIDEO_FIXTURE = `
  <main class="app-container">
    <section class="app-card team-video-hero">
      <div class="team-workflow-header"><div><p class="section-eyebrow">Playbook</p><h2 class="section-title">Offense &amp; Defense als Video</h2></div><span class="team-video-role-pill">Teammitglied</span></div>
      <div class="team-video-upload mt-5">
        <div class="team-video-upload__fields"><label><span class="input-label">Titel *</span><input class="input app-unified-control mt-1" value="Horns gegen Switch"></label><fieldset class="team-video-category"><legend class="input-label">Bereich</legend><div class="segmented segmented--brand mt-1"><button class="segmented__btn segmented__btn--active">Offense</button><button class="segmented__btn">Defense</button></div></fieldset></div>
        <label><span class="input-label">Coaching-Hinweis</span><textarea class="textarea mt-1" rows="3"></textarea></label>
        <div class="team-video-file-row"><label class="team-video-file-picker"><span class="team-video-file-picker__icon">＋</span><span><strong>team-play.mp4</strong><small>24,5 MB</small></span></label><button class="btn btn-primary team-video-upload__button">Für das Team hochladen</button></div>
      </div>
    </section>
    <section class="mt-4 app-card"><div class="team-video-library-header"><div><p class="section-eyebrow">Videothek</p><h2 class="section-title">Plays für dein Team</h2></div><div class="segmented"><button class="segmented__btn segmented__btn--active">Alle</button><button class="segmented__btn">Offense</button><button class="segmented__btn">Defense</button></div></div></section>
  </main>`;

test("training header controls stay separated and aligned at every relevant width", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bt.consent.ui-decided.v1", "1"));
  await page.goto("/login");
  await expect(page.locator('main[data-client-ready="true"]')).toBeVisible();

  for (const width of [320, 390, 768, 1024, 1864]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((markup) => { document.body.innerHTML = markup; }, TRAINING_HEADER_FIXTURE);
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
      };
      const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => !(
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
      );
      const firstTabs = rect(".top-tabs");
      const secondTabs = rect(".segmented");
      const header = rect(".training-top");
      const gameActions = rect(".training-top__game-actions");
      const tools = rect(".training-top__tools");
      const gameButtons = [...document.querySelectorAll<HTMLElement>(".training-top__game-actions .btn")]
        .map((button) => button.getBoundingClientRect().height);
      return {
        firstBottom: firstTabs.bottom,
        secondTop: secondTabs.top,
        secondBottom: secondTabs.bottom,
        headerHeight: header.bottom - header.top,
        headerBottom: header.bottom,
        actionsTop: gameActions.top,
        actionsBottom: gameActions.bottom,
        toolsBottom: tools.bottom,
        tabsOverlap: overlaps(firstTabs, secondTabs),
        gameFirstTabsOverlap: overlaps(gameActions, firstTabs),
        gameSecondTabsOverlap: overlaps(gameActions, secondTabs),
        toolsGameOverlap: overlaps(tools, gameActions),
        gameButtons,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(layout.tabsOverlap, `Umschalter überlagern sich bei ${width}px`).toBe(false);
    expect(layout.gameFirstTabsOverlap, `Spielaktionen überlagern Katalog-Tabs bei ${width}px`).toBe(false);
    expect(layout.gameSecondTabsOverlap, `Spielaktionen überlagern die Untertabs bei ${width}px`).toBe(false);
    expect(layout.toolsGameOverlap, `Suche/+ überlagern die Spielaktionen bei ${width}px`).toBe(false);
    expect(layout.overflow, `Horizontaler Überlauf bei ${width}px`).toBeLessThanOrEqual(1);
    expect(Math.max(...layout.gameButtons) - Math.min(...layout.gameButtons), `Ungleiche Spiel-Buttons bei ${width}px`).toBeLessThanOrEqual(1);
    expect(layout.actionsTop, `Spielaktionen stehen vor Suche/+ bei ${width}px`).toBeGreaterThanOrEqual(layout.toolsBottom);
    if (width >= 900) {
      expect(layout.headerHeight, `Desktop-Kopfbereich ist bei ${width}px zu hoch`).toBeLessThanOrEqual(220);
      expect(Math.abs(layout.actionsBottom - layout.headerBottom), `Spielaktionen schließen bei ${width}px nicht sauber ab`).toBeLessThanOrEqual(8);
      expect(layout.actionsBottom - layout.secondBottom, `Unsaubere Grundlinie bei ${width}px`).toBeGreaterThanOrEqual(0);
      expect(layout.actionsBottom - layout.secondBottom, `Unsaubere Grundlinie bei ${width}px`).toBeLessThanOrEqual(40);
    } else {
      expect(layout.actionsTop, `Spielaktionen überlagern die Untertabs bei ${width}px`).toBeGreaterThanOrEqual(layout.secondBottom);
    }
  }
});

test("public application pages do not overflow horizontally", async ({ page }) => {
  for (const path of ["/login", "/datenschutz", "/impressum", "/nutzungsbedingungen"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `Horizontaler Überlauf auf ${path}`).toBeLessThanOrEqual(1);
  }
});

test("team video library remains usable on desktop and mobile", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("bt.consent.ui-decided.v1", "1"));
  await page.goto("/login");
  await expect(page.locator('main[data-client-ready="true"]')).toBeVisible();

  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((markup) => { document.body.innerHTML = markup; }, TEAM_VIDEO_FIXTURE);
    const layout = await page.evaluate(() => {
      const uploadButton = document.querySelector<HTMLElement>(".team-video-upload__button")!.getBoundingClientRect();
      const picker = document.querySelector<HTMLElement>(".team-video-file-picker")!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        buttonHeight: uploadButton.height,
        pickerHeight: picker.height,
      };
    });
    expect(layout.overflow, `Videothek läuft bei ${width}px horizontal über`).toBeLessThanOrEqual(1);
    expect(layout.buttonHeight, `Upload-Button ist bei ${width}px zu klein`).toBeGreaterThanOrEqual(40);
    expect(layout.pickerHeight, `Dateiauswahl ist bei ${width}px zu klein`).toBeGreaterThanOrEqual(48);
  }
});
