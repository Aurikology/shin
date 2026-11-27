"""
oracle-claim -- keep asking Oracle for Pexi's free ARM server until it says yes.

WHY. Oracle's Always Free ARM servers (VM.Standard.A1.Flex) in us-chicago-1 were "Out of capacity"
in all three availability domains on 2026-11-27. Capacity frees up unpredictably, so a Windows
scheduled task runs this every 5 minutes. Each run makes one launch attempt per availability domain
and exits. Decided in chat 2026-11-27: 1 OCPU / 6 GB (Pexi's ~2 GB stays above Oracle's 20% idle
line for memory), now 2 OCPU / 12 GB first then 1 / 6, 100 GB boot volume, Ubuntu 24.04, cut-off 2026-12-10 then fall back to a paid VPS.

AUTH. ~/.oci/config holds the "Pexi Launcher" user, whose group may only manage instances and use
the network and volumes (policy pexi-launchers-policy). The private key never leaves this PC.

LOUD. Success, a permanent error (auth, limits, bad request) and the cut-off each raise a Windows
notification once and are recorded in ~/.oci/claim-status.json. "Out of capacity" and throttling
are the expected misses and stay quiet. Usage:

    py oracle-claim.py            # one attempt round (what the scheduled task runs)
    py oracle-claim.py --status   # print the status file
"""
import datetime
import json
import os
import subprocess
import sys

import oci

HOME = os.path.join(os.environ.get("USERPROFILE", os.path.expanduser("~")), ".oci")
CONFIG = os.path.join(HOME, "config")
STATUS = os.path.join(HOME, "claim-status.json")
NAME = "pexi-server"
VCN_NAME = "pexi-vcn"
SHAPE = "VM.Standard.A1.Flex"
# Full free allowance first: the catalogue (4.5 to 5.6 GB) answers fast only from page cache beside a
# ~2 GB server process (review-2026-11-27.md G-server). 1/6 is the fallback; A1.Flex resizes later.
SIZES = [(2, 12), (1, 6)]
BOOT_GB = 100
CUTOFF = datetime.date(2026, 12, 10)
SSH_KEY = ("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPK8HJi/zh6lFSTWLz7W5QDkCTCXgKeqXocw5mGEilcY "
           "pexi-server-admin")
ADS = ["mlIn:US-CHICAGO-1-AD-1", "mlIn:US-CHICAGO-1-AD-2", "mlIn:US-CHICAGO-1-AD-3"]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def load_status():
    try:
        with open(STATUS, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"attempts": 0}


def save_status(s):
    with open(STATUS, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=2)


def toast(title, body):
    """A Windows desktop notification. Falls back to stdout if PowerShell refuses."""
    ps = (
        "[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]>$null;"
        "$t=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(1);"
        "$x=$t.GetElementsByTagName('text');"
        f"$x.Item(0).AppendChild($t.CreateTextNode('{title}'))>$null;"
        f"$x.Item(1).AppendChild($t.CreateTextNode('{body}'))>$null;"
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pexi server')"
        ".Show([Windows.UI.Notifications.ToastNotification]::new($t))"
    )
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"TOAST FAILED ({r.stderr.strip()[:200]}): {title}: {body}")


def finish(s, state, message, code):
    """Record a final state and notify once per distinct state."""
    already = s.get("state") == state
    s.update(state=state, message=message, updated=now())
    save_status(s)
    if not already:
        toast(f"Pexi server: {state}", message.replace("'", ""))
    print(f"{state}: {message}")
    sys.exit(code)


def main():
    if "--status" in sys.argv:
        print(json.dumps(load_status(), indent=2))
        return
    s = load_status()
    if s.get("state") in ("created", "stopped-cutoff"):
        print(f"nothing to do, state is {s['state']}")
        return
    if datetime.date.today() > CUTOFF:
        finish(s, "stopped-cutoff", f"No free Oracle server by {CUTOFF}. Time for the paid fallback.", 0)

    cfg = oci.config.from_file(CONFIG)
    tenancy = cfg["tenancy"]
    compute = oci.core.ComputeClient(cfg)
    net = oci.core.VirtualNetworkClient(cfg)

    try:
        live = [i for i in compute.list_instances(tenancy, display_name=NAME).data
                if i.lifecycle_state not in ("TERMINATED", "TERMINATING")]
        if live:
            finish(s, "created", f"{NAME} already exists ({live[0].lifecycle_state}).", 0)
        vcn = next(v for v in net.list_vcns(tenancy).data if v.display_name == VCN_NAME)
        subnet = next(sn for sn in net.list_subnets(tenancy, vcn_id=vcn.id).data
                      if not sn.prohibit_public_ip_on_vnic)
        images = compute.list_images(tenancy, operating_system="Canonical Ubuntu",
                                     operating_system_version="24.04", shape=SHAPE,
                                     sort_by="TIMECREATED", sort_order="DESC").data
        image = next(im for im in images if "Minimal" not in im.display_name)
    except StopIteration:
        finish(s, "error", "Could not find the pexi-vcn public subnet or an Ubuntu 24.04 ARM image.", 2)
    except oci.exceptions.ServiceError as e:
        # A new key flapped between 200 and 401 for minutes on 2026-11-27, so a sign-in refusal only
        # counts as an error after 6 runs in a row (30 minutes at the 5-minute schedule).
        if e.status == 401:
            s["auth_fails"] = s.get("auth_fails", 0) + 1
            if s["auth_fails"] < 6:
                save_status(s)
                print(f"sign-in refused ({s['auth_fails']} in a row), retrying next run")
                return
        finish(s, "error", f"Oracle refused a lookup: {e.status} {e.code}.", 2)
    s["auth_fails"] = 0

    s["attempts"] = s.get("attempts", 0) + 1
    s.update(state="trying", last_try=now())
    for (ocpus, memory_gb), ad in [(size, ad) for size in SIZES for ad in ADS]:
        details = oci.core.models.LaunchInstanceDetails(
            availability_domain=ad, compartment_id=tenancy, display_name=NAME, shape=SHAPE,
            shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(
                ocpus=ocpus, memory_in_gbs=memory_gb),
            source_details=oci.core.models.InstanceSourceViaImageDetails(
                image_id=image.id, boot_volume_size_in_gbs=BOOT_GB),
            create_vnic_details=oci.core.models.CreateVnicDetails(
                subnet_id=subnet.id, assign_public_ip=True),
            metadata={"ssh_authorized_keys": SSH_KEY},
        )
        try:
            inst = compute.launch_instance(details).data
        except oci.exceptions.ServiceError as e:
            text = (e.message or "").lower()
            if "capacity" in text or e.status == 429:
                s["last_miss"] = f"{ocpus}c/{memory_gb}GB {ad}: {e.status} {e.code}"
                continue
            finish(s, "error", f"Launch refused in {ad}: {e.status} {e.code}: {(e.message or '')[:160]}", 2)
        finish(s, "created", f"{NAME} launched in {ad} with {ocpus} core(s) and {memory_gb} GB "
                             f"(id ends {inst.id[-8:]}).", 0)
    save_status(s)
    print(f"no capacity this round (attempt {s['attempts']}): {s.get('last_miss')}")


if __name__ == "__main__":
    main()
