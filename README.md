# Preference Consulting — VoiceOver sessions

Real macOS VoiceOver sessions (Guidepup + Playwright WebKit on GitHub Actions `macos-15`) against the published
preferenceconsulting.com as it is on the session date: the baseline (November 20, 2026, 12 pages) and the verification
runs after remediation. The transcript header line "Mode" states which (input `mode`).

- Read-only: only GET and HEAD requests reach the site; every other request (form submissions, analytics) is answered
  inside the test browser with 204. Page documents load at most one per second per runner, with a staggered start.
- Run: Actions → "VoiceOver transcripts" → Run workflow. If a runner runs out of time, lower `read_scale`.
- Each job uploads `transcripts/<page>/voiceover-transcript-webkit.txt` and a video of the session.
- `bash collect.sh <run-id>` downloads every artifact into `results/<page>/`.
