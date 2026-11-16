# Development plan

This plan covers what we expect to deliver at each checkpoint, who owns each piece, the main risks and how we will reduce them, and what we cut if something turns out to be unimplementable. The responsibilities below are a proposal for the team to adjust, and every member takes part in every activity, as the final project page requires. Splitting the work by concept follows from how the concepts are designed, since each one is independent and can be built and tested on its own.

## Delivery by stage

| Stage | Due | What we expect to have |
|---|---|---|
| F3 Concept design | Mon, Nov 16 | Revised problem framing, five concept specs with syncs, user journey, visual design study, design summary, and this plan |
| F4 Alpha | Mon, Nov 23 | A first running app with one complete path. A verified member creates a gathering, shares its link, a second verified member opens the table page, claims a seat, and releases it. Data is seeded and the interface is unstyled but usable. Covers Gathering, Seating, and Membership (email domain check only) |
| F5 Beta | Mon, Nov 30 | A nearly complete app. Adds the waitlist with in-app notifications on promotion, the cutoff reminder, address visibility only for holders, automatic closing of unconfirmed gatherings, multiple communities per gathering, and the table board. VenueChoosing works in its basic form (host adds candidates, seated guests vote, the venue locks at the cutoff). The visual style from the design study is applied, and the app is deployed |
| F6 User testing | Mon, Dec 7 | Results from sessions where participants act out the Noah and Alice situations on the real app, plus the fixes we make in response |
| F7 Demo and report | Wed, Dec 9 | Final demo, project report, and cleanup of the repo and README |

Thanksgiving falls on Nov 26, between the Alpha and Beta deadlines, and several of us will be away or busy. To protect the Beta, we aim to finish the Alpha by Sat, Nov 21, so that the break week is spent on the waitlist, the board, and styling, not on getting the basics to run. The only work that depends on everyone being present is the Beta integration, which we schedule for Sat, Nov 28 and Sun, Nov 29.

## Responsibilities

| Member | Primary ownership | Also responsible for |
|---|---|---|
| Hubert | Gathering and Membership concepts (communities and email verification), and the shared repo (branches, pull requests, deployment) | Reviewing every pull request into main, and the table board |
| Elijah | Seating concept, including the waitlist and release behavior | The table page interface, applying the visual style, and reporting if time remains |
| Diego | VenueChoosing and Notifying concepts | Host confirmation and the per-host limit on open tables, and preparing and running the user testing sessions |

Everyone writes the syncs that touch their own concepts. Mentor meeting agendas and notes rotate weekly, and are stored in the team repo as the course asks. Each task gets its own branch and merges through a pull request, and a teammate reviews every pull request before it merges.

## Key risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Sending real verification emails may not work reliably or may take time to set up | Membership is the basis for who can claim a seat and for keeping the address private | Build the domain check and a one-time code first, with the code shown in the app during development. Switch to real email only once the rest works |
| Restaurant data from an outside service may be incomplete or limited by quotas | VenueChoosing depends on candidate venues with diet, price, and distance tags | Let the host enter candidates by hand with tags, and treat any outside lookup as an optional improvement |
| Waitlist promotion and seat counts can go wrong under simultaneous claims | Two people claiming the last seat would break the exact headcount, which is the main promise of the app | Make claim and release single operations in Seating and test them with concurrent requests early, during the Alpha |
| Scope grows past five concepts and the Beta is not ready | The Beta falls just after Thanksgiving | Freeze new features after Nov 28, and rank every unfinished item against the fallback below |
| Moderation (reports and review) takes more effort than we have | It responds to a real ethics concern, but it does not appear in the operational principle of any concept | Build host confirmation and the per-host limit first, since they are cheap, and add the report queue only if time remains |
| With three of us, each person carries more than a quarter of the work | Membership, Seating, and the interface each have a single owner, so a slow week for one person stalls a whole path | Keep pull requests small so work can be picked up by someone else, and decide at the Nov 21 check whether VenueChoosing stays in the Beta or moves to the fallback |
| Teammates cannot meet at the same time | The course expects weekly mentor meetings and frequent syncing | Set a fixed weekly slot now, keep async updates in the team thread, and keep pull requests small |

## Fallback

If something turns out to be unimplementable, we keep the core promise that a list of interested people becomes an exact set of seats, and cut in this order:

1. Drop automatic notifications on reopening and use an in-app inbox that a member sees when they open the app.
2. Drop VenueChoosing and support fixed venues only. A host who has a restaurant or dining hall in mind (Alice and Maya) is still fully served, and only the progressive discovery case (Noah) is weaker.
3. Drop the table board and rely on shared links alone, which still addresses the forwarded-invitation problem.
4. Replace real email verification with a one-time code check against the community's email domain.

The last version we would still call our app has Gathering, Seating, and Membership working with a shareable link, an exact headcount, a release that reopens the seat on the same link, and a home address that stays hidden from everyone who does not hold a place.
