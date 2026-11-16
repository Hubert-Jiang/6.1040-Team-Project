# Design Summary
This document summarizes the overall design specified in the [Concept Design](concept-design.md) against the domain, bad situations, and ethical analysis in [Problem Framing](problem-framing.md).

## How the Concepts Work Together to Solve the Problem
Through eight independent concepts, our design addresses the three recurring failures in [Problem Framing](problem-framing.md): shy peers stalling over unmfailliar diets and budgets (BS1), soft *"maybe"* replies and lost invites (BS2), and stale spreadsheets (BS3).

1. **Zoom-link distribution with optional community board discovery (`Hosting` + `Linking` + `Authenticating`):**
   Hosts verify an institutional email once via passwordless codes (`Authenticating`) and create a meal gathering in `Hosting` with a time window, RSVP cutoff, general area, and optional venue. Rather than forcing peers off existing chats or mailing lists, `Linking` issues unguessable shareable link tokens (`token -> Gathering`) that are not bound to any recipient's identity—so a host can drop one link into a dorm list, Slack, or group chat for multiple acquaintances to open (`viewByLink`), or issue separate labeled links per channel. Hosts can also opt into listing a gathering on their verified domain's board (`listedOnBoard` + `scope`).

2. **Seamless acceptance before or after sign-in (`Inviting` + `Authenticating`):**
   Anyone opening a shared link can inspect the gathering details and live open spots without an account. Authenticated peers accept directly (`Inviting.accept`); unauthenticated peers who enter their email to accept have their intent recorded in `Inviting.PendingAcceptances` (`deferAccept`) while `Authenticating` sends a verification code, and automatically complete `Inviting.accept` as soon as verification succeeds (`acceptPendingInviteOnVerify`). Uninterested peers simply ignore the link—there is no `decline` action and no browser cookie blocking later mind-changes.

3. **Live capacity, automatic reopening, and deadline hygiene (`Reserving` + `Notifying` + `Hosting`):**
   Every `Inviting.accept` flows into `Reserving`—claiming an open spot if capacity remains (`reserve`) or appending to a FIFO waitlist (`joinWaitlist`). If a guest backs out before cutoff (`Inviting.withdraw`), reactions cancel their reservation, remove any pending cutoff reminder (`Notifying.cancelForRecipient`), clear their poll votes (`Polling.clearVoterVotes`), and immediately either reopen the spot on the exact same `Linking` URL or promote the next waitlisted peer (`promoteWaitlisted`) and notify them (`Notifying.notify`). At `Hosting.cutoffTime`, reactions lock `Reserving`, close unconfirmed tables (`expireUnconfirmed`), and finalize any open venue poll (`Polling.closePoll`).

4. **Qualitative preference visibility and low-friction venue convergence (`Profiling` + `Polling`):**
   Instead of negotiating diets and budgets in a noisy group chat or relying on algorithmic restaurant recommendations, `Profiling` lets users save their dietary restrictions, budget preference, walking preference, and cuisine notes once. Only the host and active reservation holders can view tablemates' profiles (`viewTableProfiles`) to make a qualitative group judgment when proposing and approval-voting on options in `Polling`, locking the winning venue onto `Hosting.confirmedVenue` at cutoff.

---

## How the Design Addresses Ethical Concerns

The table below traces each concern from the ethical analysis in [problem-framing.md](problem-framing.md#L118-L162) to the current design in [concept-design.md](concept-design.md):

| Ethical Analysis Concern | How the Design Addresses It |
|---|---|
| **1. Indirect stakeholders: home addresses** | **Scoped out in the current version.** Potlucks and private-home gatherings are intentionally excluded from `Hosting` for now—meals take place at restaurants or campus dining halls (`area` and `confirmedVenue`), so no residential street addresses are collected or exposed. If home potlucks are re-introduced later, `Hosting` can add a gated `privateAddress` field revealed only to the host and active `Reserving` holders via reaction. |
| **2. Values: community and dignity in who gets a place** | `Authenticating` stores only `email` and `domain` (no bios, photos, or social compatibility profiles), and `Hosting`/`Inviting`/`Reserving` allow any authenticated peer matching an optional domain `scope` to accept and reserve directly without manual host approval or guest ranking. `Profiling` holds only dining preferences and is withheld from public links and boards. |
| **3. Time: non-use and the invitation link** | `Linking` lets hosts share a normal link inside existing chats and mailing lists; anyone can read public details without creating an account, and uninterested peers ignore the link with zero friction (`Inviting` has no `decline` or tracking cookie). `Notifying` has no broadcast mechanism and schedules reminders solely for hosts and active reservation holders, cancelling reminders immediately on withdrawal or table closure. |
| **4. Pervasiveness: what "bring something" means** | **Scoped out in the current version.** Because potlucks are excluded for now, `Hosting` carries no contribution fields (`NONE` / `OPTIONAL` / `EXPECTED`), avoiding pressure on budget-constrained students to cook or bring dishes. |
| **5. Values: community and safety at private homes** | Private home gatherings are deferred out of scope in this version (all meals are at public restaurants or dining halls). For community trust, hosts can still restrict a gathering's `scope` to a verified institutional email domain (`Authenticating._hasDomain`) so forwarded links remain gated to verified peers. |
| **6. Time: reappropriation once a place means something else** | `Hosting` is scoped exclusively to informal shared meals (excluding potlucks, game nights, dates, and large parties), closes gatherings when `endTime` passes (`closeEnded`), and maintains no host follower lists or social feeds. |
| **7. Direct stakeholders: fake, abandoned, and spam tables** | Only verified `Authenticating.Users` matching any specified `scope` can create gatherings (`createGatheringAuthorized`), `Hosting` caps each host at 3 `OPEN` or `CONFIRMED` gatherings, and unconfirmed tables close and lock at `cutoffTime` (`expireUnconfirmed`). Hosts can also revoke individual leaked `Linking` tokens. *(Per F2, an attendee report/moderation queue remains deferred for Beta.)* |

---

## Unclear and Open Issues

Several design tradeoffs remain open to resolve during implementation (Alpha/Beta) and user testing (F6):

1. **Tablemate profile visibility (named vs. anonymized):** `viewTableProfiles` restricts `Profiling._getProfiles` to the host and active reservation holders, but it is still open whether the UI should display names alongside those profiles (helpful for allergy follow-up) or omit names so shy peers like Noah do not feel singled out for dietary or budget limits.
2. **Sub-community scoping below the email-domain level:** Currently `Hosting.scope` checks `Authenticating.domain` (e.g., `mit.edu`), relying on `Linking` URLs dropped into private dorm/club chats for narrower groups. Whether narrower board listings require an `Authorizing` concept or invite-code rosters remains to be tested.
3. **Explicit host confirmation vs. accidental expiry:** Requiring `Hosting.confirm` before `cutoffTime` prevents abandoned tables, but could close a real dinner if a busy host misses the 1-hour `Notifying` reminder. We need to test whether explicit confirmation feels natural or if meeting a minimum headcount should confirm automatically.
4. **Late-stage edge cases (empty polls and post-cutoff drops):** If a poll-mode gathering reaches `cutoffTime` with zero proposed options, `Polling.closePoll` refuses; likewise, `Reserving` blocks self-cancellation once locked at cutoff. We still need clear host alerts for empty polls ahead of cutoff and a clean policy for post-cutoff emergency drops.
5. **Notification delivery channel and pending-invite expiry:** For Alpha, `Notifying` writes to an in-app inbox (`_listInbox`), which casual participants might miss if they do not revisit the app; we need to decide when `deliver` should send transactional emails via `Authenticating` email addresses, and whether unverified `Inviting.PendingAcceptances` should expire automatically.
6. **Re-introducing deferred scope:** Re-adding home potlucks, game nights, private-address gating, and an attendee report queue will be evaluated only after the core meal-gathering loop is validated.
