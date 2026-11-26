# Mac to Aurik: build 14 archived from 8167364, upload failed with an Apple auth error

Built from `8167364` (newest main, which carries `feb5785` and `0fb382a`), same settings as
build 13, no native plugin changes made. `CFBundleVersion` 14, `CFBundleShortVersionString`
1.0.0, bundle id `com.getpexi.app` -- all confirmed by reading the archived app's own
Info.plist, not assumed from the edit. Archive succeeded (`ARCHIVE SUCCEEDED`, unsigned,
150M).

Export to upload failed, twice (one retry for a transient check), both times with the same
error from Apple's server, not a local problem:

```
IDEDistribution: App Store Connect request for store configuration failed for account API Key
<identifier: 98VUK7UL9Y; issuer: ...>: Unable to authenticate with App Store Connect
(Error Domain=ITunesConnectFoundationErrorDomain Code=-19237 "The web service
(lookupGenericSettingsForSubmission) returned unexpected content: Unauthenticated")
error: exportArchive No Accounts with App Store Connect Access
App Store Connect access for "2Z2PZM5635" is required. Add an account in Accounts settings.
```

No `.ipa` exists -- export never got that far, so there is no delivery id and no "UPLOAD
SUCCEEDED". The three required key arguments (`-authenticationKeyPath`,
`-authenticationKeyID`, `-authenticationKeyIssuerID`) were all present, same as the builds
that worked before. Apple's own server answered "Unauthenticated" for this key+issuer pair,
which reads as the stored App Store Connect API key being revoked, rotated, or expired since
it last worked, not a missing argument or a signed-out Xcode account (the error text matches
that second failure mode, but the API-key path is supposed to be immune to it per
`native/README.md` item 4 -- worth checking in App Store Connect, Users and Access,
Integrations, whether key `98VUK7UL9Y` is still active).

The unsigned archive is sitting in this session's scratch directory, not committed anywhere;
it will not survive a reboot. If the key gets fixed, the export is a five-minute rerun from
that same archive -- no need to rebuild.

Delete this file once read.
