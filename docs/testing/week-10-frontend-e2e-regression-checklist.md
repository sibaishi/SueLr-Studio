# Week 10 Frontend E2E Regression Checklist

## Goal

Confirm that Week 10 has established a first stable, repeatable frontend E2E regression baseline for high-risk workflow and settings paths.

## Automated Verification

- [x] Frontend E2E framework is integrated into the project
- [x] Local unified E2E commands are available
- [x] CI runs the frontend E2E stable subset
- [x] Covers settings persistence after reload
- [x] Covers navigation between settings and workflow
- [x] Covers adding a workflow node from the sidebar
- [x] Covers at least one workflow editing regression path
- [x] Covers at least one provider / models linkage regression path
- [ ] Covers connection, duplicate, and delete editing paths
- [ ] Covers group, ungroup, and release paths
- [ ] Covers merge node sizing interactions
- [ ] Covers draft save and restore
- [x] At least one previously fixed issue has been converted into an automated regression case

## Manual Recheck

- [x] A full local E2E run has been executed and results are stable
- [x] The E2E environment uses isolated ports and an isolated backend runtime directory
- [x] Tests actively clear browser local state and backend settings state before execution
- [x] One workflow editing path has been manually spot-checked against the implemented regression test
- [x] One provider / models linkage path has been manually spot-checked against the implemented regression test

## Week 10 Delivered

1. Playwright baseline and unified commands are in place.
2. Stable test hooks were added to key settings and workflow surfaces.
3. The local E2E suite now covers five stable smoke / regression cases:
   - settings fields persist after reload
   - workflow can add a node from the sidebar
   - workflow toolbar can navigate back to settings
   - workflow editing can undo a newly added node
   - settings connection test syncs models into the import list
4. The stable E2E subset is wired into CI through the `frontend-e2e` job.

## Conclusion

Week 10 is complete.

The remaining uncovered workflow editing paths are expansion items for later weeks, not blockers for closing this week.
