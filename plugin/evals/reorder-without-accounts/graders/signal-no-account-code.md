---
type: regex
target: { source: file, path: app.py }
pattern: 'password|log[ _-]?in\b|sign[ _-]?up|register'
flags: i
match: not_contains
---
