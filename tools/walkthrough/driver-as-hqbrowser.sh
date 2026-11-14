#!/bin/sh
# Starts Playwright's node driver as the locked-down macOS user _hqbrowser. run.py points Playwright's Python client at
# this script (PLAYWRIGHT_NODEJS_PATH), so the driver and the browser it launches run as that user while the runner and
# the patient model stay as they are. The client talks to the driver over this process's stdin and stdout and the driver
# talks to the browser over pipes, so no browser port is opened. Everything here is fixed; the caller's arguments are
# ignored on purpose. From / because _hqbrowser cannot read his folders.
cd / || exit 1
B="/Library/Application Support/ai-hq/browser"
D="$B/venv/lib/python3.15/site-packages/playwright/driver"
exec /usr/bin/sudo -n -u _hqbrowser /usr/bin/env -i HOME=/Users/_hqbrowser TMPDIR=/Users/_hqbrowser/tmp \
  PATH=/usr/bin:/bin:/usr/sbin:/sbin PLAYWRIGHT_BROWSERS_PATH="$B/ms-playwright" "$D/node" "$D/package/cli.js" run-driver
