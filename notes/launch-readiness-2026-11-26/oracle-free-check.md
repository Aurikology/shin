# Oracle Cloud Always Free: can it host Pexi production? (checked 2026-11-26)

Sources: Oracle's own pages only. Fetched 2026-11-26. Quotes under 25 words. "UNVERIFIED" = not found on an Oracle page.
Pages: [AF] https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm ;
[FAQ] https://www.oracle.com/cloud/free/faq/ ; [SD] https://www.oracle.com/contracts/docs/paas_iaas_universal_credits_3940775.pdf (Service Descriptions, effective 05-November-2026) ;
[HDP] https://www.oracle.com/contracts/docs/ocloud_hosting_delivery_policies_3089853.pdf (v3.13, Sept 2026).

## 1. What Always Free includes
- A1 (Arm): "All tenancies get the first 1,500 OCPU hours and 9,000 GB hours per month for free for VM instances using the VM.Standard.A1.Flex shape" [AF]. Then: "For Always Free tenancies, this is equivalent to 2 OCPUs and 12 GB of memory." [AF] (smaller than the older 4 OCPU / 24 GB; enough for Pexi's 2-4 GB).
- AMD micro: "All tenancies get up to two Always Free VM instances using the VM.Standard.E2.1.Micro shape" [AF]. Details [AF]: "1/8th of an OCPU", memory "1 GB" (not enough for Pexi, skip).
- Block volume: "All tenancies receive a total of 200 GB of Block Volume storage, and five volume backups" [AF]; boot volumes count toward it; min boot volume 47 GB.
- Egress: "As part of your Always Free resources, you get 10 TB per month of outbound data." [AF]
- Backup target: Object Storage "All tenancies get a total of 20 GB of Always Free" [AF] (combined object+archive).
- Region: "Oracle Cloud Free Tier is currently available in all regions where commercial Oracle Cloud Infrastructure service is available." [FAQ] Toronto (ca-toronto-1) and Montreal (ca-montreal-1) are listed commercial regions: https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm
- Home region: "You must create the Always Free compute instances in your home region." [AF] "You can't make changes after your tenancy is provisioned." (https://docs.oracle.com/en-us/iaas/Content/Identity/regions/managingregions.htm) and [SD]: "You will not be allowed to change the Home Region". A Canadian home region is chosen at signup ([SD]: home region "is the region that You choose when You sign up"). FAQ: "If your first-choice data region isn't available, please select an adjacent region." [FAQ]. Whether Toronto/Montreal specifically has A1 free capacity today: UNVERIFIED (see 4).

## 2. Idle reclamation
- [AF]: "Idle Always Free compute instances may be reclaimed by Oracle. Oracle will deem virtual machine and bare metal compute instances as idle if, during a 7-day period, the following are true:" CPU 95th percentile < 20%, network < 20%, memory < 20% (A1 only). All three must hold.
- Pexi on A1 (low steady traffic) would very likely sit under 20% on all three, so it would be deemed idle.
- Does PAYG exempt? UNVERIFIED on Oracle's docs pages. The docs section does not mention paid accounts at all. What Oracle does say: "Oracle doesn't charge for Always Free resources after you upgrade, and will only charge you for resource usage above the Always Free limits." [AF] and "with a paid account, you'll continue to have access to Always Free resources" [FAQ]. The reclaim sentence says "Always Free compute instances", not "Always Free accounts", so an upgraded tenancy's free-limit instance is arguably still one. Forum posts (not official policy, so not counted) claim upgrading avoids reclamation. oracle.com community announcement page returned 403, could not read it.
- Our own inference, not Oracle's: the test needs all three under 20%, so keeping any one above it (memory over 2.4 GB of 12 GB, or CPU p95 over 20%) should stop it counting as idle. Unconfirmed by Oracle.

## 3. Past the limits on PAYG
- "will only charge you for resource usage above the Always Free limits" [AF]. Billable egress is a rate-card item: "Outbound Data Transfer - Over 10 terabytes per month" (part B93311) [SD]. Extra storage/instances are billed at standard rates (same sentence).
- Cap: budgets are not a cap: "Use budgets to set soft limits on your Oracle Cloud Infrastructure spending." https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm Alerts are emails only.
- Quotas can block creation: "zero: Removes access to a cloud resource for a compartment." https://docs.oracle.com/en-us/iaas/Content/Quotas/Concepts/resourcequotas.htm [AF] also says "You can use compartment quotas to control resource consumption". Quotas limit creation, not egress. Whether quotas are usable on a free-only tenancy: UNVERIFIED.
- Pexi's use (2 OCPU/12 GB, ~50-150 GB disk, far below 10 TB egress) stays at $0 if it stays inside the free shape limits.

## 4. Capacity
- "If you receive an "out of host capacity" error ... this indicates a temporary lack of Always Free shapes in your home region." [AF]
- "Oracle is working to provide more capacity, though it might take several days before additional capacity is available in your home region." [FAQ]
- Oracle's remedies: try another availability domain, wait, or "upgrade your account to Pay as You Go" [AF]; "Pay As You Go accounts are subject to different capacity limits than Always Free accounts." [FAQ] (this says PAYG limits differ; it does not promise capacity).
- Any reservation mechanism for A1 free: UNVERIFIED (none found). Toronto and Montreal each have one availability domain (regions page), so no AD fallback.

## 5. Termination, suspension, data location
- [SD] Always Free terms: "If You only order Always Free Cloud Services, Oracle may end, upon 7 days' notice: (i) Your right to use an applicable Always Free Cloud Service(s)" or the account, if there is no activity in the 7 days before the notice.
- [SD]: "Oracle in its sole discretion may remove or modify an Always Free Cloud Service from the Always Free category ... at any time."
- [SD]: "Oracle in its sole discretion may terminate a customer's usage of an Always Free Cloud Service if Oracle identifies unusual activity"; [FAQ]: "Accounts left idle for 30 days or more may be deemed abandoned and become eligible for suspension or termination."
- [SD]: Continuity Policy, SLA and Support Policy "do not apply to Always Free Cloud Services". [FAQ]: "Customers using only Always Free resources are not eligible for Oracle Support." Paid use of a service brings the full policies "for all of Your use of that applicable Cloud Service" [SD].
- Data location [HDP]: "Your Content will be stored in the Data Center Region applicable to such Services." Oracle may replicate "to other locations within the identified Data Center Region". Caveat: HDP defines "North America" as US plus Canada, and the region is "the country or larger geographic region" chosen at activation. Whether a Toronto/Montreal choice is pinned to Canada only: UNVERIFIED (reads as the chosen data center location, not proven). Oracle's separate Data Processing Agreement for Cloud Services: UNVERIFIED (the oracle.com URL I tried returned 404; not read).

## 6. Production / commercial use
- No Oracle page found that forbids production or commercial use. FAQ: "Who should use ... a startup founder creating new systems with the intention of scaling later" and "As you move from development and testing to production scenarios, you may need to use resources outside of Always Free limits." [FAQ] This implies Always Free is aimed at dev/test, not a prohibition. "One Oracle Cloud Free Trial or Always Free account is permitted per person ... Creating or attempting to create multiple free accounts is prohibited." [FAQ]
- Not read: the Cloud Services Agreement (PDF) itself (linked from FAQ), section 9.3.

## Verdict: fits with conditions
Resources fit (2 OCPU/12 GB, 200 GB, 10 TB egress, Canada regions listed, $0). Reliability is the problem: no SLA, Oracle can end Always Free use on 7 days' notice, A1 may be reclaimed as idle (Pexi would be idle by the numbers), and "out of host capacity" in a one-AD region may block creation. Run it only with the nightly backup working off-box (restore tested elsewhere) and a fallback host ready; do not treat it as a reliable primary without upgrading to PAYG, and check the reclaim question in a ticket or sales chat first (UNVERIFIED for PAYG).
