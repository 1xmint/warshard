---
description: Transfer check for the investigate skill. A reminder job crashes partway on a bad invoice and saves nothing (causing duplicates and missing reminders), and also resends after email-provider timeouts that may have been delivered. Owner requirement - at most one reminder per invoice per day.
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Agent]
---

Some of our clients are complaining that they got the same payment reminder three or four times in one morning, and a couple of others say they never got one at all. Can you figure out what's going on and fix it?
