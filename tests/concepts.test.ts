import { expect, test } from "bun:test";
import { applicationConceptSet } from "../src/concepts.ts";

// registering compares each spec's actions, queries, and refusals with its class, so importing the set is the check
test("the specs and refusals of Authenticating, Sessioning, Hosting, Reserving, Linking, Inviting, Profiling, and Polling register with the framework", () => {
  expect(Object.keys(applicationConceptSet.concepts)).toEqual([
    "Authenticating",
    "Sessioning",
    "Hosting",
    "Reserving",
    "Linking",
    "Inviting",
    "Profiling",
    "Polling",
  ]);
});
