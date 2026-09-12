# scripts/mac-catalogue-checksum.ps1
#
# Runs on WINDOWS. Produces the expected checksums for the catalogue right
# before it travels to the Mac. Full reasoning and the decision between the
# two transfer methods this pairs with are in mac/04-catalogue-acquire.md;
# this script implements the checksum half only.
#
# WHY A SET OF FILES, NOT ONE FILE: catalogue/src/schema.ts and
# catalogue/src/gaps.ts open the catalogue in WAL mode. Measured on this
# laptop moments before this script was written: catalogue.db at
# 4,140,003,328 bytes, catalogue.db-wal at 241,188,952 bytes and CHANGING
# (another lane is writing to the catalogue right now), catalogue.db-shm at
# 491,520 bytes. Hashing catalogue.db alone while a nonzero -wal file sits
# next to it checksums a file that is missing whatever is still in that
# log -- the checksum would pass and the copy would still be wrong, which
# is the exact "reached the right size and still failed" shape this whole
# item exists to catch, just one level deeper.
#
# This script does NOT decide whether to checkpoint first (folding the WAL
# into the single file, mac/04-catalogue-acquire.md's option (a)) or hash
# all three files as a set (option (b)). It hashes whatever files are
# present at the moment it runs. Run mac/checkpoint-wal.mjs first if option
# (a) was chosen and nothing is writing right now; run this script directly
# if option (b) was chosen because something IS writing right now.
#
# Usage:
#   powershell -File scripts\mac-catalogue-checksum.ps1 -DataDir C:\shin\catalogue\data
#
# Output: one line per file present (catalogue.db always; catalogue.db-wal
# and catalogue.db-shm only if they exist and are nonzero, since a
# zero-byte WAL/SHM after a checkpoint means there was nothing to carry),
# and a manifest file catalogue.manifest.sha256 written into DataDir
# holding the same lines. Copy every file the manifest lists to the Mac,
# together, in the same directory, along with the manifest itself --
# mac/04-verify-catalogue-checksum.sh reads the expected values out of it
# rather than needing them retyped by hand.

param(
    [Parameter(Mandatory = $true)]
    [string]$DataDir
)

$targets = @('catalogue.db', 'catalogue.db-wal', 'catalogue.db-shm')
$lines = @()

foreach ($name in $targets) {
    $path = Join-Path $DataDir $name
    if (-not (Test-Path $path)) {
        if ($name -eq 'catalogue.db') {
            Write-Error "No catalogue.db at $path -- nothing to checksum."
            exit 1
        }
        Write-Output "$name : not present, skipped"
        continue
    }
    $size = (Get-Item $path).Length
    if ($size -eq 0 -and $name -ne 'catalogue.db') {
        Write-Output "$name : present but 0 bytes, skipped (nothing pending)"
        continue
    }
    $hash = Get-FileHash -Algorithm SHA256 -Path $path
    $line = "$($hash.Hash.ToLower())  $name  $size"
    $lines += $line
    Write-Output $line
}

$manifestPath = Join-Path $DataDir 'catalogue.manifest.sha256'
Set-Content -Path $manifestPath -Value $lines -Encoding utf8

Write-Output ""
Write-Output "Manifest written to: $manifestPath"
Write-Output "Copy every file named in that manifest, plus the manifest itself,"
Write-Output "to the same directory on the Mac (catalogue/data/ under the repo,"
Write-Output "or wherever SHIN_CATALOGUE's directory points -- see"
Write-Output "mac/04-catalogue-acquire.md for which one)."
Write-Output ""
Write-Output "This is a snapshot at the moment this script ran. If another lane"
Write-Output "is still writing, re-run this script again immediately before the"
Write-Output "actual file copy starts, and copy the files fast enough that a"
Write-Output "second write between hashing and copying is unlikely -- there is"
Write-Output "no way to fully close that window without stopping the writer."
