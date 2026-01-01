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
- Human configuration
  - Create an empty `gh-pages` branch, solely used to host the compiled static assets for deployment.
  - Configure Github pages to use the `gh-pages` branch
  - Protect your `main` branch by only allowing pull requests to update it. This keeps agents from directly pushing to origin/main, bypassing human review. You can ask Claude to use the gh cli to do this for you.

- Configured via Github workflows
  - After a PR is created, Claude performs a code-review (see claude-code-reviewer.yml)
  - In parallel, the PR triggers a deployment to gh-pages under https://<username>.github.io/<project-name>/pr-<pr-number>. For example, `https://gfxblit.github.io/EastVsWest/pr-123`.This allows the human to review the PR and preview the change. (see pr.yml)

- Once the PR is approved and Claude merges the PR to main, this will kickoff a gh-pages main deployment to https://<username>.github.io/<project-name>/, e.g. `https://gfxblit.github.io/EastVsWest`.

## Testing

### End-to-end Testing

Running the end-to-end tests requires a running Supabase instance.

1.  Start the local Supabase development environment:
    ```bash
    supabase start
    ```
    Wait for the Docker dependencies to load.

2.  Get the Supabase credentials by running:
    ```bash
    supabase status
    ```
    This will output the `Project URL` and look for the anon key. The default local Supabase anon key is:
    ```
    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
    ```

3.  Set the environment variables and run the tests. For example, to run the lobby E2E tests:
    ```bash
    SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" npm run test:e2e e2e/lobby.test.js
    ```

    **Note:** For Puppeteer to use the bundled Chromium instead of the system Chrome, set `PUPPETEER_EXECUTABLE_PATH=""`:
    ```bash
    PUPPETEER_EXECUTABLE_PATH="" SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" npm run test:e2e e2e/lobby.test.js
    ```

#### Resetting the Local Database
If you modify an existing migration file or encounter issues with the local database state, you will need to reset it. This ensures all migrations are re-applied from a clean state.

To reset the database, you can run the provided script:
```bash
./supabase/reset.sh
```

Or run the following commands manually:
```bash
# Stop the Supabase instance and delete all local data
npx supabase stop --no-backup

# Restart the instance to re-apply all migrations
npx supabase start
```

## Build Workflow
To get started with local development and deploy the project:

*   **Build for Deployment**: To create optimized, production-ready files, run `npm run build`. This command will generate a `dist/` folder containing `bundle.js` and `index.html`.
*   **Deployment**: The contents of the `dist/` folder are ready for deployment.

## Mobile Debugging

The project includes [Eruda](https://github.com/liriliri/eruda), an in-browser developer console for mobile devices. This is essential for debugging on iOS/iPadOS where Safari and Chrome do not provide access to the developer console.

### Features

Eruda provides:
- **Console**: View `console.log()`, `console.error()`, `console.warn()`, and uncaught errors
- **Elements Inspector**: Inspect and modify DOM elements in real-time
- **Network Monitor**: Track network requests and responses
- **Resources Viewer**: View localStorage, sessionStorage, and cookies
- **Sources**: View loaded JavaScript and CSS files

### Availability

Eruda is automatically enabled in:
- **Development mode** (`npm run dev`)
- **Production builds** when you add `?debug=true` to the URL

This approach keeps production bundle sizes small (~210KB smaller) while still allowing mobile debugging when needed.

### Usage

**For Local Development:**
```bash
npm run dev
```
Eruda will be automatically available - look for the floating gear icon (⚙️).

**For Production/Deployed Builds:**
Add `?debug=true` to the URL to enable Eruda:
```
https://gfxblit.github.io/EastVsWest/?debug=true
```

**To access Eruda:**
1. Open the application in a mobile browser (Safari, Chrome, etc.)
2. Look for a floating gear icon (⚙️) in the bottom-right corner of the screen
3. Tap the icon to open the Eruda developer panel
4. Use the tabs at the bottom to switch between Console, Elements, Network, etc.

**Tip:** You can drag the gear icon to reposition it if it's blocking game content.

### When to Use

- Debugging JavaScript errors on mobile devices
- Inspecting network requests to Supabase
- Viewing console logs during mobile gameplay
- Testing responsive layout issues on actual mobile hardware
- Debugging touch input handling

## Environment Configuration

### Local Development
For local development, create a `.env.local` file in the root of the project with your local Supabase credentials.

**Quick Setup:**
```bash
cp .env.local.example .env.local
```

The default configuration in `.env.local.example` uses the standard local Supabase development credentials:
```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

**Note:** The `VITE_` prefix is required for Vite to expose these variables to the client-side code.

This file will be automatically loaded by Vite during local development (`npm run dev`).

### Remote Development (LAN / Tailscale)
To test the game on other devices (like mobile phones) connected to your local network or via [Tailscale](https://tailscale.com/):

1.  **Start the Server:**
    Run the development server with the `--host` flag to expose it to the network:
    ```bash
    npm run dev -- --host
    ```

2.  **Connect:**
    The terminal will display your Network URLs (e.g., `http://192.168.1.5:3000` or `http://my-machine.tailnet.ts.net:3000`).
    Open this URL on your mobile device.

3.  **Automatic Backend Configuration:**
    The application automatically detects the hostname you are using. If you connect via a custom hostname or LAN IP, it will attempt to communicate with the Supabase backend on the **same hostname** at port `54321`.
    
    *Example:* If you connect to `http://192.168.1.5:3000`, the app will automatically use `http://192.168.1.5:54321` for the backend API.
    
    **Requirement:** Ensure your computer's firewall allows incoming connections on port `54321` (Supabase) and `3000` (Vite).

### Production Environment
For the application to connect to Supabase in a production environment, you must provide the necessary credentials via a `.env` file.

1.  Create a file named `.env` in the root of the project.
2.  Add the following environment variables to the `.env` file, replacing the placeholder values with your actual Supabase credentials:

    ```
    VITE_SUPABASE_URL="<your-supabase-url>"
    VITE_SUPABASE_ANON_KEY="<your-supabase-anon-key>"
    ```

    These credentials can be found in your Supabase project's dashboard under "Project Settings" > "API".

### GitHub Pages Deployment
For GitHub Pages deployment, environment variables must be configured as GitHub repository secrets since Vite embeds them at build time during the CI/CD workflow.

1.  **Get Production Credentials:**
    ```bash
    npx supabase projects list
    npx supabase projects api-keys --project-ref <your-project-ref>
    ```

2.  **Add GitHub Secrets:**
    Navigate to your repository: **Settings → Secrets and variables → Actions → New repository secret**

    Add these two secrets:
    - **Name:** `VITE_SUPABASE_URL`
      **Value:** Your production Supabase URL (e.g., `https://xxxxx.supabase.co`)

    - **Name:** `VITE_SUPABASE_ANON_KEY`
      **Value:** Your production Supabase anon/public key

**Note:** The anon key is safe to expose client-side. Security is enforced through Row Level Security (RLS) policies in your database, not by hiding the anon key.

### Gemini Code Review
To enable the AI code review agent on Pull Requests:

1.  **Get a Gemini API Key:**
    Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey).

2.  **Add GitHub Secret:**
    Navigate to your repository: **Settings → Secrets and variables → Actions → New repository secret**

    - **Name:** `GEMINI_API_KEY`
    - **Value:** Your API Key starting with `AIza...`

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
- Tip: you may generate multiple roadmap options (e.g. prefer multiplayer functionality first), and ask Claude to compare roadmaps, and suggest which one has highest likelihood of success, and why.

  ## Tips for generating `GAME_DESIGN.md`
  - take a template, say from https://github.com/gfxblit/SnakeClaude/blob/main/docs/game_design.md
  - iterate with an agent, startig with a prompt like 'Help me write a game design doc for a multiplayer, top down, combat game, east vs west, where players can fight each other in a battle royal, picking up weapons and armor. See https://github.com/gfxblit/SnakeClaude/blob/main/docs/game_design.md as an example'
  - iterate with 'read the design again, and see if there are any critical gaps before implementation. if there are, clarify'
