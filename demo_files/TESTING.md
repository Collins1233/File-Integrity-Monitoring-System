# Demo Files — Testing Guide

This folder contains sample files for every major supported type.

## Setup

1. In the app, add this folder as a monitor:
   `/Users/cliq-tech/Desktop/File-Integrity-Monitoring-System/demo_files`
2. Wait for the baseline to finish (or run Check Now once).

## Quick tests

| File | How to trigger a change |
|------|-------------------------|
| welcome.txt | Edit line 2 |
| confidential.txt | Add a new line |
| readme.md | Change a heading |
| config.json | Change `"demo"` to `false` |
| data.csv | Change Bob's role |
| memo.rtf | Edit a paragraph |
| project-memo.docx | Change "Security Team" |
| budget.xlsx | Change a cell in Budget sheet |
| overview.pptx | Edit slide 1 subtitle |
| security-policy.pdf | Regenerate or edit text |
| logo.png | Replace with another image |
| badge.jpg | Replace with another image |

## What to look for

- **What changed** tab — summary cards + changed sections only
- **Full file side by side** — complete original vs current with highlights
- **Undo changes** — restore from baseline backup

## After testing restore

Click **Undo changes — restore original file** on any changed item, then run Check Now again to confirm it is clean.
