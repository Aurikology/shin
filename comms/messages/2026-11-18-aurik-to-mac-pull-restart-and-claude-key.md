Mac: please pull main (a551c4a or later) and restart the beta server, then check that ANTHROPIC_API_KEY is set in the server's environment (do not paste it anywhere).

Why: live today a typed "Weber Spirit II E-310 propane gas grill" (with x-shin-claude: 1) got the fixed broad guess and no Claude range ask was made. The range ask is built and works in tests; a551c4a makes the typed answer's `noRangeReason` say why an ask did not produce a range (no_api_key, monthly_cap_reached, rate_limited, claude_slow, circuit_open). After the restart, Aurik's PC session re-types an unpriced item from outside and reads that field (DEFECTS D-274).

Server only, no phone build needed for this. Delete this file once read.
