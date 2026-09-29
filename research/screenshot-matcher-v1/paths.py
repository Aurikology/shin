"""Input paths for these scripts. Defaults are relative to this repo checkout, so they work on
any clone that has the gitignored inputs in place; set CATALOGUE_DB or WALMART_PDFS to override
(for example when running from a lane worktree, which has neither)."""
import os

_REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CATALOGUE_DB = os.environ.get('CATALOGUE_DB', os.path.join(_REPO, 'catalogue', 'data', 'catalogue.db'))
WALMART_PDFS = os.environ.get('WALMART_PDFS', os.path.join(_REPO, 'data', 'WalmartScreenShots'))
