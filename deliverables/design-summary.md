# Design Summary

This document summarizes the overall design specified in [concept-design.md](concept-design.md) against the domain, bad situations, and ethical analysis in [problem-framing.md](problem-framing.md).

## How the Concepts Work Together to Solve the Problem

Our design addresses the three recurring failures in [problem-framing.md](problem-framing.md)—shy break-staying peers stalling over unfamiliar diets and budgets (BS1), weeknight hosts trapped by soft *"maybe"* replies and buried links (BS2), and advisor/GRA spreadsheets going stale when someone drops out (BS3)—through eight independent concepts coordinated by reactions:

1. **Pure Zoom-link distribution (`Hosting` + `Linking` + `Authenticating`):**
   Hosts authenticate via an external institutional SSO provider—either **MIT Touchstone** or **Commons login (TBD)**; for scoping purposes, email/OTP verification will not be implemented—and create a meal gathering in `Hosting` with a time window, RSVP cutoff, general area, and either a chosen restaurant (`confirmedVenue`) or no restaurant yet. Rather than building an in-app public feed or forcing peers off existing chats, `Linking` issues unguessable shareable link tokens (`token -> Gathering`) that are not bound to any recipient's identity—so a host drops one link into a dorm list, Slack, or group chat for multiple acquaintances to open (`viewByLink`), or issues separate labeled links per channel. Staying purely link-driven (deferring public boards/feeds for now) preserves host privacy, reduces flake and no-show risk since guests come from existing acquaintance channels rather than cold stranger browsing, and avoids the moderation overhead of a public discovery surface.

2. **Seamless acceptance before or after sign-in (`Inviting` + `Authenticating`):**
   Anyone opening a shared link can inspect the gathering details and live open spots without signing in. Authenticated peers accept directly (`Inviting.accept`); unauthenticated peers who click accept have an opaque login-intent key recorded in `Inviting.PendingAcceptances` (`deferAccept`) while signing in via Touchstone/Commons SSO, and automatically complete `Inviting.accept` as soon as `Authenticating.authenticate` returns (`acceptPendingInviteOnAuth`). Uninterested peers simply ignore the link—there is no `decline` action and no browser cookie blocking later mind-changes.

3. **Live capacity, automatic reopening, and deadline hygiene (`Reserving` + `Notifying` + `Hosting`):**
   Every `Inviting.accept` flows into `Reserving`—claiming an open spot if capacity remains (`reserve`) or appending to a FIFO waitlist (`joinWaitlist`). If a guest backs out before cutoff (`Inviting.withdraw`), reactions cancel their reservation, remove any pending cutoff reminder (`Notifying.cancelForRecipient`), clear their poll votes (`Polling.clearVoterVotes`), and immediately either reopen the spot on the exact same `Linking` URL or promote the next waitlisted peer (`promoteWaitlisted`) and notify them (`Notifying.notify`). At `Hosting.cutoffTime`, reactions lock `Reserving`, close unconfirmed tables (`expireUnconfirmed`), and finalize any open venue poll (`Polling.closePoll`).

4. **Two-option restaurant choice & qualitative preference visibility (`Profiling` + `Polling`):**
   Restaurant selection follows a simple two-option model:
   - **Host chooses the restaurant:** If the host already has a restaurant or dining hall in mind (`confirmedVenue` provided at creation), **no poll is created**—invitees simply accept and reserve a spot.
   - **Invitees vote:** If the host does not select a restaurant (`confirmedVenue` left unset), a `Polling` poll opens automatically so accepted invitees (and the host) can propose and approval-vote on restaurants, locking the winning choice onto `Hosting.confirmedVenue` at cutoff.
   In both cases, rather than negotiating diets and budgets in a noisy group chat or relying on algorithmic recommendations, `Profiling` lets users save their dietary restrictions, budget preference, walking preference, and cuisine notes once, and `viewTableProfiles` lets participants read each other's profiles qualitatively to inform their choices.

---

## How the Design Addresses Ethical Concerns

The table below traces each concern from the ethical analysis in [problem-framing.md](problem-framing.md#L118-L162) to the current design in [concept-design.md](concept-design.md):

| Ethical Analysis Concern | How the Design Addresses It |
|---|---|
| **1. Indirect stakeholders: home addresses** | **Scoped out in the current version.** Potlucks and private-home gatherings are intentionally excluded from `Hosting` for now—meals take place at restaurants or campus dining halls (`area` and `confirmedVenue`), so no residential street addresses are collected or exposed. If home potlucks are re-introduced later, `Hosting` can add a gated `privateAddress` field revealed only to the host and active `Reserving` holders via reaction. |
| **2. Values: community and dignity in who gets a place** | `Authenticating` stores only `email` and `domain` (no bios, photos, or social compatibility profiles), and `Hosting`/`Inviting`/`Reserving` allow any authenticated peer matching an optional domain `scope` to accept and reserve directly without manual host approval or guest ranking. `Profiling` holds only dining preferences and is withheld from unreserved link viewers. |
| **3. Time: non-use and the invitation link** | `Linking` lets hosts share a normal link inside existing chats and mailing lists; anyone can read public details without creating an account, and uninterested peers ignore the link with zero friction (`Inviting` has no `decline` or tracking cookie). `Notifying` has no broadcast mechanism and schedules reminders solely for hosts and active reservation holders, cancelling reminders immediately on withdrawal or table closure. |
| **4. Pervasiveness: what "bring something" means** | **Scoped out in the current version.** Because potlucks are excluded for now, `Hosting` carries no contribution fields (`NONE` / `OPTIONAL` / `EXPECTED`), avoiding pressure on budget-constrained students to cook or bring dishes. |
| **5. Values: community and safety at private homes** | Private home gatherings are deferred out of scope in this version (all meals are at public restaurants or dining halls). Because tables are shared exclusively via links in trusted chats (with no public board) and hosts can additionally set an institutional email `scope` (`Authenticating._hasDomain`), invitations stay within trusted communities. |
| **6. Time: reappropriation once a place means something else** | `Hosting` is scoped exclusively to informal shared meals (excluding potlucks, game nights, dates, and large parties), closes gatherings when `endTime` passes (`closeEnded`), and has no public feed, discovery board, or host follower lists. |
| **7. Direct stakeholders: fake, abandoned, and spam tables** | Only verified `Authenticating.Users` matching any specified `scope` can create gatherings (`createGatheringAuthorized`), `Hosting` caps each host at 3 `OPEN` or `CONFIRMED` gatherings, and unconfirmed tables close and lock at `cutoffTime` (`expireUnconfirmed`). Deferring public boards eliminates spam on a global feed, and hosts can revoke individual leaked `Linking` tokens. *(Per F2, an attendee report/moderation queue remains deferred for Beta.)* |

---

## Unclear and Open Issues

Several design tradeoffs remain open to resolve during implementation (Alpha/Beta) and user testing (F6):

1. **Tablemate profile visibility (named vs. anonymized):** `viewTableProfiles` restricts `Profiling._getProfiles` to the host and active reservation holders, but it is still open whether the UI should display names alongside those profiles (helpful for allergy follow-up) or omit names so shy peers like Noah do not feel singled out for dietary or budget limits.
2. **Discovery for newcomers without an active chat link:** Deferring public in-app boards/feeds strengthens privacy, reduces flaking from strangers, and lowers moderation overhead, but leaves open whether break-staying students who are not in an active dorm/club chat (BS1) will have enough link visibility or whether an opt-in community board should be added in a later iteration.
3. **Explicit host confirmation vs. accidental expiry:** Requiring `Hosting.confirm` before `cutoffTime` prevents abandoned tables, but could close a real dinner if a busy host misses the 1-hour `Notifying` reminder. We need to test whether explicit confirmation feels natural or if meeting a minimum headcount should confirm automatically.
4. **Late-stage edge cases (empty polls and post-cutoff drops):** If a poll-mode gathering reaches `cutoffTime` with zero proposed options, `Polling.closePoll` refuses; likewise, `Reserving` blocks self-cancellation once locked at cutoff. We still need clear host alerts for empty polls ahead of cutoff and a clean policy for post-cutoff emergency drops.
5. **Authentication provider choice, notification delivery, and pending-invite cleanup:** For scoping purposes, email/OTP verification will not be implemented; instead, `Authenticating` will use either **MIT Touchstone** or **Commons login (TBD)**, and we still need to finalize that choice and confirm how `pendingKey` is carried across the SSO redirect. Likewise, for Alpha, `Notifying` writes to an in-app inbox (`_listInbox`), which casual participants might miss; we need to decide when `deliver` should send emails using `Authenticating` email addresses, and how abandoned `Inviting.PendingAcceptances` entries expire.
6. **Re-introducing deferred scope:** Re-adding public community boards, home potlucks, game nights, private-address gating, and an attendee report queue will be evaluated only after the core Zoom-link meal flow is validated.
