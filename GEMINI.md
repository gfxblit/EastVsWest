**ALWAYS READ CLAUDE.MD FOR INSTRUCTIONS!**

## Github interactions
- **ALWAYS** try to use `gh` cli over web fetching, or asking the user to update issues, prs, etc.
- if gh fails, then fallback to informing the user via the issue/pr that initiate the ask
- if no issue/pr is available, then echo back to the user

## Git worktree
- When working on a task, **ALWAYS** start by creating a worktree <current-dir>/worktrees/<proj name>-<task name>
- Do your work in that worktree
- commit changes in the worktree and push to origin
- **Benefits of Git Worktrees**:
    - **Task Isolation**: Worktrees allow you to work on separate tasks (features, bug fixes) in isolated environments without constantly switching branches in your main working directory. This prevents interference and context switching overhead.
    - **Parallel Development**: Easily manage and switch between multiple active projects or experiments without stashing or committing unfinished work.
    - **Clean Main Branch**: Keeps your main branch clean and ready for integration, as all experimental or feature work is confined to its dedicated worktree.
- **Best Practices for Worktrees**:
    - **Regular Commits**: Commit your changes frequently within the worktree to save your progress and maintain a clear history.
    - **Push to Origin**: Periodically push your worktree branch to the remote to back up your work and collaborate with others.

