---
name: new-project
description: Use when starting new software from an idea or vision with no existing project, such as "help me build an app/site/tool that...". Covers choosing a foundation the owner can run, afford, and change, and getting a working first version quickly.
---

# Starting a new project

Apply the Keel principles already in context. This adds what matters specifically when nothing exists yet.

## Understand enough to choose a foundation
Before choosing technology, make sure you know the facts that would change the foundation or be costly to reverse later. Common ones:
- Who will use it, and roughly how many people.
- Whether it handles money, personal data, or accounts, and whether the user wants those at all.
- Where it needs to run (only their computer, a public website, a phone) and what they will pay to host it.
- Whether someone other than a coding agent will maintain it.

These are examples, not a checklist. Watch for anything else of that weight in what the user describes, such as legal or privacy obligations, integrations with services they already use, accessibility, languages, or offline use. Ask about what you can't reasonably infer; decide and state the rest.

## Choose a foundation for this owner
- Prefer a mainstream stack with good documentation and free or cheap hosting suited to the expected use.
- Pick the fewest moving parts that can meet the real requirements. Add a database, accounts, or background services only when a requirement needs them.
- Make sure the user can start it with one documented command.

## Prove the riskiest part first
If one part is uncertain (an external API, a hard algorithm, a hosting constraint), check that it works in the smallest possible way before building around it.

## Build a walking skeleton early
- Get a thin, end-to-end version running soon: the main user path works, even if plain.
- Run it and exercise it yourself, then grow it in steps that each leave it working.
- Add automated checks for the core behavior as it stabilizes.

## Set up the record and safety net
- Initialize a local git repository and commit working states. Never push or publish without the user's request.
- Create the README with the product requirements: what it is for, for whom, what it must and must not do, and how to run it.
- Create the agent instruction file with the foundation decisions and a one-line reason for each (see host notes for the file).

## Report
Tell the user in plain language:
- What they can do with it now, and how to start it.
- What you verified and how.
- The main decisions you made and why.
- What is not done yet.
- Anything you need from them.
