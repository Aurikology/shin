# The mac-hosted beta server, tunnel and admin routes

This section covers three things: how the actual server process comes up and stays up on the
founder's own Mac, how it becomes reachable from a tester's phone out on the open internet
(a tunnel, not a public IP the Mac itself holds), and how a session running on any other
machine reads back what real testers actually did, through a small set of routes reserved for
that reading, never for the testers themselves. Every claim below was checked directly against
the actual files during the same session that wrote it; where something could not be checked
from this machine at all, that is said plainly rather than assumed either way.

## Starting the server process itself

1. The process is started by the Mac's own operating-system service manager, not by a person
   opening a terminal and running a command. A small job description tells that service manager
   to run one fixed shell script the moment the Mac boots or the founder logs in, and, separately,
   to restart that same script immediately any time it exits, for any reason at all, crash or
   otherwise. Confirmed directly in that job description's own comment: this restart behavior is
   exactly what a later check (the founder killing the process outright and watching a new one
   appear with a different process id) exists to prove, not just claim.
2. That shell script does two things, in order. First it loads every setting the server and its
   supporting packages read (which port to listen on, which files on disk hold the product
   catalogue, the scan history, corrections and price history, which folder holds the beta's own
   data, which model keys are in play, and more) out of one single settings file, rather than
   having any of those values live a second time inside the service manager's own job description.
   Then it hands off to the actual server program, passing along everything it just loaded.
3. One piece of that settings file needs a comment of its own: which program binary actually runs
   the server. A service manager on macOS does not read the interactive shell setup a person's own
   terminal would (no shell profile, no version-manager shims), so a plain, unqualified reference to
   "the node program" is not reliable once the script is run this way rather than typed by hand.
   The settings file is written so this can be pointed at an exact, absolute location, and the
   script falls back to the unqualified name only if that setting is left blank, on purpose, so a
   first broken run explains itself (missing program) instead of silently doing nothing.
4. Before the server ever opens its listening port, it runs a startup check that can refuse to
   start at all rather than come up half-working, printing the reason and changing nothing on
   disk. What that check looks for: that the configured port number is actually a valid port
   number; that every database the operator explicitly declared as required for this machine is
   really present as a file (not just a folder that could hold it); and, separately from any of
   the above, that any file path pointing at a database is not sitting inside a folder that does
   not exist at all, since a whole missing folder always means a typo or a disk that failed to
   mount, never a database simply not copied over yet. A file that is missing inside a folder that
   does exist is treated as normal (a database not copied yet), specifically so a development
   machine with no multi-gigabyte catalogue file at all can still boot the server and work on
   everything else.
5. **A concrete gap found, not assumed.** The mechanism in point 4 that lets an operator declare
   "this machine must have its catalogue, and refuse to start half-working if it does not" is real
   and tested in isolation, and the code's own comment states plainly that this is exactly what the
   Mac's own settings are expected to turn on, naming the actual failure it exists to catch: the
   Mac reboots, the server comes back up, the external disk holding the multi-gigabyte catalogue
   did not remount in time, and the server now answers every single scan with "we have not seen
   this one" while looking perfectly healthy. Checked directly this session: the Mac's own actual
   settings file, as checked into this repository as a template with every real value the founder
   has filled in named, never turns this declaration on for the catalogue or for anything else. So
   the specific startup refusal the code was written to provide is not actually configured to fire
   on this beta's own Mac. This is not undefended in every sense: a separate, ongoing health check
   (described below, under the deploy system) polls the public address roughly every 30 seconds and
   would notice a catalogue reporting itself unattached within that window, on its own, through a
   different mechanism. Whether that ongoing poll is an accepted substitute for the refusal-to-start
   guard the code's own comment describes, or whether the settings file should simply turn that
   guard on too, is not settled by anything read this session.
6. Once the port is open, the server logs, in order: that it is running and where; a fixed line
   about how many products it currently has priced by hand (unrelated to this section, left as
   found); and whether it actually managed to open its own scan-history file, naming the reason in
   plain words if it could not (everything else about the server keeps working either way; only
   scan history is affected).
7. **A direct contradiction, verified directly, between two files that are both current as of this
   session.** Which folder on disk actually holds the code and the working directory the server
   process runs from is itself named by one setting inside that same settings file, and there are
   two different, unreconciled answers to what that setting should be:
   - The setup instructions that first got a beta server running at all, and the checked-in
     template of the settings file itself (the one place in that template carrying a real,
     non-placeholder value rather than a blank to fill in, expressly because a session on the Mac
     had confirmed it), both name one single folder: the same working copy of the code that a
     person or an agent session edits directly and runs `git pull` against day to day.
   - A second, separate system, added later the same day and still the current, checked-in
     description of "how the beta server gets new code," describes something different on
     purpose: the actual running server is meant to be pointed at its own private, third copy of
     the code that nobody edits directly at all, kept apart from the working copy specifically so
     that a half-finished edit sitting in the working copy can never reach a live tester, with a
     second, disposable copy in between used only to test a pushed change before it is ever
     allowed to touch the copy the server actually runs from. That description explicitly says how
     to point the server back at the plain working copy if needed (stop the automated watcher,
     change that one setting back, restart), which only makes sense if the normal, current state is
     the *other* value, not the one the checked-in template still shows.
   Nothing read this session updates the settings-file template's own value to match the second
   description, and nothing read reconciles the two. Which folder the server is actually running
   from on the real machine right now cannot be verified from here at all: that setting lives only
   in a real, filled-in copy of the settings file on the Mac itself, which is deliberately kept out
   of this repository entirely (it is never committed), so answering it needs a session actually on
   that machine reading that one file, or asking the running process directly what working
   directory it holds open.
8. What restarts the server if it dies is the service-manager restart behavior from point 1, and a
   founder-run check (kill the process outright, confirm a new process id appears, confirm a plain
   request answers again) is the thing meant to prove that setting actually does something rather
   than merely claiming it. That job description's own comment names a real, unresolved gap
   directly, rather than assuming an answer either way: the kind of job description used here only
   ever starts once a person is logged into the Mac, so it does not by itself bring the server back
   after a full power cycle with nobody logged in, only after the process itself dies while the Mac
   stays up and logged in. Making it survive a true cold boot with no one logged in needs a
   different, system-wide kind of job description instead, installed with elevated rights; that
   rewrite is explicitly not done, since nobody asked for it, and is left named rather than quietly
   assumed one way or the other.
9. **An asymmetry, not stated as intentional anywhere read.** The tunnel half of this setup
   (below) is installed the opposite way: as a job that the operating system starts at boot time
   itself, independent of anyone being logged in at all. That means a full power cycle on the Mac
   with nobody logged in afterward would, on the evidence of points 8 and this one together, bring
   the public address back up while the app server behind it stays down, which would show a tester
   a "can't reach the server behind this address" response from the tunnel's own side rather than
   the app itself. Nothing read names this combination directly or says whether it has actually
   happened.

## Becoming reachable from a tester's phone: the tunnel

10. The Mac does not accept incoming connections directly. A tunnel client running on the Mac
    opens an outbound connection to a Cloudflare-run relay and keeps it open; a public hostname is
    then routed, on Cloudflare's own network, to that open connection rather than to any address
    the Mac itself holds. This is the only way a phone on a cellular network, with no path into the
    founder's home network at all, ever reaches this server.
11. Two shapes of tunnel exist, and the choice between them is sourced, not assumed: a disposable
    kind that can be started with one command and needs no setup, whose address is thrown away and
    stops working the moment that command's process ends, and which Cloudflare's own current
    documentation marks explicitly as meant for testing only, not for anything that has to keep
    working; and a named, durable kind that survives the client restarting and is the one actually
    used here, specifically because a disposable address that changes every time somebody restarts
    the Mac is not something a tester's phone (which remembers a fixed address it was given once)
    can keep using.
12. One step in the whole path to a working tunnel is a person's own action, not a script: opening
    a browser, signing into the founder's own account with the company that runs the tunnel
    service, and authorizing the command-line tool against it, which hands that tool back a
    certificate it keeps using afterward. That step is already done, confirmed directly on the Mac
    itself. Everything after it is meant to be entirely scripted, needing nobody at a keyboard.
13. The account behind that certificate holds exactly one domain, already used elsewhere by the
    founder for ordinary mail forwarding. Because of that, the setup goes out of its way to touch
    only one new subdomain under it, chosen specifically to read as plain infrastructure rather
    than naming the product, and to never touch the domain's own top-level records, so the mail
    forwarding already running there is left completely alone. That subdomain, filled in as a real
    value in the settings file (not a placeholder, since a hostname is visible in every request the
    app ever makes and so is not treated as a secret the way a credential is), is
    `relay.anjiawenda.com`; this is the actual public address a tester's phone is given.
14. From there, the remaining steps are all meant to be run as plain commands, none needing a
    person's judgment: create the named tunnel (which prints back a unique id and writes a
    credentials file that stays only on the Mac, never in this repository); point the one
    subdomain's DNS record at that tunnel, verified afterward by looking the domain up directly and
    confirming it now resolves through Cloudflare's own tunnel domain rather than an ordinary
    address; write a small routing file naming that one public hostname and the single local port
    on the Mac it should be handed off to, with every other, unnamed request refused outright rather
    than falling through to something unintended; and install the tunnel client as a proper
    background service so it starts on its own at boot, independent of anyone logging in, which is
    exactly the asymmetry named in point 9 above. A separate, alternate way of installing the same
    tunnel exists (through a web dashboard instead of the command line, using a different kind of
    credential), documented only as a fallback for a future session that might prefer it; it is
    explicitly not needed given that the certificate-based path already has everything it needs.
15. **A direct contradiction, verified directly, between what a procedure document says about
    itself and what other evidence dated after it shows.** The document describing steps 13 and 14
    above states, as its own current status, that none of those remaining steps have actually been
    run yet, and it has not been edited again since. Yet other, separate parts of this repository,
    changed several days after that document's last edit, exist specifically because real phone
    traffic was already passing through this exact public address by that point: one logging
    mechanism was added, by the founder's own account, because "a phone on the family beta sent
    about a hundred and twenty requests through the tunnel and left nothing behind" that could be
    traced; a working record of the same beta describes checking, through the public address
    itself rather than assuming it, that a phone carrying one teammate's own invite link was let
    in and correctly recorded, on a date after the tunnel document's own "not yet run" status was
    last written. Nothing read reconciles this: either the tunnel really was finished by hand on
    the Mac without the document being updated to say so, or the document's account of what has and
    has not been done cannot be trusted at face value. Both readings are stated here rather than
    either being assumed silently.
16. A verification recipe exists for confirming the tunnel is actually up, independent of whether
    the app server behind it is running yet: a plain web request to the public address should reach
    Cloudflare's own network (visible as a header naming Cloudflare in the response) and come back
    with a "service unavailable" answer, not a connection failure or a timeout, when nothing is yet
    listening on the local port the routing file names; once the app server is also running, the
    same request should come back with the app's own page instead.

## The invite phrase: the one door every one of these requests passes through first

17. Once the tunnel is up, this server sits on the open internet under an address anyone who
    obtains it can reach, in front of a model that costs real money per call. A shared phrase is
    required on almost every request specifically to stop a stranger who stumbles onto the address
    from spending that budget; the file that implements it is explicit that this is a bouncer, not
    a login, since anyone holding a forwarded link holds the phrase too.
18. The phrase travels in a request header, never in the address itself, on purpose: a value placed
    in the address ends up recorded in browser history, in the page a browser reports as where a
    request came from, and in ordinary server logs, which for a value meant to stay secret defeats
    the point.
19. Exactly one route is allowed to answer without that phrase at all: a plain uptime check, which
    is polled by something other than the app itself and which reveals nothing beyond whether the
    process is alive, how long it has been alive, and whether its scan log and its catalogue both
    attached successfully. The reasoning given directly in the code for exempting only this one
    route: a liveness check that itself needs a rotatable secret is a check that silently stops
    working on exactly the day the phrase is rotated, which is the day anyone most wants to know the
    server is still there.
20. A request that fails this check is refused with a status code that specifically means "this
    needs a credential you did not send," deliberately not the status that would mean "you are known
    and refused," and not the one that would hide the route as though it did not exist at all, since
    it plainly does, under an address someone was handed on purpose.
21. As of the founder's own change on the beta's second day, more than one phrase is accepted at
    once, each one carrying the name of whoever it was actually handed to, on his own stated reason:
    "so I know who's who." A request's phrase is looked up against every accepted phrase, and the
    first name it matches becomes "whose link this device came in through," recorded alongside every
    scan and every logged request from that point on; this is still not identity, only which link a
    device happened to use, since a link can always be forwarded to someone else.
22. When no phrase is configured on a machine at all (any laptop other than the Mac, and the
    automated test suite), the check is a function call that always says yes, which is exactly why
    it can sit in front of every one of these routes today without breaking anything that does not
    carry the beta's own settings.

## Reading what real testers did: the admin routes

23. A second, completely separate door exists for reading the beta's own recorded data from any
    machine, added on the founder's own request after a teammate, working entirely on his own
    machine with no access to the Mac at all, needed a way for his own agent session to see what
    real testers had actually done. It answers under one fixed address prefix reserved only for
    this purpose, and it is checked before the invite phrase from the previous section is ever
    looked at, which the code states directly: these particular routes take an entirely different
    phrase instead, so reading the data never requires knowing the beta's own tester-facing phrase
    at all, and a tester's own phrase does nothing here.
24. This second door is off by default in a very specific sense: unless its own settings hold a
    real phrase, every one of these routes answers exactly the same "not found" response a
    genuinely nonexistent address would, rather than a response that reveals the door exists but is
    merely locked. The phrase itself is compared the same constant-time way as the tester phrase
    above, in a request header of its own, never in the address.
25. Six things can be asked for, and each is read-only, described here by what it actually returns
    rather than by any name internal to the code:
    - Every table the beta's own data holds, together with the name and type of every column in
      each one, so a session on another machine can see the shape of the data before writing
      anything against it.
    - A block of plain query text, sent as the whole body of the request, run against that data and
      answered back as rows of JSON, capped at five thousand rows per request and at a fixed size
      for how much query text can be sent in one call at all.
    - A small, separate record, kept apart from the main scan data specifically so reading it never
      requires changing the shape of the scan database itself, pairing each device with the name
      behind whichever invite phrase it came in through, updated every time that device is seen
      again.
    - Lines from the plain record kept of every single request the server has answered (which
      route, its outcome, how long it took, a rough sense of which phone and where from, and
      whether it carried a phrase at all, though never the phrase's own text), optionally limited
      to everything after a given time.
    - A list of every time the phone's own shutter button was actually pressed, each one pointing
      at the exact camera frame captured at that moment and at every request and answer that single
      press caused, newest first.
    - The literal bytes of one file living inside the beta's own data folder (a saved camera frame
      or a saved photo, most often), addressed by a path relative to that folder; a path that tries
      to reach outside that one folder is refused outright rather than followed.
26. The read-only guarantee here is enforced structurally, not by inspecting the query text for
    forbidden words: the underlying database file is opened in a mode that will not accept a write
    at the database engine's own level, so a request carrying an outright deletion or a
    structure-destroying command is not blocked by any judgment about what the text says, it simply
    fails the moment the engine tries to execute it. This was checked directly this session against
    an automated test built specifically to prove it: it sends a deletion through this exact route,
    confirms the route reports failure, and then confirms directly afterward, through the same
    route, that the row it tried to delete is still there.
27. Practically, a session running on any other machine at all reaches this the same way it would
    reach any web address: an ordinary request to the same public hostname named in point 13, with
    the admin phrase in its own header, over the open internet through the same tunnel every tester's
    phone uses, never through any direct connection to the Mac itself. This is stated as deliberate,
    not incidental: the instructions given to a teammate say plainly that there is no login and no
    access to the Mac itself at all, on purpose, and that getting into the machine directly (running
    commands on it, restarting things by hand) would need the founder to approve a separate
    credential for that person's own machine, which nothing today actually needs, since reading the
    data and changing the code are both possible without it.
28. **A fragility found, not assumed to matter yet.** The request-log route's own time filter works
    by comparing a fixed slice of characters taken directly out of each raw logged line against the
    time it was given, rather than parsing each line and reading its own timestamp field by name.
    This depends on every logged line always writing its fields in exactly the same order, so that
    the timestamp always lands at the same character position; nothing enforces that ordering going
    forward, and a future change to what gets logged first could silently make this filter compare
    against the wrong characters instead of failing loudly.

## What is still open, named rather than guessed at

- Which of the two folders named in point 7 the real, live Mac is actually running the server out
  of right now cannot be settled from this machine, since the one file that would answer it is
  deliberately never committed to this repository; it needs a session actually on the Mac, or a
  question put to the running process itself.
- Whether the founder wants the server to keep running through a full, unattended reboot is named
  as an open question directly in the setup files themselves, not decided either way here.
- Whether the tunnel's remaining setup steps were actually completed by hand on the Mac (most
  likely, given later evidence of real tester traffic) or the later evidence reflects some other,
  unrecorded path to the same public address is not settled by anything read this session.
- Whether the missing explicit "this machine must have its catalogue" declaration (point 5) should
  be turned on directly, or whether the separate ongoing health check is considered sufficient on
  its own, is not decided anywhere read.
