# EastVsWest

This is an agentic development flow to create a video game.

The flow requires these inputs:
- `GAME_DESIGN.md`: describes what the game is, how its played, etc.
- `ARCHITECTURE.md`: describes high level: how game state is managed, player inputs, etc; and low level: programming language, test frameworks, etc.
- `Roadmap` issue: provides an ordering of work to be done, linking to issues, and tracks status.
- `CLAUDE.md`: describes the agent behavior, using test-driven development

Here's the dev flow:

1. Human writes issues decribing the feature, using `@claude` to trigger Claude.
1. Claude implements the feature using test driven development, and pushes the changes to a remote branch, updating the issue with a link to creating a PR
1. Human creates PR by clicking the link and provides feedback in the PR
1. CI/CD deploys Javascript app to gh-pages as part of the PR
1. Claude reviews PR and updates (may iterate with human in PR)
1. After Human approves, Claude is responsible for merging the PR to main (fixing conflicts, etc.)

(note: multiple Claudes may be working on separate issues in parallel)

## Infrastructure
- After a PR is created, Claude performs a code-review (see claude-code-reviewer.yml)
- In parallel, the PR triggers a deployment to gh-pages under https://<username>.github.io/<project-name>/pr-<pr-number>. For example, `https://gfxblit.github.io/EastVsWest/pr-123`.This allows the human to review the PR and preview the change.
- The `gh-pages` branch is maintained as an empty branch, solely used to host the compiled static assets for deployment.
- Github deployment using gh-pages
- Once the PR is approved and Claude merges the PR to main, this will kickoff a gh-pages main deployment to https://<username>.github.io/<project-name>/, e.g. `https://gfxblit.github.io/EastVsWest`.
- Protect your `main` branch by only allowing pull requests to update it. This keeps agents from directly pushing to origin/main, bypassing human review.

## Build Workflow
To get started with local development and deploy the project:

*   **Build for Deployment**: To create optimized, production-ready files, run `npm run build`. This command will generate a `dist/` folder containing `bundle.js` and `index.html`.
*   **Deployment**: The contents of the `dist/` folder are ready for deployment.

## Project Management
This project utilizes GitHub Issues for task management and roadmap tracking.
- **Roadmap Issue:** A central `Roadmap` issue serves as the project's master tracking document. It contains an exhaustive checklist of all tasks and their corresponding GitHub Issues. Tasks that need to be sequenced have increasing numbers. Parallelizable tasks are under "Dev A", "Dev B", etc.
- **Epics as Milestones:** Major development phases (Epics) are tracked using GitHub Milestones, providing a high-level view of progress.
- **Task Issues:** Individual, actionable tasks are managed as separate GitHub Issues, each linked back to the roadmap.
- **Labels for Clarity:**
    - `roadmap`: Identifies the central roadmap issue.
    - `tracking`: Marks issues that serve as containers or checklists for other tasks.
    - `status:blocked`: Indicates an issue cannot be started due to a dependency on another issue, with the blocking issue referenced in its description. 
- Prompts for generating the roadmap
  - identify the major components from `ARCHITECTURE.md`
  - identify interfaces between components to enable parallel development in each component
  - identify when tasks need to be sequenced (e.g. implement the game state data model, THEN expose the interfaces to it)
  - identify when to create a task to WRITE a design for a capability: it's too complex to state in a single issue
  - favor getting end-to-end on a feature, vs. building all the components and seeing if they work together in the end

  ## Tips for generating `GAME_DESIGN.md`
  - take a template, say from https://github.com/gfxblit/SnakeClaude/blob/main/docs/game_design.md
  - iterate with an agent, startig with a prompt like 'Help me write a game design doc for a multiplayer, top down, combat game, east vs west, where players can fight each other in a battle royal, picking up weapons and armor. See https://github.com/gfxblit/SnakeClaude/blob/main/docs/game_design.md as an example'
  - iterate with 'read the design again, and see if there are any critical gaps before implementation. if there are, clarify'
