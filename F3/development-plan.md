# Development plan

[← Back to README](../README.md)
This plan covers what we expect to deliver at each checkpoint, who owns each piece, the main risks and how we will reduce them, and what we cut if something turns out to be unimplementable. The below responsibilities are tentative, as adjustments to the concept design or implementations may have to be made to implement the concept reactions. But overall, splitting the work by concept will be effective and minimize merge conflicts, as each one is independent and can be built and tested on its own.

## Delivery by stage

| Stage | Due | What we expect to have |
|---|---|---|
| F3 Concept design | Mon, Nov 16 | Revised problem framing, concept design, user journey, visual design study, design summary, and this plan |
| F4 Alpha | Mon, Nov 23 | A first running app that satisfies the specified user journey for the MVP. This should include creating a table, invitation links, and pre-auth acceptance + login reactions. |
| F5 Beta | Mon, Nov 30 | A nearly complete app. In-app notifications, waitlists, and restaurant polling (when no venue is pre-selected) should be implemented. The visual style from the design study is applied, and the app is deployed |
| F6 User testing | Mon, Dec 7 | Results from sessions where participants act out the Noah and Alice situations on the real app, plus the fixes we make in response |
| F7 Demo and report | Wed, Dec 9 | Final demo, project report, and cleanup of the repo and README |

Thanksgiving falls on Nov 26, between the Alpha and Beta deadlines, and we will be away or busy. To protect the Beta, we aim to finish the Alpha by Sat, Nov 21, so that the break week is spent on the waitlist, polling polish, and styling, not on getting the basics to run. The only work that depends on everyone being present is the Beta integration, which we schedule for Sat, Nov 28 and Sun, Nov 29.

## Responsibilities
| Member | Primary ownership | Also responsible for |
|---|---|---|
| Hubert | Authenticating, Polling, and Notifying | Note-taking during meetings. Ensuring sessions are secure and that authentication is properly integrated with the rest of the app. |
| Elijah | Reserving and Hosting | Ensuring locking interactions for reserving; i.e. users reserving a seat hold a lock while the reaction completes |
| Diego | Profiling, Inviting, and Linking | |

Everyone implements the syncs and reactions that touch their own concepts. Each task can be committed and merged as necessary. Teammates will communicate with each other to reduce the prevalence of merge conflicts. Each teammate will review the others' pushes regularly to ensure quality and clear up any confusion. Text updates will be sent to the group chat when pushes are completed.

## Key risks and mitigations
| Risk | Why it matters | Mitigation |
|---|---|---|
| External authentication integration (MIT Touchstone vs. Commons login) takes time to configure | Membership is the basis for who can host or accept a seat. For scoping purposes, email/OTP verification will not be implemented; instead, we will use either MIT Touchstone or Commons login (TBD). | Start with whichever of MIT Touchstone or Commons login integrates fastest with our deployment environment, keeping `Authenticating.authenticate` decoupled behind the SSO callback so switching or widening domains later requires minimal changes. |
| Restaurant data or booking via an outside service (such as OpenTable API) may be unavailable, incomplete, or gated | Users need locations to vote on when the host leaves the venue unselected, and may want to book a table on OpenTable once headcount locks. | Verify that the OpenTable API works and request access early (ASAP) if necessary before relying on it. Allow invitees (including the host) to manually enter candidates by hand with notes (e.g., price or dietary info), treat any outside lookup as optional, and fall back to linking/redirecting to restaurant or OpenTable pages so hosts can manually place the actual reservations. |
| Waitlist promotion and seat counts can go wrong under simultaneous claims | Two people claiming the last seat would break the exact headcount, which is the main promise of the app | Make `reserve` and `cancel` atomic single operations in `Reserving` and test them with concurrent requests early, during the Alpha |
| Moderation (reports and review) takes more effort than we have | It responds to a real ethics concern, but it does not appear in the operational principle of any concept | Build host confirmation and the per-host limit first, since they are cheap, and add the report queue only if time remains |
| With two of us, each person carries half of the work | The concepts each have a single owner, so a slow week for one person stalls a whole path | Keep pull requests small so work can be picked up by someone else, and decide at the Nov 21 check-in if the feature scope needs to be adjusted |

## Fallback
If something turns out to be unimplementable, we keep the core promise that a list of interested people becomes an exact set of seats, and cut in this order:

1. Drop automatic notifications on reopening and use an in-app inbox that a member sees when they open the app.
2. Keep authentication scoped to a single pre-selected institutional login (MIT Touchstone or Commons login, TBD) without multi-domain support.

The last version we would still call our app has Authenticating, Hosting, Inviting, Reserving, Linking, Profiling, an exact headcount, and a withdrawal/cancellation that reopens the seat on the same link.
