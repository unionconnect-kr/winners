# MANEE Factory: free recipes for logistics stores

The actual MANEE owner shell now links **More → MANEE Factory**. This is
implemented in the app repository, rather than in the separate Factory mockup.

An active, server-maintained logistics account for the selected store grants
free recipe access. No recipe checkout or extra subscription is required for
these stores. Base MANEE billing is unchanged. No first-order threshold,
minimum spending, expiration or new pricing policy for non-logistics stores
is introduced. Operators must confirm actual logistics usage before setting
an account active; account creation by itself does not grant access.

The catalog contains published recipe titles and summaries only. Recipe text
and video URLs are returned separately, after checking current owner
membership, live login session, profile, store and logistics status. Clients
cannot edit logistics status or read the underlying private tables. No recipe
body or access flag is persisted in browser storage. Store/account changes,
failed reads and refreshes invalidate prior protected content.

The logistics text describes app ordering, Dongwon Homefood 3PL refrigerated /
frozen storage at the logistics center, delivery and access to all available
item codes. This change does not implement an ordering system or fabricate
catalog entries, prices, delivery conditions or recipes.

## Validation

- Full repository tests: **865 total; 855 passed; 10 skipped; 0 failed**.
- Factory-specific coverage: client races, logout, account/store switch,
  inactive/pending logistics, denied direct reads/writes, foreign owner, staff,
  anonymous caller, revoked membership, banned account, archived store,
  expired session, metadata/body separation, draft recipe, XSS and HTTPS URLs.
- Staging and production build generation succeeded. No production deployment.
- Staging migration applied to `manee-staging` only. Version
  `20261020010856` matches the server's migration history.
- A live staging transaction verified free recipe retrieval, metadata-only
  catalog and immediate inactive denial. All QA data changes were rolled back.
- Security advisor reported no new Factory findings.
- Factory build asset is included in both direct and isolated staging builds.

## Remaining release work

Source is committed locally on `codex/factory-logistics-recipes-20261020`.
Remote upload was blocked by automatic approval review because the linked
GitHub repository is public. No push, PR, phone preview deployment, production
migration or store binary update has completed. After authorized source upload,
create the actual-app deploy preview and verify phone login and navigation.
Real recipes and operator-confirmed logistics accounts must be configured
before users can see actual content. Empty catalogs are displayed honestly.
