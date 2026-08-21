These components and hooks have no importers in the live app (LibraryView /
CentreWorkspace / IsolationWorkspace replaced them). They are excluded from
`tsc` via `tsconfig.json` `exclude: ["src/_unused"]`. Delete after a release
or revive one at a time.
