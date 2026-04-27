# Restart Django server

**After any backend change (e.g. URLs, middleware, CSRF exemptions), restart Django so the running process picks it up.**

If the server was started in a terminal you can't see, do this in a **new** terminal:

## 1. Stop whatever is on port 8000

```bash
# Find the process
lsof -i :8000

# Stop it (use the PID from the second column, e.g. 63743 or 91953)
kill <PID>
# Or force stop:
kill -9 <PID>
```

Or in one line (stops all Python processes using port 8000):

```bash
lsof -ti :8000 | xargs kill
```

## 2. Start Django again

From the project root:

```bash
pipenv run manage runserver
```

---

**In Cursor:** Open a new terminal with **Terminal → New Terminal** (or `` Ctrl+` ``), then run the commands above.
