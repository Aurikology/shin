# scripts/mac-catalogue-checksum.ps1
#
# Runs on WINDOWS. Produces the expected checksum for the 4.13 GB catalogue
# before it is copied to the Mac. The matching Mac-side check is
# mac/04-verify-catalogue-checksum.sh, which recomputes the same hash over
# the copied file and compares it to the .sha256 file this script writes.
#
# Not run by this write-up. Run before copying, and only after
# mac/checkpoint-wal.mjs has been run against the same file, so the WAL
# journal is folded in and the single file this hashes is the whole
# database.
#
# Usage:
#   powershell -File scripts\mac-catalogue-checksum.ps1 -DbPath C:\shin\catalogue\data\catalogue.db
#
# Expected output: one line of the form
#   <64 hex characters>  catalogue.db
# and a file written next to the database named catalogue.db.sha256
# containing that same line. Copy catalogue.db.sha256 to the Mac along with
# catalogue.db itself; 04-verify-catalogue-checksum.sh reads the expected
# value out of it rather than needing the value retyped by hand.

param(
    [Parameter(Mandatory = $true)]
    [string]$DbPath
)

if (-not (Test-Path $DbPath)) {
    Write-Error "No file at $DbPath"
    exit 1
}

$hash = Get-FileHash -Algorithm SHA256 -Path $DbPath
$name = Split-Path -Leaf $DbPath
$line = "$($hash.Hash.ToLower())  $name"

$outPath = "$DbPath.sha256"
Set-Content -Path $outPath -Value $line -Encoding utf8 -NoNewline

Write-Output $line
Write-Output "Written to: $outPath"
Write-Output "Copy both $name and $name.sha256 to the Mac, in the same directory."
