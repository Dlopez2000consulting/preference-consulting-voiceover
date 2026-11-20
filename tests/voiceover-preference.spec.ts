// Real macOS VoiceOver session, driven with Guidepup, against the published preferenceconsulting.com as it is on the session
// date (baseline of 20 November 2026, and the verification runs after remediation). One test per page.
// Each test writes transcripts/<slug>/voiceover-transcript-<browser>.txt (header + "### " sections + numbered phrases).
// Read-only: only GET/HEAD requests reach the site; every other request (forms, analytics) is answered locally with 204.
import { voiceOverTest as test } from "@guidepup/playwright";
import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { release } from "node:os";

const ORIGIN = "https://preferenceconsulting.com";
// read = upper bound of VO-Right Arrow steps; the read normally ends with "end of content" well before it.
const PAGES = [
  { slug: "home", path: "/", read: 250 },
  { slug: "about", path: "/about/", read: 150 },
  { slug: "realitysync", path: "/realitysync/", read: 250 },
  { slug: "halo-project", path: "/halo-project/", read: 250 },
  { slug: "it-solutions", path: "/it-solutions/", read: 250 },
  { slug: "contact", path: "/contact/", read: 150 },
  { slug: "virtual-lighthouse", path: "/virtual-lighthouse/", read: 200 },
  { slug: "preserving-florida", path: "/preserving-florida/", read: 250 },
  { slug: "ccfm", path: "/ccfm/", read: 250 },
  { slug: "bay-of-pigs", path: "/bay-of-pigs/", read: 300 },
  { slug: "cape-florida", path: "/cape-florida-lighthouse-illuminating-our-history/", read: 250 },
  { slug: "category", path: "/category/uncategorized/", read: 150 },
];
// VO_MODE: one line for the transcript header that says what state of the site was tested.
const MODE = process.env.VO_MODE || "real session on the published site as it was on the session date";
const wanted = (process.env.VO_PAGES ?? "all").split(",").map((s) => s.trim()).filter(Boolean);
const selected = wanted.includes("all") ? PAGES : PAGES.filter((p) => wanted.includes(p.slug));
const HEADING_STEPS = Number(process.env.VO_HEADING_STEPS ?? 20);
const LANDMARK_STEPS = Number(process.env.VO_LANDMARK_STEPS ?? 10);
const TAB_STEPS = Number(process.env.VO_TAB_STEPS ?? 25);
const READ_SCALE = Number(process.env.VO_READ_SCALE ?? 1);
const READ_BUDGET_MS = Number(process.env.VO_READ_BUDGET_MIN ?? 30) * 60 * 1000;

type Section = { title: string; phrases: string[]; end: string; notes?: string[] };
const num = (i: number) => String(i).padStart(3, " ");

test.describe("VoiceOver — preferenceconsulting.com", () => {
  for (const pg of selected) {
    test(`${pg.slug}: read-through, headings, landmarks, Tab order`, async ({ page, voiceOver, browserName }, testInfo) => {
      const t0 = Date.now();
      const left = () => testInfo.timeout - (Date.now() - t0);
      // Read-only: anything that is not GET/HEAD is answered locally with 204 (never reaches any server);
      // page documents from the site's own host load at most one per second.
      let last = 0;
      await page.route("**/*", async (route) => {
        if (!["GET", "HEAD"].includes(route.request().method())) return route.fulfill({ status: 204, body: "" });
        if (!/^https?:\/\/(www\.)?preferenceconsulting\.com\//.test(route.request().url()) || route.request().resourceType() !== "document") return route.continue();
        const wait = last + 1000 - Date.now(); last = Math.max(Date.now(), last + 1000);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return route.continue();
      });
      const url = `${ORIGIN}${pg.path}`;
      await page.goto(url, { waitUntil: "load" });
      await page.locator("body").waitFor();
      await page.waitForTimeout(4000);

      await voiceOver.navigateToWebContent();
      await voiceOver.clearSpokenPhraseLog();
      await voiceOver.clearItemTextLog();

      const sections: Section[] = [];
      const back = async () => { try { await voiceOver.navigateToWebContent(); } catch (e) { sections.push({ title: "(VoiceOver restarted)", phrases: [], end: String(e).slice(0, 100) }); try { await voiceOver.stop(); } catch {} await voiceOver.start(); await page.bringToFront().catch(() => {}); await voiceOver.navigateToWebContent(); } };
      const say = async () => (await voiceOver.lastSpokenPhrase()).replace(/\s+/g, " ").trim();
      const focusInfo = () => page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "none";
        const label = el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 40);
        return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}${label ? ` "${label.replace(/\s+/g, " ")}"` : ""}${el.closest("[role=dialog]") ? " (in dialog)" : ""}`;
      });

      // Stop when the same phrase repeats three times in a row (end of content) or when the first phrase comes back (wrap-around).
      const run = async (title: string, max: number, step: () => Promise<void>, wrap: boolean, budgetEnd = Infinity, reserve = 4 * 60 * 1000) => {
        const phrases: string[] = []; let end = `limit of ${max} steps`; let repeat = 0;
        for (let i = 1; i <= max; i++) {
          if (Date.now() > budgetEnd) { end = `time budget of ${Math.round(READ_BUDGET_MS / 60000)} min reached after ${phrases.length} phrases`; break; }
          if (left() < reserve) { end = `stopped to keep time for the remaining sections (${Math.round(left() / 60000)} min left)`; break; }
          try { await step(); } catch (e) { end = `error: ${String(e).slice(0, 120)}`; break; }
          const p = await say();
          if (/Quick Note dialog/.test(p)) { end = "interrupted: macOS Quick Note dialog opened (runner hot corner)"; phrases.push(p); break; }
          if (phrases.length && p === phrases[phrases.length - 1]) { if (++repeat >= 2) { end = "end of content (repeated phrase)"; break; } } else repeat = 0;
          if (wrap && phrases.length > 1 && p === phrases[0]) { end = "wrapped to the first item"; break; }
          phrases.push(p);
        }
        sections.push({ title, phrases, end });
        flush();
        return phrases;
      };

      const header = (total: number) => [
        `Screen reader: VoiceOver (macOS ${release()}, real session driven with Guidepup)`,
        `Page: ${url}`,
        `Rendered page: ${page.url()}`,
        `Browser: ${browserName} (Playwright project "${testInfo.project.name}")`,
        `Runner: GitHub Actions ${process.env.RUNNER_OS_LABEL ?? "local"}`,
        `Session date (UTC): ${new Date().toISOString()}`,
        `Mode: ${MODE}`,
        `Read-through: up to ${Math.round(pg.read * READ_SCALE)} steps (read_scale ${READ_SCALE}), time budget ${Math.round(READ_BUDGET_MS / 60000)} min`,
        `Phrases captured: ${total}`,
        ``,
        `Each line is one phrase exactly as VoiceOver spoke it.`,
        `────────────────────────────────────────────────────────`,
        ``,
      ];
      const outDir = join(process.cwd(), "transcripts", pg.slug);
      mkdirSync(outDir, { recursive: true });
      const file = join(outDir, `voiceover-transcript-${browserName}.txt`);
      // Written after every section, so a runner that dies or a timeout still leaves the sections already captured.
      function flush(spoken?: string[]) {
        const total = sections.reduce((a, s) => a + s.phrases.length, 0);
        const lines = header(total);
        for (const s of sections) {
          lines.push(`### ${s.title} (${s.phrases.length} phrases, end: ${s.end})`);
          s.phrases.forEach((p, i) => lines.push(`${num(i + 1)}  ${p}`));
          (s.notes ?? []).forEach((n) => lines.push(`     note: ${n}`));
          lines.push("");
        }
        if (spoken) {
          lines.push(`### Full VoiceOver log (spokenPhraseLog, ${spoken.length} entries)`);
          spoken.forEach((p, i) => lines.push(`${num(i + 1)}  ${p.replace(/\s+/g, " ").trim()}`));
        } else lines.push(`### (session still running or interrupted: full VoiceOver log not written yet)`);
        writeFileSync(file, lines.join("\n") + "\n", "utf8");
      }

      const vo: any = voiceOver;
      await run("Read-through from the top (VO-Right Arrow)", Math.round(pg.read * READ_SCALE), () => voiceOver.next({ capture: true }), false, t0 + READ_BUDGET_MS, 12 * 60 * 1000);

      await back();
      await run("Heading navigation (VO-Cmd-H)", HEADING_STEPS, () => voiceOver.nextHeading({ capture: true }), true);

      await back();
      const landmarkCmd = vo.keyboardCommands?.findNextLandmark ?? vo.keyboardCommands?.findNextLandmarkOrItem;
      if (typeof vo.nextLandmark === "function") await run("Landmark navigation (VO-Cmd-L)", LANDMARK_STEPS, () => vo.nextLandmark({ capture: true }), true);
      else if (landmarkCmd) await run("Landmark navigation (VO-Cmd-L)", LANDMARK_STEPS, () => voiceOver.perform(landmarkCmd, { capture: true }), true);
      else sections.push({ title: "Landmark navigation (VO-Cmd-L)", phrases: [], end: "command not available in this Guidepup version" });

      await back();
      const tabNotes: string[] = [];
      await run("Tab order (Tab key)", TAB_STEPS, async () => { await voiceOver.press("Tab"); tabNotes.push(`Tab ${tabNotes.length + 1}: focus ${await focusInfo()}`); }, false, Infinity, 2 * 60 * 1000);
      sections[sections.length - 1].notes = tabNotes;
      flush();


      const spoken: string[] = await voiceOver.spokenPhraseLog().catch(() => [] as string[]);
      const total = sections.reduce((a, s) => a + s.phrases.length, 0);
      flush(spoken);
      await testInfo.attach(`voiceover-${pg.slug}-${browserName}`, { path: file, contentType: "text/plain" });
      expect(total).toBeGreaterThan(10);
    });
  }
});
