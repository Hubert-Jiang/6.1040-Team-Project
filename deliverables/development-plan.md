# Development plan
This plan covers what we expect to deliver at each checkpoint, who owns each piece, the main risks and how we will reduce them, and what we cut if something turns out to be unimplementable. The below responsibilities are tentative, as adjustments to the concept design or implementations may have to be made to implement the concept reactions.But overall, splitting the work by concept will be effective and minimize merge conflicts, as each one is independent and can be built and tested on its own.

## Delivery by stage

| Stage | Due | What we expect to have |
|---|---|---|
| F3 Concept design | Mon, Nov 16 | Revised problem framing, concept design, user journey, visual design study, design summary, and this plan |
| F4 Alpha | Mon, Nov 23 | A first running that satisfies the specified user journey for the MVP. This should include creating a table, invitation links, and account creation reactions. |
| F5 Beta | Mon, Nov 30 | A nearly complete app. In-app notifications, waitlists, and restuarant polling should be implemented. The visual style from the design study is applied, and the app is deployed |
| F6 User testing | Mon, Dec 7 | Results from sessions where participants act out the Noah and Alice situations on the real app, plus the fixes we make in response |
| F7 Demo and report | Wed, Dec 9 | Final demo, project report, and cleanup of the repo and README |

Thanksgiving falls on Nov 26, between the Alpha and Beta deadlines, and we will be away or busy. To protect the Beta, we aim to finish the Alpha by Sat, Nov 21, so that the break week is spent on the waitlist, the board, and styling, not on getting the basics to run. The only work that depends on everyone being present is the Beta integration, which we schedule for Sat, Nov 28 and Sun, Nov 29.

## Responsibilities
| Member | Primary ownership | Also responsible for |
|---|---|---|
| Hubert | Authenticating, Polling, and Notifying | Note-taking during meetings. Ensuring sessions and secure and that the authentication is properly integrated with the rest of the app. |
| Elijah | Reserving, Profiling, Hosting, and Linking | Ensuring locking interactions for reserving; i.e. users reserving a seat hold a lock to a seat while the reaction completes |

Everyone implements the syncs and reactions that touch their own concepts. Each task can be committed and merged as necessary. Teammates will communicate with each other to reduce the prevalence of merge conflicts. Each teammate will review the others' pushes regularly to ensure quality and clear up any confusion. Text updates will be sent to the group chat when pushes are completed.

## Key risks and mitigations
| Risk | Why it matters | Mitigation |
|---|---|---|
| Sending real verification emails may not work reliably or may take time to set up | Membership is the basis for who can claim a seat and for keeping the address private. The domain includes a wide range of possible users, so ideally as many people are able to use the app as possible. | Iteratively widen the domain as the app development proceeds. Since we are initially focusing on deploying this to the MIT community, we will start with Touchstone login (or use Commons login), which is something everyone is already familiar with. If the scope allows, we can look at more sophisticated forms of email verification like OTPs, but this can be complicated. |
| Restaurant data from an outside service may be incomplete or limited by quotas | Users need locations to vote on, and may require access to reservation APIs like OpenTable to make the app seemless. | Allow invitees (including the host) to manually enter candidates by hand with tags (e.g. price), and treat any outside lookup as an optional improvement. Redirects to restuarant or OpenTable pages for useres to manually create the actual reservations if API access is not possible. |
| Waitlist promotion and seat counts can go wrong under simultaneous claims | Two people claiming the last seat would break the exact headcount, which is the main promise of the app | Make claim and release single operations in Reserving and test them with concurrent requests early, during the Alpha |
| Moderation (reports and review) takes more effort than we have | It responds to a real ethics concern, but it does not appear in the operational principle of any concept | Build host confirmation and the per-host limit first, since they are cheap, and add the report queue only if time remains |
| With two of us, each person carries half of the work | The concepts each have a single owner, so a slow week for one person stalls a whole path | Keep pull requests small so work can be picked up by someone else, and decide at the Nov 21 check-in if the feature scope needs to be adjusted |

## Fallback
If something turns out to be unimplementable, we keep the core promise that a list of interested people becomes an exact set of seats, and cut in this order:

1. Drop automatic notifications on reopening and use an in-app inbox that a member sees when they open the app.
2. Drop the table board and rely on shared links alone, which still addresses the forwarded-invitation problem.
3. Replace real email verification with MIT-limited scope (or use Commons)

The last version we would still call our app has Authenticating, Hosting, Inviting, Reserving, Linking, Profiling, an exact headcount, and a release that reopens the seat on the same link.
