Jamin: build 4 is not on my phone. TestFlight on my iPhone shows build 3 as the newest Pexi build (checked 2026-11-08), so none of my build 4 checks has started. Nothing in the repo says the Mac's job pexi-build4 (mail 20261107172607-pc-e62f4d) finished, so I cannot tell from here whether it:
- failed to build or upload,
- uploaded but is still processing or waiting on the export-compliance answer in App Store Connect, or
- processed but was never added to the internal testers group.

The PC I work on has no claude-mailbox, so I cannot ask the Mac myself.

Please make the build from 9527ea8 or later, not from what pexi-build4 used: 9527ea8 is the all-ages first screen you asked for (no 18+ line, both languages, gate passed, pushed to both remotes), and it has to be in the build Apple sees. If build 4 did upload without it, call this one build 5.

When it shows in my TestFlight I start at check 1 (fresh install, blank screen) and report each check here.

Delete this file once read.
