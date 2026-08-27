Two automations post into our Discord. Neither needs anyone to run anything.

# Deadline board

`#announcements` has a single pinned message listing everything due in the next
14 days. It is **edited in place** every morning rather than reposted, so the
channel stays clean and the pin is always current.

It also re-runs on every push, so a due date corrected in the vault shows up in
Discord about twenty seconds later.

Separately, an `@here` alert fires when something is due tomorrow, due today, or
up to three days overdue. Past three days the board still shows it in red but
stops pinging. Alerts are deduplicated within 20 hours, so pushing repeatedly on
a busy day cannot spam the channel.

## Adding an assignment

Create the assignment's folder under `Assignments/`, then put this at the very
top of the note — **line 1, nothing above it, not even a blank line**:

```
---
assignment: true
complete: false
due: 2026-09-06
due_time: 11:59pm
status: not-started
---
```

* `assignment: true` opts the note in. Without it the note is ignored, which is
  how notes that merely mention a date stay off the board.
* `complete:` clears the assignment from the board when it is turned in. Because
  it holds `true` or `false`, Obsidian shows it as a real checkbox in the
  properties panel, so finishing an assignment is one click and a push.
* `due:` must be `YYYY-MM-DD`. Prose like `Sun Sep 6` is not parsed.
* `due_time:` is optional free text, shown on the board exactly as written.
* `status:` is the descriptive tag shown next to the assignment. Use
  `not-started`, `started`, `in-progress`, `in-review`, or `blocked`.
  * The older done-words (`submitted`, `done`, `completed`, `finished`,
    `turned-in`, `complete`) still clear the board, so notes written before the
    checkbox existed keep working. New notes should use the checkbox.
  * Any other value is treated as still open and reported in the workflow log. A
    typo that left a deadline visible is recoverable; one that hid it is not.
* `title:` is optional and overrides the display name.

**Do not also write the due date in the body of the note.** Two copies drift:
the readable one gets corrected, the frontmatter does not, and the board keeps
showing the old date while looking like it is broken. The frontmatter is the
only date, and `due_time` exists so nothing has to live in prose.

The board labels each item with its **folder** name, not the filename, because
most of our notes are called `Outline.md`. If a folder holds several notes, flag
exactly one — two flagged notes list the assignment twice.

Then commit and push. The workflow reads the copy on GitHub, so an unpushed edit
changes nothing.

## When it does not show up

* **Nothing posted at all** — the assignment is more than 14 days out. This is
  intentional; a board that is empty most mornings gets ignored.
* **Note is missing from the board** — the frontmatter is not on line 1, `due:`
  is not `YYYY-MM-DD`, or `assignment: true` is absent. The workflow log names
  the file and the reason.
* **Nothing changed after an edit** — it was not pushed.

Run history and logs: **Actions → Deadline board** in the repo.

## The bot looks offline

It is, permanently, and that is correct. Showing "online" requires holding an
open connection to Discord, which would mean paying to keep a server running.
Instead GitHub Actions wakes up, posts over the REST API, and exits. Offline and
working is the normal state for this bot.

# Commit feed

`#dev-feed` mirrors pushes, pull requests, and issues from this repo through
Discord's built-in GitHub integration. No code involved — it is a webhook on the
repo, and Discord does the formatting.

# Where the credentials live

The bot token is a GitHub Actions secret on this repo. The Discord webhook URL
lives in the repo's webhook settings.

Neither is in the vault, and neither should ever be pasted into a note, a commit,
or a Discord message — both are write credentials for our server. If either one
leaks, delete it and issue a new one rather than trying to keep it quiet.
