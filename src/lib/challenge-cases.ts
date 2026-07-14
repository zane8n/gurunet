import type { ChallengeBlueprint } from "@/lib/domain";

export type ChallengeCasePacket = {
  caseId: string;
  title: string;
  background: string;
  evidence: string[];
  objective: string;
  allowedTools: string[];
  lab: string;
  solution: string;
};

type CaseCore = Omit<ChallengeCasePacket, "caseId" | "allowedTools" | "lab"> & {
  tools?: string[];
  exercise?: string;
};

const toolsByDiscipline: Record<string, string[]> = {
  networking: ["show commands", "running configuration", "logs and counters", "targeted path tests", "configuration diff", "rollback checkpoint"],
  linux_systems: ["systemctl", "journalctl", "ss", "ps", "stat/ls", "read-only config inspection"],
  cybersecurity: ["identity and audit logs", "timeline worksheet", "indicator search", "configuration history", "evidence-preserving containment", "owner validation"],
  software_engineering: ["source diff", "unit tests", "integration tests", "structured logs", "reproduction harness", "feature flag or scoped rollback"],
  automation_scripting: ["language runtime", "static analysis", "fixture data", "dry-run mode", "unit tests", "version-control diff"],
  cloud_devops: ["provider audit logs", "deployment diff", "metrics and traces", "read-only state inspection", "staging validation", "scoped rollback"],
  data_ai: ["data profiler", "slice metrics", "baseline comparison", "evaluation notebook", "sample audit", "data-quality report"],
  applied_engineering: ["sensor trends", "maintenance records", "controlled test", "remote inspection checklist", "baseline measurements", "stop criteria"],
  technical_writing: ["source procedure", "incident record", "audience profile", "style guide", "peer review checklist", "validation walk-through"],
};

export function buildCoherentChallengeCase(
  blueprint: ChallengeBlueprint,
  disciplineId: string,
): ChallengeCasePacket {
  const topic = normalize(blueprint.primaryTopic);
  const variant = stableIndex(`${blueprint.nonce}:${topic}:case`, 3);
  const core = disciplineId === "networking"
    ? networkingCase(topic, variant)
    : disciplineId === "linux_systems"
      ? linuxCase(topic, variant)
      : disciplineId === "cybersecurity"
        ? securityCase(topic, variant)
        : disciplineId === "software_engineering"
          ? softwareCase(topic, variant)
          : disciplineId === "automation_scripting"
            ? automationCase(topic, variant)
            : disciplineId === "cloud_devops"
              ? cloudCase(topic, variant)
              : disciplineId === "data_ai"
                ? dataCase(topic, variant)
                : disciplineId === "technical_writing"
                  ? writingCase(topic, variant)
                  : engineeringCase(topic, variant);

  return {
    caseId: `${disciplineId}-${slug(blueprint.primaryTopic)}-${variant + 1}`,
    title: core.title,
    background: core.background,
    evidence: core.evidence,
    objective: core.objective,
    allowedTools: core.tools ?? toolsByDiscipline[disciplineId] ?? toolsByDiscipline.applied_engineering,
    lab: core.exercise ?? "Reproduce the supplied initial state in an isolated environment, introduce only the stated defect, and capture before, fault, and verified-after evidence.",
    solution: core.solution,
  };
}

function networkingCase(topic: string, variant: number): CaseCore {
  if (topic.includes("vlan")) {
    if (variant === 0) {
      return {
        title: "Payroll VLAN missing on one side of an access uplink",
        background: "At 09:12, users moved to VLAN 120 on ACC-03 lost access to gateway 10.12.0.1. Voice VLAN 40 and management VLAN 10 remain healthy. The only change was replacement of ACC-03; its uplink Gi1/0/48 connects to DIST-01 Gi2/0/7.",
        evidence: [
          "[A] ACC-03# show interfaces trunk: Gi1/0/48 trunking, native VLAN 999, allowed VLANs 10,40,120,999.",
          "[B] DIST-01# show interfaces trunk: Gi2/0/7 trunking, native VLAN 999, allowed VLANs 10,40,999.",
          "[C] ACC-03# show mac address-table vlan 120: 18 dynamic entries; DIST-01 has 0 dynamic VLAN 120 entries on Gi2/0/7.",
          "[D] A VLAN 40 phone on the same switch reaches 10.40.0.1 in 2 ms; a VLAN 120 client receives no ARP reply from 10.12.0.1.",
        ],
        objective: "Identify the configuration mismatch, choose the minimum production change, and prove that VLAN 120 is restored without replacing the existing trunk allowlist.",
        exercise: "Build two switches with an 802.1Q trunk, omit VLAN 120 from only the distribution-side allowlist, and capture trunk, MAC-table, ARP, and recovery evidence.",
        solution: "The distribution-side trunk excludes VLAN 120. Add VLAN 120 to the existing Gi2/0/7 allowed list with additive syntax, verify it appears in the forwarding VLAN list, confirm MAC learning on DIST-01, and retest the gateway. Do not overwrite the allowlist or change native VLAN 999. Roll back by removing only VLAN 120 if validation exposes an unintended path.",
      };
    }
    return {
      title: "Access-port VLAN drift after a desk move",
      background: "A finance workstation on ACC-07 Gi1/0/24 receives 10.70.30.84/24 but its documented subnet is 10.70.20.0/24. The desk move ticket says the port should match working port Gi1/0/23. The IP phone on Gi1/0/24 remains registered through voice VLAN 60.",
      evidence: [
        "[A] show run interface Gi1/0/23: switchport access vlan 20; switchport voice vlan 60; spanning-tree portfast.",
        "[B] show run interface Gi1/0/24: switchport access vlan 30; switchport voice vlan 60; spanning-tree portfast.",
        "[C] show mac address-table interface Gi1/0/24: data MAC 54bf.64aa.1024 in VLAN 30 and phone MAC 001d.aabb.6024 in VLAN 60.",
        "[D] DHCP lease log: 54:bf:64:aa:10:24 assigned 10.70.30.84 by scope FIN-GUEST at 09:06.",
      ],
      objective: "Use the working-port baseline and observed MAC placement to define a scoped correction, pre-checks, verification, and rollback.",
      exercise: "Configure adjacent access ports with different data VLANs and a shared voice VLAN, then verify that changing only the data VLAN preserves phone service.",
      solution: "Gi1/0/24 is in data VLAN 30 instead of documented VLAN 20; voice VLAN 60 is already correct. Confirm the ticket, endpoint identity, and VLAN 20 availability, then change only the access VLAN. Renew or reconnect the client as coordinated, verify a VLAN 20 lease and gateway reachability, and confirm the phone stays in VLAN 60. Roll back Gi1/0/24 to VLAN 30 if the documentation or endpoint identity is disproved.",
    };
  }
  if (topic === "stp") {
    return variant === 0 ? {
      title: "Unexpected access switch became the spanning-tree root",
      background: "After a lab switch was connected to the campus, VLAN 210 traffic began taking an indirect path and access uplink Gi1/0/48 alternates between forwarding and blocking. DIST-A is the intended root; no physical link is down.",
      evidence: [
        "[A] DIST-A# show spanning-tree vlan 210: Root ID priority 24576, address 70b3.d500.2100; this bridge priority 32768.",
        "[B] ACC-LAB# show spanning-tree vlan 210: This bridge is the root; priority 24576, address 70b3.d500.2100.",
        "[C] Change diff on ACC-LAB: spanning-tree vlan 210 priority 24576 added at 08:47.",
        "[D] DIST-A log: %SPANTREE-5-ROOTCHANGE VLAN0210 root changed via Gi1/0/48 at 08:48:03.",
      ],
      objective: "Prove the root-role error and propose the smallest reversible correction without disabling STP or shutting the campus uplink.",
      solution: "ACC-LAB was configured with a superior VLAN 210 bridge priority and became root. Validate the intended root design, remove or raise only ACC-LAB's VLAN 210 priority, then confirm DIST-A becomes root and topology changes stabilize. Do not disable STP. Restore the previous line only if the approved root design contradicts the stated baseline.",
    } : {
      title: "Layer-2 loop isolated to an undocumented office bridge",
      background: "SW-CORE-01 CPU is 88% and users on VLAN 30 report intermittent service. A contractor connected an unmanaged switch. Only one access port may be disabled remotely; Gi1/0/18 has a documented IP phone and Gi1/0/22 is undocumented.",
      evidence: [
        "[A] show processes cpu sorted: STP process 69.4% over 5 seconds; total CPU 88%/71%.",
        "[B] %SW_MATM-4-MACFLAP_NOTIF: 0050.56aa.bb01 VLAN 30 flapping between Gi1/0/18 and Gi1/0/22.",
        "[C] show spanning-tree summary: 4,287 topology changes; last change 00:00:07 ago.",
        "[D] show cdp neighbors: Gi1/0/18 IP Phone; Gi1/0/22 has no advertised neighbor.",
      ],
      objective: "Select and justify the safest containment port, give exact commands and stop conditions, and define verification and long-term loop prevention.",
      solution: "The converging MAC-flap, STP CPU, and topology-change evidence indicates a layer-2 loop involving Gi1/0/18 and Gi1/0/22. Gi1/0/22 is the safer single-port containment candidate because Gi1/0/18 has a known phone. Inspect both interfaces, record counters/config, shut only Gi1/0/22, and verify CPU, MAC flaps, STP changes, and user service. If evidence worsens or the wrong endpoint is affected, no shut Gi1/0/22 and escalate. Add edge protections and controlled contractor/change practices after validating the port role.",
    };
  }
  if (topic === "ospf") {
    return {
      title: variant === 0 ? "OSPF adjacency stuck in EXSTART after an MTU change" : "OSPF neighbors rejected by an area mismatch",
      background: variant === 0
        ? "R-BR1 and R-HUB1 lost route exchange after the carrier increased R-HUB1's subinterface MTU. The point-to-point link still passes small pings."
        : "R-BR2 stopped learning campus routes after a templated interface change. The link and IP addressing remain up/up.",
      evidence: variant === 0 ? [
        "[A] R-BR1# show ip ospf neighbor: 10.0.0.1 EXSTART/BDR on Gi0/0.412 for 00:18:42.",
        "[B] R-BR1# show interface Gi0/0.412: MTU 1500; R-HUB1 Gi0/1.412: MTU 1600.",
        "[C] R-BR1 debug excerpt: Nbr 10.0.0.1: Database Description packet too large, mtu 1600.",
        "[D] ping 172.31.41.1 size 1400 df-bit succeeds; size 1510 df-bit fails.",
      ] : [
        "[A] R-BR2# show ip ospf interface Gi0/0: Area 0, process 10, network point-to-point.",
        "[B] R-HUB2# show ip ospf interface Gi0/2: Area 20, process 10, network point-to-point.",
        "[C] R-BR2 log: %OSPF-4-ERRRCV: Received invalid packet: mismatch area ID, from 172.31.20.1.",
        "[D] show interfaces Gi0/0: line protocol up; 0 input errors; IP 172.31.20.2/30.",
      ],
      objective: "Identify the adjacency blocker, distinguish it from basic link failure, and give a scoped correction with adjacency and route verification.",
      solution: variant === 0
        ? "The peers have different interface MTUs, preventing database-description exchange. Confirm the approved carrier MTU, align both ends rather than masking the issue with mtu-ignore unless explicitly justified, then verify FULL adjacency, route installation, and large DF traffic."
        : "The peers are configured in different OSPF areas. Confirm the intended area and change only the incorrect interface assignment, then verify FULL adjacency, LSDB exchange, expected routes, and path reachability.",
    };
  }
  if (topic === "bgp") {
    return {
      title: "A prefix-list permits the session but suppresses the new route",
      background: "The eBGP session to ISP-B is Established, but new public prefix 203.0.113.0/24 is not advertised. Existing 198.51.100.0/24 service remains healthy, so resetting both providers would create avoidable risk.",
      evidence: [
        "[A] show bgp ipv4 unicast summary: 192.0.2.9 Established, 184 prefixes received.",
        "[B] show route-map ISP-B-OUT: sequence 10 match ip address prefix-list PUBLIC-OUT; 4 policy matches.",
        "[C] show ip prefix-list PUBLIC-OUT: seq 5 permit 198.51.100.0/24; no entry for 203.0.113.0/24.",
        "[D] show bgp ipv4 unicast 203.0.113.0/24: valid, best, locally originated; advertised-routes to 192.0.2.9 omits it.",
      ],
      objective: "Locate the outbound policy gap and specify the least disruptive policy change, soft refresh, verification, and rollback.",
      solution: "The session is healthy and the route exists locally, but PUBLIC-OUT does not permit 203.0.113.0/24. Add only the approved exact prefix, validate route-map counters/config, perform an outbound soft refresh if required, and confirm advertised-routes and external reachability. Remove the new prefix-list entry to roll back.",
    };
  }
  if (topic === "nat") {
    return {
      title: "A new inside subnet is absent from the NAT classifier",
      background: "Clients in 10.44.30.0/24 can reach the edge router but not the internet. Existing 10.44.10.0/24 clients remain healthy. The new VLAN was routed this morning; no ISP alarm is active.",
      evidence: [
        "[A] show ip nat translations: active translations only for inside local 10.44.10.0/24.",
        "[B] show access-lists NAT-INSIDE: 320 matches permit 10.44.10.0 0.0.0.255; no 10.44.30.0/24 entry.",
        "[C] show run | include ip nat: ip nat inside source list NAT-INSIDE interface Gi0/0 overload.",
        "[D] From 10.44.30.21: ping 10.44.30.1 succeeds; trace to 1.1.1.1 stops at the edge; NAT hit count does not increase.",
      ],
      objective: "Prove whether classification, routing, or ISP reachability is blocking translation and provide the minimum correction and validation.",
      solution: "The new subnet is routed to the edge but absent from NAT-INSIDE, so it never qualifies for overload. Add the exact approved 10.44.30.0/24 permit, verify ACL hits and a new translation, then test DNS and internet traffic. Remove only that permit to roll back.",
    };
  }
  if (topic.includes("acl")) {
    return {
      title: "A broad deny shadows the remote-management permit",
      background: "After ACL MGMT-IN was resequenced on interface Vlan207, SSH from 10.10.40.25 to 10.20.7.11 fails while console access remains available. The intended policy permits the admin subnet and denies other 10.10.0.0/16 sources.",
      evidence: [
        "[A] 10 deny ip 10.10.0.0 0.0.255.255 any log (47 matches).",
        "[B] 20 permit tcp 10.10.40.0 0.0.0.255 host 10.20.7.11 eq 22 (0 matches).",
        "[C] interface Vlan207: ip access-group MGMT-IN in; IP address 10.20.7.11/24.",
        "[D] Log at 10:04:17: %SEC-6-IPACCESSLOGP list MGMT-IN denied tcp 10.10.40.25 -> 10.20.7.11(22), 1 packet.",
      ],
      objective: "Identify the exact shadowing line, propose a safe sequence correction, and show how hit counts and SSH testing prove the result.",
      solution: "Sequence 10 matches 10.10.40.25 before sequence 20 can permit SSH. Insert the exact management permit before the broad deny, preserve the default-deny intent, and validate from an authorized source while confirming unauthorized sources remain blocked. Roll back the inserted line if the approved source definition is wrong.",
    };
  }
  if (topic === "qos") {
    return {
      title: "Voice markings are erased at the access trust boundary",
      background: "Calls from one floor become choppy only during backup traffic. The WAN policy has an LLQ for EF traffic and shows no configuration change. Phones connect through ACC-12; other floors are unaffected.",
      evidence: [
        "[A] ACC-12 Gi1/0/12 ingress capture counters: phone sends DSCP EF (46), uplink egress class-default sees DSCP 0.",
        "[B] show mls qos interface Gi1/0/12: trust state not trusted; trust device none.",
        "[C] WAN-EDGE policy-map: VOICE priority 20%; 0 matched packets from ACC-12 subnet during test call.",
        "[D] ACC-11 working phone port: trust device cisco-phone and trust cos; WAN VOICE class matches increase during a call.",
      ],
      objective: "Locate where classification is lost, propose a bounded trust configuration, and verify both voice treatment and abuse controls.",
      solution: "ACC-12 is resetting phone markings before the WAN classifier. Compare the approved phone-port template, apply trust only to authenticated/recognized phone ports rather than all access traffic, then verify EF survives the uplink and WAN VOICE counters increase under load. Revert the port trust lines if classification or endpoint validation fails.",
    };
  }
  if (topic === "wireless") {
    return {
      title: "RADIUS rejects otherwise valid clients after clock drift",
      background: "Corporate Wi-Fi authentication began failing on APs at Building C after their NTP source changed. Guest PSK Wi-Fi still works, RF health is normal, and the identity service reports expired request timestamps.",
      evidence: [
        "[A] AP-C17 clock: 14:26:41; controller clock: 14:19:08; offset 7m33s.",
        "[B] RADIUS log: Access-Reject for alice@example, reason request timestamp outside 300-second window.",
        "[C] AP-C17 show ntp status: unsynchronised, peer 10.90.0.18 unreachable.",
        "[D] AP-B11 on the same SSID is NTP-synchronised and completes 802.1X in 186 ms.",
      ],
      objective: "Rank RF, credential, and time-synchronisation hypotheses; define safe restoration and prove authentication without weakening RADIUS policy.",
      solution: "The building AP clock drift exceeds the RADIUS acceptance window. Restore the approved reachable NTP source, verify synchronisation and clock offset, then retest one controlled 802.1X client and monitor rejects. Do not widen the RADIUS timestamp window or bypass authentication as a first fix.",
    };
  }
  return {
    title: "Path MTU black hole visible in a packet trace",
    background: "A web portal completes TCP handshakes across an IPsec path but stalls when returning larger responses. Small pings work. The issue began after tunnel overhead increased; the application and DNS are healthy.",
    evidence: [
      "[A] Trace: SYN MSS 1460, SYN-ACK MSS 1460, HTTP request sent, server retransmits a 1460-byte segment three times.",
      "[B] ping server size 1360 df-bit succeeds; size 1400 df-bit fails.",
      "[C] Edge log: ICMP fragmentation-needed messages denied by policy OUTSIDE-IN.",
      "[D] Tunnel effective MTU calculation: 1500 physical MTU - 96 bytes overhead = 1404 bytes.",
    ],
    objective: "Explain the packet sequence, distinguish PMTUD failure from application latency, and recommend a safe correction with proof.",
    solution: "The handshake and small packets pass, but larger DF traffic exceeds the effective tunnel MTU and ICMP fragmentation-needed is blocked. Permit the required ICMP control message and/or apply a justified TCP MSS clamp at the correct edge, then verify large responses complete without retransmissions. Do not disable DF globally.",
  };
}

function linuxCase(topic: string, variant: number): CaseCore {
  if (topic.includes("systemd") || topic.includes("journal")) return {
    title: "A systemd override points the service at a retired environment file",
    background: "api.service is active but returns HTTP 503 after a deployment. A manual shell launch works. The unit was changed through a drop-in at 11:14.",
    evidence: [
      "[A] systemctl status api.service: active (running); ExecStart=/opt/api/bin/server; restart count 0.",
      "[B] journalctl -u api.service: ERROR database host db-old.internal: Name or service not known.",
      "[C] systemctl cat api.service: drop-in 20-env.conf sets EnvironmentFile=/etc/api/legacy.env.",
      "[D] /etc/api/current.env contains DB_HOST=db-prod.internal; legacy.env contains DB_HOST=db-old.internal.",
    ],
    objective: "Explain why process state is not service health, identify the effective configuration source, and give a safe correction and validation sequence.",
    solution: "The drop-in makes systemd load the retired environment file. Correct or remove only the erroneous override, run daemon-reload, coordinate one service restart, then verify effective properties, logs, health endpoint, and database connectivity. Restore the drop-in to roll back if the current environment file is invalid.",
  };
  if (topic.includes("permission")) return {
    title: "Cache ownership changed during maintenance",
    background: "A production web host returns intermittent 502 responses after cache cleanup. app.service is running and listening on 127.0.0.1:8080; active traffic makes an unplanned restart undesirable.",
    evidence: [
      "[A] journalctl -u app.service: permission denied opening /var/lib/app/cache/session.db.",
      "[B] stat /var/lib/app/cache: owner root:root, mode 0700, changed 08:42.",
      "[C] systemctl show app.service -p User -p Group: User=appsvc, Group=appsvc.",
      "[D] /var/lib/app/cache parent is appsvc:appsvc mode 0750 in the configuration baseline.",
    ],
    objective: "Prove the permission boundary that fails and propose the narrowest ownership or mode correction without broad chmod advice.",
    solution: "The appsvc process cannot traverse/write the root-owned 0700 cache directory. Confirm the expected baseline and affected files, restore only the required appsvc ownership/mode, then verify a new session file, clear journal errors, and test the health endpoint. Preserve the old metadata for rollback.",
  };
  if (topic.includes("storage")) return {
    title: "Writes fail because the filesystem exhausted inodes, not bytes",
    background: "A build worker reports no space left on device although the workspace volume shows 38% byte usage. Existing files can be read and the mount remains read-write.",
    evidence: [
      "[A] df -h /var/lib/runner: 200G total, 76G used, 124G available.",
      "[B] df -i /var/lib/runner: 6,553,600 inodes, 6,553,600 used, 100% IUse.",
      "[C] find summary: /var/lib/runner/cache/npm contains 6.1M files under 4 KB.",
      "[D] journal: runner[2218] open cache/tmp-88312: ENOSPC; no ext4 I/O errors.",
    ],
    objective: "Distinguish inode exhaustion from capacity and filesystem corruption, then define a scoped cleanup and prevention plan.",
    solution: "The volume has free bytes but no free inodes due to millions of cache files. Pause only affected jobs, identify cache retention ownership, delete a reviewed bounded cache cohort, and verify inode recovery and new file creation. Add file-count monitoring and retention; do not format or indiscriminately delete the workspace.",
  };
  if (topic.includes("process")) return {
    title: "One worker leaks file descriptors under sustained load",
    background: "A search service degrades after several hours and recovers when one worker is replaced. CPU and memory remain below 60%; the process limit is 1024 descriptors.",
    evidence: [
      "[A] ls /proc/1842/fd | wc -l: 1018; sibling worker PID 1843: 146.",
      "[B] journal: accept4() failed: Too many open files at 13:52:09.",
      "[C] lsof -p 1842 summary: 812 ESTABLISHED sockets to 10.8.4.20:9200.",
      "[D] ss state time-wait count is normal; application metric open_client_sessions rises without returning to baseline.",
    ],
    objective: "Identify the limiting resource, choose immediate containment, and distinguish a temporary limit increase from a durable fix.",
    solution: "PID 1842 is leaking or retaining backend sockets until it reaches its descriptor limit. Drain/replace the single worker if supported, preserve diagnostics, and verify descriptor count and errors. A higher limit may delay recurrence but is not the root fix; investigate connection lifecycle and add descriptor/session alerts.",
  };
  if (topic.includes("network")) return {
    title: "A host route sends the database subnet to the wrong gateway",
    background: "One Linux application node cannot reach 10.80.4.12:5432 after a VPN test. Peer nodes on the same VLAN remain healthy, and local DNS resolves correctly.",
    evidence: [
      "[A] ip route get 10.80.4.12: via 192.0.2.1 dev tun0 src 192.0.2.44.",
      "[B] ip route: 10.80.4.0/24 via 192.0.2.1 dev tun0 metric 20; 10.80.0.0/16 via 10.20.1.1 dev ens192 metric 100.",
      "[C] ip link show tun0: state DOWN; route remains installed by vpn-test.service.",
      "[D] Peer node route get 10.80.4.12: via 10.20.1.1 dev ens192; TCP connection succeeds in 4 ms.",
    ],
    objective: "Prove the host-specific path error and define a reversible route/service correction with application-level verification.",
    solution: "A more-specific stale route sends the database subnet to a down test tunnel. Confirm ownership, remove the stale route or stop/fix the responsible VPN test service, and verify route selection plus TCP 5432 and application health. Restore only if the route was approved and the tunnel is made operational.",
  };
  return {
    title: variant === 0 ? "A shell cleanup loop breaks on spaces and symlinks" : "A Bash pipeline hides the command that actually failed",
    background: variant === 0
      ? "A cleanup script passed against simple fixtures but production paths include spaces and a symlink to shared storage. It must support a reviewed dry run before deletion."
      : "A backup script reported success even though compression failed; the final upload command accepted an empty stream.",
    evidence: variant === 0 ? [
      "[A] for f in $(find /var/log/app -mtime +14); do rm -rf $f; done",
      "[B] Dry-run output splits '/var/log/app/old batch/app.log' into three arguments.",
      "[C] find output includes '/var/log/app/current -> /mnt/shared/current'.",
      "[D] Requirement: delete regular .log files only; never directories or symlink targets.",
    ] : [
      "[A] tar -czf - /srv/data | upload-backup --stdin; echo 'backup complete'",
      "[B] tar stderr: Cannot open /srv/data/private: Permission denied; exit 2.",
      "[C] upload-backup exit 0 and object size 128 bytes; script exit 0.",
      "[D] Shell options at runtime: errexit off, nounset off, pipefail off.",
    ],
    objective: "Repair the Bash behavior with explicit scope, observable failure handling, deterministic tests, and a non-destructive dry run.",
    solution: variant === 0
      ? "Avoid command substitution and recursive rm. Constrain find to regular files and the intended filesystem/path, consume null-delimited names with quoting, print the exact candidate set in dry-run mode, and test spaces and symlinks."
      : "Enable and deliberately handle pipeline failure, validate the archive before upload, reject empty/tiny artifacts, and emit success only after every required stage succeeds. Add fixtures for unreadable files and failed upload.",
  };
}

function securityCase(topic: string, variant: number): CaseCore {
  if (topic.includes("auth")) return {
    title: "A service-account key changed immediately before an unusual login",
    background: "A privileged deployment account logged in from an internal build host without an approved change. External password failures occurred earlier but did not authenticate.",
    evidence: [
      "[A] 01:38:22 failed password for invalid user admin from 185.22.14.8.",
      "[B] 01:43:06 accepted publickey for svc_deploy from 10.30.4.18.",
      "[C] authorized_keys mtime 01:38:11; SHA-256 differs from the 00:00 integrity baseline.",
      "[D] CI inventory assigns 10.30.4.18 to runner-07, but its last approved deployment ended 23:10.",
    ],
    objective: "Build a confidence-labelled timeline, identify the material signal, and choose containment that preserves evidence and limits business impact.",
    solution: "The successful service-account login and preceding key modification are material; the external failures are context, not proof of compromise. Preserve logs/key metadata, isolate or restrict the specific credential/session as policy permits, identify activity on runner-07, and validate ownership before broad blocking. Rotate the affected key if unauthorized.",
  };
  if (topic.includes("hardening")) return {
    title: "An admin endpoint is internet-reachable behind valid TLS",
    background: "A new operations portal works correctly but its /admin path is reachable from the internet. SSO is enabled; security review requires reducing exposure without breaking remote on-call access.",
    evidence: [
      "[A] External test: GET /admin returns 302 to SSO; TLS 1.3 certificate is valid.",
      "[B] Load-balancer rule routes /admin from 0.0.0.0/0 to admin-targets.",
      "[C] Access logs show 2,184 automated requests to /admin in 24 hours and 0 successful sessions.",
      "[D] On-call users connect through corporate VPN range 10.200.0.0/16 and managed identity groups.",
    ],
    objective: "Rank the exposure, design layered controls that preserve on-call access, and define validation and rollback.",
    solution: "Valid TLS and SSO do not remove unnecessary internet exposure. Restrict the route to approved VPN/private access at the load balancer, keep SSO and authorization, rate-limit and alert on rejects, and test managed on-call access plus public denial. Roll back the routing restriction if emergency access fails while retaining identity controls.",
  };
  if (topic.includes("detect")) return {
    title: "A detection rule fires on scanner noise but misses successful access",
    background: "The SOC receives hundreds of failed-login alerts but no alert for a privileged login from a new country. Analysts are suppressing the noisy rule manually.",
    evidence: [
      "[A] Existing rule: count(authentication.failure) > 20 by source.ip in 5 minutes.",
      "[B] 94% of alerts map to an approved external vulnerability scanner.",
      "[C] Event at 03:14: authentication.success user=finance-admin geo=BR device_trust=unknown.",
      "[D] User baseline: prior 60-day countries ZA and GB; no travel notice is recorded.",
    ],
    objective: "Repair the detection strategy with high-value signals, bounded exceptions, severity logic, and test cases.",
    solution: "Suppress or tag only the verified scanner identity while retaining failure coverage, and add a higher-severity rule for privileged success with new geography and unknown device trust. Test expected scanner traffic, malicious failures, known travel, VPN egress, and the supplied anomalous success.",
  };
  if (topic.includes("contain")) return {
    title: "Contain one compromised endpoint without blocking the finance subnet",
    background: "EDR flags credential dumping on FIN-LT-044 while payroll processing is active. The user account also has a live session on a known clean virtual desktop.",
    evidence: [
      "[A] EDR process tree: winword.exe -> powershell.exe -enc ... -> rundll32 comsvcs.dll MiniDump.",
      "[B] FIN-LT-044 checked in at 10:21 from 10.44.8.73; confidence high.",
      "[C] Identity log: same user has VDI session from managed device VDI-221 since 08:02.",
      "[D] Proposed network response from operations: block all 10.44.8.0/24 at the firewall.",
    ],
    objective: "Choose proportional containment, preserve payroll continuity where defensible, and list evidence-preservation and credential actions.",
    solution: "Isolate FIN-LT-044 through EDR/network access control and preserve volatile and EDR evidence. Revoke/rotate affected credentials and review sessions based on scope; validate the clean VDI before allowing continuity. A subnet-wide block is disproportionate without evidence of lateral spread.",
  };
  return {
    title: variant === 0 ? "Correlate proxy, identity, and endpoint events without overstating causality" : "A firewall review hides an outbound any-any exception",
    background: variant === 0
      ? "A user clicked a document link before an unusual cloud login. Three systems use different timestamps; one source is 94 seconds slow."
      : "A temporary egress rule was added for vendor testing and remains enabled after the ticket closed.",
    evidence: variant === 0 ? [
      "[A] Mail gateway 14:02:11: message delivered with URL hxxps://docs-login.example.",
      "[B] Proxy 14:03:40 local clock: POST /session to 203.0.113.77 from LT-118.",
      "[C] NTP audit: proxy clock is 94 seconds slow.",
      "[D] Identity 14:04:02: successful OAuth consent for user from 203.0.113.77.",
    ] : [
      "[A] Rule 310 permit tcp 10.60.0.0/16 any eq 443; owner vendor-test; 188,204 hits.",
      "[B] Ticket CHG-4182 expired 21 days ago and listed destination 198.51.100.44/32 only.",
      "[C] Flow sample includes 10.60.8.9 -> 45.77.21.18:443, not the vendor address.",
      "[D] Rule 320 is the standard deny-and-log for unapproved egress.",
    ],
    objective: "Reconstruct what the evidence establishes, identify uncertainty or unsafe scope, and propose the next preserving and validating action.",
    solution: variant === 0
      ? "Correct the proxy timestamp before ordering events: the POST occurred around 14:05:14, after OAuth consent, so the evidence does not prove the link caused consent. Preserve all sources, investigate token/app details and endpoint activity, and label confidence explicitly."
      : "Rule 310 is materially broader and longer-lived than the ticket. Confirm current owner/dependency, narrow it to the approved destination or remove it under change control, monitor denies, and retain rollback if a validated vendor flow fails.",
  };
}

function softwareCase(topic: string, variant: number): CaseCore {
  if (topic.includes("api")) return {
    title: "An idempotency key is recorded after the side effect",
    background: "A payment API occasionally creates duplicate charges when clients retry after a gateway timeout. The endpoint accepts Idempotency-Key but duplicate records share the same key.",
    evidence: [
      "[A] Handler order: chargeProvider(); orders.insert(); idempotencyKeys.insert(key, response).",
      "[B] Trace req-771: provider returned charge ch_91, response to client timed out at 30.0s.",
      "[C] Retry req-772 with the same key called chargeProvider again and returned ch_92.",
      "[D] Database has a unique index on idempotency_keys.key, but insertion occurs after both charges.",
    ],
    objective: "Explain the race/failure window and propose a bounded idempotency design with concurrency and failure tests.",
    solution: "The key is reserved too late. Atomically claim the key/request state before the external side effect, make concurrent requests observe in-progress/completed state, and reconcile uncertain provider outcomes. Test timeout after provider success, concurrent same-key requests, payload mismatch, and retry after failure.",
  };
  if (topic.includes("test")) return {
    title: "A green unit suite misses a transaction boundary regression",
    background: "Order creation tests pass, but production can save an order without inventory reservation when the inventory call times out. Unit tests mock both repositories independently.",
    evidence: [
      "[A] Service code commits orderRepository.save(order) before await inventory.reserve(items).",
      "[B] Unit test mocks inventory.reserve as resolved and asserts orderRepository.save called once.",
      "[C] Production trace: order 8841 committed; inventory timeout at 5,000 ms; HTTP 500 returned.",
      "[D] Requirement: an order must be PendingReservation or fully reserved; never silently Confirmed without stock.",
    ],
    objective: "Design tests that expose the state inconsistency and recommend the smallest defensible code/state change.",
    solution: "The unit suite does not test failure ordering or persisted state. Add integration/transaction tests for timeout and rollback or introduce an explicit pending state with retry/compensation. Verify no Confirmed order exists without reservation and avoid an unrelated refactor.",
  };
  if (topic.includes("performance")) return {
    title: "A list endpoint performs one query per row",
    background: "GET /teams has p95 latency 2.8 seconds for 250 teams after member counts were added. CPU is modest, but database query volume rose sharply.",
    evidence: [
      "[A] Trace: SELECT teams once, then SELECT count(*) FROM members WHERE team_id=? repeated 250 times.",
      "[B] Database p95 per count query is 8 ms; total endpoint query time 2,104 ms.",
      "[C] Result payload needs team id, name, and memberCount only.",
      "[D] Single grouped query in staging returns all counts in 34 ms for the same fixture.",
    ],
    objective: "Prove the dominant cost, propose a scoped query change, and define performance and correctness regression tests.",
    solution: "This is an N+1 query path. Fetch counts with a grouped query/join or batched repository method, preserve teams with zero members, and test count correctness, authorization, query count, and p95 under a representative fixture.",
  };
  if (topic.includes("refactor")) return {
    title: "A proposed refactor changes retry semantics under the guise of cleanup",
    background: "A pull request consolidates three job handlers into one helper. The old handlers retry transient errors but dead-letter validation errors; the helper retries every thrown error.",
    evidence: [
      "[A] Old handler: if (err instanceof ValidationError) return deadLetter(job, err).",
      "[B] New helper: catch (err) { throw new RetryableError(err.message); }.",
      "[C] Queue policy retries RetryableError 12 times over 6 hours.",
      "[D] Staging: malformed customer record was attempted 12 times and paged on-call twice.",
    ],
    objective: "Review the behavioral regression, propose a minimal patch, and specify tests that preserve error classification.",
    solution: "The helper erases error type and turns permanent validation failures into retries. Preserve/categorize known permanent errors before wrapping transient failures, then test validation, network timeout, unknown error, retry count, and dead-letter metadata.",
  };
  return {
    title: variant === 0 ? "Empty optional input triggers a deployment regression" : "A background worker acknowledges before durable processing",
    background: variant === 0
      ? "POST /orders returns 500 only when discountCode is an empty string. Omitting the field works; the regression followed schema consolidation."
      : "A queue reports successful delivery while some invoices disappear during worker restarts.",
    evidence: variant === 0 ? [
      "[A] Request {\"sku\":\"A-14\",\"discountCode\":\"\"} returns 500; omitted discountCode returns 201.",
      "[B] Diff removed empty-string normalization from the controller.",
      "[C] Stack: TypeError reading discount.amount after repository returned undefined.",
      "[D] Contract defines discountCode as optional and non-empty when present.",
    ] : [
      "[A] Worker calls message.ack() before invoiceRepository.save(invoice).",
      "[B] Log job-118: ack 12:41:03.119; process terminated 12:41:03.128; no save record.",
      "[C] Broker does not redeliver acknowledged messages.",
      "[D] Duplicate invoice numbers are protected by a unique database constraint.",
    ],
    objective: "Trace the exact failure path, propose the smallest correctness fix, and define tests for the supplied edge case and its boundaries.",
    solution: variant === 0
      ? "Normalize empty strings to absence or reject them as a 4xx before lookup, and guard the repository result. Test absent, empty, valid, unknown, and malformed codes."
      : "Acknowledge only after durable processing, relying on idempotency/unique constraints for redelivery. Test termination before save, after save before ack, duplicate delivery, and permanent validation failure.",
  };
}

function automationCase(topic: string, variant: number): CaseCore {
  if (topic.includes("ansible") || topic.includes("idempot")) return {
    title: "An Ansible task reports changed on every run and restarts production",
    background: "A hardening playbook restarts nginx every execution although the desired header is already present. The maintenance policy permits restart only after an effective configuration change.",
    evidence: [
      "[A] Task: shell: echo 'add_header X-Frame-Options SAMEORIGIN;' >> /etc/nginx/conf.d/security.conf.",
      "[B] notify: restart nginx; task reports changed=true on every run.",
      "[C] File now contains the same add_header line 14 times.",
      "[D] nginx -t succeeds, but reload count increased 14 times this week.",
    ],
    objective: "Replace the non-idempotent behavior, preserve validation-before-reload, and provide first-run/second-run/failure tests.",
    solution: "Use a governed template, lineinfile with an exact state, or managed block; notify a validated reload only on change. Run nginx -t before activation. The second run must report no change and no reload; invalid config must stop before service action.",
  };
  if (topic.includes("pars")) return {
    title: "A CSV parser shifts fields when a quoted value contains a comma",
    background: "An account-import script works for simple rows but assigns the wrong department when display names contain commas. The input is RFC-style CSV, not a delimiter-safe flat file.",
    evidence: [
      "[A] Code: line.split(',') assigned to email,name,department.",
      "[B] Input: maria@example.org,\"Santos, Maria\",Network Operations.",
      "[C] Observed parse: name='Santos'; department=' Maria'.",
      "[D] Requirement: reject rows with missing email and report row number without partially creating that row.",
    ],
    objective: "Provide a parser design or code using a structured CSV library, validation, failure reporting, and deterministic fixtures.",
    solution: "Use the language's CSV parser rather than split, validate header/field count and email before mutation, and collect row-level errors. Test quoted commas, escaped quotes, blank required fields, Unicode, and a valid control row.",
  };
  if (topic.includes("error")) return {
    title: "A bulk job swallows failures and exits successfully",
    background: "A certificate-rotation script processed 80 hosts and exited 0, but 11 hosts still present the old certificate. Operations relies on the exit code for release approval.",
    evidence: [
      "[A] Loop body: rotate(host) except Exception: print('skipped', host).",
      "[B] Output lists 11 skipped hosts but final line says completed=80.",
      "[C] Monitoring checks only process exit code and received 0.",
      "[D] Requirement: bounded retries for network timeouts; auth failures must not retry and must fail the run summary.",
    ],
    objective: "Design explicit result accounting, retry classification, exit behavior, and a resumable failure artifact.",
    solution: "Track success/failure per host, retry only transient errors with a bound, emit a machine-readable failure list, and return non-zero when required hosts fail. Do not count attempted as completed. Test mixed success, timeout recovery, auth failure, and rerun from the failed set.",
  };
  return {
    title: variant === 0 ? "A cleanup script crosses its intended filesystem boundary" : "A Python dry run still mutates remote state",
    background: variant === 0
      ? "A fleet cleanup task must remove regular .tmp files older than 14 days under /srv/app/cache only. Production includes symlinks and mounted subdirectories."
      : "A user-deprovisioning tool offers --dry-run, but audit logs show group membership was removed during a preview.",
    evidence: variant === 0 ? [
      "[A] Current command: find /srv/app/cache -mtime +14 -exec rm -rf {} +.",
      "[B] /srv/app/cache/shared is a mounted filesystem; current is a symlink.",
      "[C] Requirement excludes directories, symlinks, and other filesystems.",
      "[D] Restore window is 24 hours from object-store backup; no local undelete exists.",
    ] : [
      "[A] main(): plan=user.plan(); user.remove_groups(); if args.dry_run: print(plan); return.",
      "[B] Test asserts printed plan but does not mock or inspect remove_groups().",
      "[C] Audit event group.remove occurred with request mode=dry-run.",
      "[D] Requirement: preview must make zero write API calls.",
    ],
    objective: "Produce a safe implementation or command sequence, dry-run proof, failure behavior, and rollback assumptions.",
    solution: variant === 0
      ? "Constrain by path, file type, age, and filesystem; enumerate and review in dry-run before deletion. Avoid recursive rm and symlink traversal. Test mounts, symlinks, spaces, age boundaries, and an empty candidate set."
      : "Move all mutations behind the execution branch and represent the plan as data. Tests must fail on any write-client call in dry-run and cover partial execution/rollback or resumability.",
  };
}

function cloudCase(topic: string, variant: number): CaseCore {
  if (topic.includes("iam")) return {
    title: "A deploy role lost one required artifact permission",
    background: "The production service is healthy, but new releases cannot upload artifacts after an IAM cleanup. An engineer proposes s3:* on all buckets to unblock the pipeline.",
    evidence: [
      "[A] Pipeline: AccessDenied s3:PutObject arn:aws:s3:::app-artifacts/prod/api-218.tgz.",
      "[B] CloudTrail principal: arn:aws:iam::123456789012:role/ci-prod-deploy.",
      "[C] Policy diff removed PutObject for app-artifacts/prod/*; GetObject remains.",
      "[D] Runtime role and running service show no errors; only the deploy stage fails.",
    ],
    objective: "Define the minimum IAM correction, staged proof, and rollback without wildcard scope.",
    solution: "Restore s3:PutObject only for the approved prod artifact prefix to the deploy role, preserving required conditions such as encryption. Validate with policy simulation and one staged upload/deploy. Revert that statement if the principal or prefix is incorrect.",
  };
  if (topic.includes("deploy")) return {
    title: "A readiness probe masks a failed dependency migration",
    background: "A Kubernetes rollout reaches 100% available, but checkout requests return 500. The readiness endpoint checks only process liveness; version 42 requires a database column not present in production.",
    evidence: [
      "[A] Deployment checkout-api image v42, ready 6/6; rollout status successful.",
      "[B] Application log: column orders.payment_state does not exist.",
      "[C] /ready returns 200 after checking event loop only; /checkout smoke test returns 500.",
      "[D] Migration job annotation references schema-42, but no completed Job exists in prod namespace.",
    ],
    objective: "Choose a safe service-restoration path, repair deployment gates, and define proof beyond pod readiness.",
    solution: "The application version and schema are incompatible; readiness is insufficient. Use the approved compatibility strategy: roll back v42 if the migration is not backward-safe, or execute the validated migration under its gate. Add dependency/schema checks and transactional smoke tests before promotion.",
  };
  if (topic.includes("cost")) return {
    title: "A log-retention change doubled storage cost without improving investigations",
    background: "Cloud logging spend rose 118% after all debug logs were retained for 365 days. Incident policy requires 30 days searchable and one year only for security audit events.",
    evidence: [
      "[A] Monthly ingest 4.2 TB; 71% is DEBUG from health-check requests.",
      "[B] Hot searchable retention is 365 days for every log group.",
      "[C] Last 12 investigations used application logs no older than 18 days.",
      "[D] Audit log group is 140 GB/month and tagged retention_class=regulated.",
    ],
    objective: "Build a cost/risk decision using the supplied volumes, differentiated retention, and monitoring safeguards.",
    solution: "Reduce noisy health-check/debug ingest at source, retain application logs searchable for the required 30 days, and archive or expire by class. Keep regulated audit events for one year in the mandated tier. Validate searchability, lifecycle rules, and projected cost before deleting existing data.",
  };
  if (topic.includes("observ")) return {
    title: "An availability alert ignores partial regional failure",
    background: "A multi-region API reports 99.99% aggregate availability while users in region eu-west see 14% errors. The alert averages every region into one global ratio.",
    evidence: [
      "[A] eu-west: 14.2% HTTP 5xx over 10 minutes, 2,100 requests/minute.",
      "[B] us-east: 0.02% HTTP 5xx, 31,000 requests/minute.",
      "[C] Alert expression: sum(success_all_regions) / sum(requests_all_regions) < 0.99.",
      "[D] eu-west dependency trace: payment-provider span timeout p95 4.8s versus 410ms baseline.",
    ],
    objective: "Design regional and dependency-aware signals, thresholds, noise controls, and an operator response path.",
    solution: "Global traffic volume masks eu-west. Alert on per-region error rate and minimum volume, pair it with latency/dependency burn signals, and retain a global SLO view. Define sustained windows, ownership, and a runbook that can shift traffic only after health validation.",
  };
  if (topic.includes("network")) return {
    title: "A private service endpoint resolves to a public address in one VPC",
    background: "Workers in VPC-B cannot reach object storage after private-endpoint rollout. VPC-A works; security groups and route tables appear unchanged.",
    evidence: [
      "[A] VPC-A dig storage.internal: 10.82.4.19; VPC-B: 198.51.100.44.",
      "[B] Private DNS zone storage.internal is associated with VPC-A only.",
      "[C] VPC-B has no NAT gateway and policy denies direct internet egress.",
      "[D] Endpoint service health is Available and accepts VPC-B security group sg-082b.",
    ],
    objective: "Distinguish DNS association from routing and security-group failure, then define the minimum correction and proof.",
    solution: "VPC-B is not associated with the private DNS zone, so it receives the public address and correctly cannot egress. Associate the approved private zone with VPC-B, verify private resolution and endpoint connectivity, and preserve egress policy. Remove the association to roll back.",
  };
  return {
    title: variant === 0 ? "A managed database is healthy but connection slots are exhausted" : "A single-zone dependency defeats the stated reliability target",
    background: variant === 0
      ? "API latency rises during traffic peaks while database CPU remains 42%. New connections time out; existing sessions continue."
      : "A service claims multi-zone resilience, but all workers depend on one zonal cache endpoint.",
    evidence: variant === 0 ? [
      "[A] database_connections 498 of max 500; CPU 42%; free memory 9.1 GB.",
      "[B] API pool config: max 80 per pod; 8 pods; average active queries 112 total.",
      "[C] Logs: remaining connection slots are reserved at 14:08:21.",
      "[D] Pool metric shows 61% idle connections and 30-minute idle timeout.",
    ] : [
      "[A] Workers run 3 replicas across zones a, b, and c.",
      "[B] CACHE_URL resolves only to cache-a.internal in zone a.",
      "[C] Zone-a game day: all workers return 503 despite healthy compute in b/c.",
      "[D] Requirement: tolerate loss of one zone with no manual DNS edit.",
    ],
    objective: "Use the supplied state to propose the smallest immediate protection and a durable reliability design with measurable validation.",
    solution: variant === 0
      ? "Oversized per-pod pools exhaust slots despite low CPU. Reduce/bound pools, reclaim idle sessions safely, and consider a managed proxy; validate peak concurrency and transaction behavior before raising max_connections."
      : "Compute placement is multi-zone but the cache dependency is not. Use a supported multi-zone cache/failover endpoint and make clients tolerate failover, then repeat a zonal-loss test and verify service objectives.",
  };
}

function dataCase(topic: string, variant: number): CaseCore {
  if (topic.includes("clean")) return {
    title: "A timezone-normalisation step shifts late-night orders into the wrong day",
    background: "Daily revenue for Johannesburg dropped 8% after a pipeline converted every timestamp as if it were already UTC. Raw orders contain ISO offsets.",
    evidence: [
      "[A] Raw order: 2026-07-13T23:30:00+02:00 amount 1200.00.",
      "[B] Transform: parse timestamp, drop timezone, then localize as UTC.",
      "[C] Output partition records 2026-07-14 01:30 Africa/Johannesburg.",
      "[D] Control calculation: the order occurred 21:30 UTC and 23:30 local on July 13.",
    ],
    objective: "Identify the semantic data error, define a safe transformation, and specify boundary and reconciliation tests.",
    solution: "The pipeline discards the supplied offset and relocalizes incorrectly. Parse offset-aware timestamps, convert to UTC for storage, and derive business date in the configured local zone. Test midnight boundaries, DST zones, missing offsets, and aggregate reconciliation.",
  };
  if (topic.includes("evaluat") || topic.includes("metric")) return {
    title: "Aggregate accuracy improves after a difficult production slice is removed",
    background: "A recommendation model report shows 91% accuracy, up from 86%, while wrong-recommendation tickets rise 38%. The evaluation export changed this week.",
    evidence: [
      "[A] Evaluation query filters WHERE region IS NOT NULL.",
      "[B] Production has region missing in 22% of requests; this slice accuracy was 54% last month.",
      "[C] Reported 91% accuracy covers 78,140 rows; excluded slice covers 21,860 rows.",
      "[D] Support tickets with missing-region requests account for 64% of wrong-recommendation reports.",
    ],
    objective: "Assess whether the improvement is valid, recompute the appropriate view, and design slice and baseline checks.",
    solution: "The evaluation excludes a common difficult production slice, so aggregate improvement is misleading. Reinclude or separately weight the missing-region slice, report coverage and per-slice metrics, compare against the prior model on the same population, and investigate upstream missingness.",
  };
  if (topic.includes("prompt")) return {
    title: "A summarisation prompt invents resolution status when notes are incomplete",
    background: "An incident-note summariser marks unresolved cases as fixed because its prompt asks for a definitive resolution even when no closure event exists.",
    evidence: [
      "[A] Prompt: 'State the root cause and final resolution in one paragraph.'",
      "[B] Input case 18 ends with 'database team investigating; next update 16:00'.",
      "[C] Output: 'The database index was rebuilt and service restored.' No such event exists.",
      "[D] Required schema supports status=open and unknown fields, but prompt does not mention them.",
    ],
    objective: "Repair the prompt/output contract, define groundedness checks, and supply adversarial evaluation cases.",
    solution: "Permit unknown/unresolved outputs, require claims to map to supplied events, and use structured status/evidence references. Reject unsupported resolution text. Evaluate open cases, conflicting notes, explicit closure, missing root cause, and malicious instructions in notes.",
  };
  if (topic.includes("risk")) return {
    title: "A credit-risk feature leaks the future outcome into training",
    background: "A model's validation AUC jumped from 0.72 to 0.96 after adding account_status_30d. The model is intended to decide at application time.",
    evidence: [
      "[A] account_status_30d is populated 30 days after application approval.",
      "[B] Random train/test split mixes applications from the same customer across dates.",
      "[C] Removing account_status_30d drops validation AUC to 0.74.",
      "[D] Production scoring payload has no account_status_30d field.",
    ],
    objective: "Identify leakage and evaluation design flaws, then define a deployment-relevant validation protocol.",
    solution: "The feature is unavailable at decision time and leaks future outcome; the random split also risks customer/time leakage. Remove post-decision features, split by time and customer, verify feature availability contracts, and compare to the baseline before deployment.",
  };
  if (topic.includes("pipeline")) return {
    title: "A successful pipeline run published a partially stale partition",
    background: "The daily dashboard mixes today's sales with yesterday's refunds. The orchestrator reports success because each task exited 0.",
    evidence: [
      "[A] sales partition max(event_date)=2026-07-14; refunds max(event_date)=2026-07-13.",
      "[B] Refund extract log: source timeout; fallback loaded latest available file.",
      "[C] Publish task checks only that both tables contain at least one row.",
      "[D] Data contract requires all component partitions to match run_date before publish.",
    ],
    objective: "Locate the broken freshness contract, design a fail-closed publication gate, and specify recovery and observability.",
    solution: "Task success does not imply partition freshness. Validate run_date, source completeness, and row/quality thresholds before atomic publish; quarantine stale fallback data and expose freshness status. Rerun the refund extract and republish only a consistent snapshot.",
  };
  return {
    title: variant === 0 ? "A retrieval system scores well while citing the wrong policy version" : "A metric dashboard hides a high-impact minority segment",
    background: variant === 0
      ? "A support assistant answers policy questions fluently but cites documents superseded six months ago. Offline evaluation checks answer similarity, not source validity."
      : "A classifier meets its overall target while error rates for one low-volume group are four times higher.",
    evidence: variant === 0 ? [
      "[A] Index contains policy-v3.pdf and superseded policy-v2.pdf with equal retrieval weight.",
      "[B] Query result cites policy-v2 section 4; current v3 moved the threshold from 30 to 14 days.",
      "[C] Offline score 0.88 uses reference text copied from v2.",
      "[D] Metadata has effective_from and superseded_by fields, but retrieval ignores both.",
    ] : [
      "[A] Overall false-negative rate 4.1%; target below 5%.",
      "[B] Segment R represents 7% of traffic and has 16.8% false-negative rate.",
      "[C] Segment labels are available at evaluation time with 96% coverage.",
      "[D] Current dashboard reports only aggregate accuracy and F1.",
    ],
    objective: "Challenge the reported quality using concrete evidence and propose a validation and monitoring design that matches production risk.",
    solution: variant === 0
      ? "Filter or down-rank superseded sources, evaluate against current policy references, expose citations/effective dates, and add tests where old and current documents conflict."
      : "Report per-segment confusion metrics and uncertainty alongside aggregate results, investigate data/threshold causes, set risk-based acceptance criteria, and monitor coverage drift without making unsupported causal claims.",
  };
}

function engineeringCase(topic: string, variant: number): CaseCore {
  if (topic.includes("maintenance")) return {
    title: "A replacement fan runs backwards after maintenance",
    background: "A field enclosure overheats only above 70% load after one fan assembly was replaced. The system cannot be fully shut down during business hours.",
    evidence: [
      "[A] Inlet 24C; outlet sensor B reaches 61C at 75% load while adjacent outlet sensor A reaches 47C.",
      "[B] Fan-2 current is 1.8 A, matching specification; tachometer reports 2,900 RPM.",
      "[C] Remote video shows airflow ribbon at Fan-2 pulled inward while Fan-1 exhausts outward.",
      "[D] Maintenance record: Fan-2 connector replaced; polarity check not recorded.",
    ],
    objective: "Separate electrical operation from correct physical effect, define safe containment and a controlled verification plan.",
    solution: "Fan-2 is powered and spinning but its airflow direction is wrong, likely after connector work. Reduce load within safe limits, coordinate isolated correction by qualified hands, verify direction and temperature under a controlled ramp, and stop if limits rise. Do not infer correct cooling from RPM/current alone.",
  };
  if (topic.includes("safety")) return {
    title: "A pressure sensor disagrees with the mechanical relief indicator",
    background: "A process controller reports 9.8 bar near its trip point, but a local mechanical gauge reads 6.1 bar. Production asks to raise the software alarm threshold to avoid stops.",
    evidence: [
      "[A] Digital sensor PT-204: 9.8 bar and rising 0.1 bar/min.",
      "[B] Mechanical gauge PG-204: 6.1 bar; last calibration 11 months ago.",
      "[C] Relief valve RV-204 is rated 8.0 bar and has not lifted.",
      "[D] Loop test record from last week notes intermittent 18 mA offset on PT-204 cable.",
    ],
    objective: "Make a conservative operational decision, state stop conditions, and design a test that does not defeat the safety control.",
    solution: "The readings conflict and neither instrument may be assumed correct. Do not raise the alarm threshold. Hold/reduce load, preserve the trip, compare with a calibrated independent instrument and inspect the known signal fault under safety procedure. Escalate or stop before the rated relief pressure.",
  };
  if (topic.includes("reliab")) return {
    title: "A redundant pump pair shares one hidden power dependency",
    background: "A cooling design claims N+1 redundancy because either pump can carry full flow. A maintenance test of panel P-7 stopped both pumps.",
    evidence: [
      "[A] Pump A and Pump B each deliver 120 L/min; required flow is 95 L/min.",
      "[B] Both variable-speed drives receive control power from 24 V supply PSU-7.",
      "[C] Opening P-7 control breaker stopped both drives while motor feeders remained energized.",
      "[D] Reliability requirement: tolerate any single pump or single control-power failure.",
    ],
    objective: "Critique the redundancy claim and propose a proportionate redesign plus a test that demonstrates independence.",
    solution: "Hydraulic capacity is redundant, but shared control power is a single point of failure. Separate or redundantly supply/control the drives with monitored failover, then test each pump, each control source, and a source failure under safe load.",
  };
  if (topic.includes("document")) return writingCase("procedure", variant);
  return {
    title: variant === 0 ? "A load-dependent vibration points to misalignment after service" : "Two sensors reveal a false root-cause assumption",
    background: variant === 0
      ? "A motor-pump assembly vibrates only above 65% load after coupling maintenance. Bearings remain within temperature limits."
      : "A remote telemetry unit resets during radio transmission, and operations blames firmware without testing supply voltage.",
    evidence: variant === 0 ? [
      "[A] Vibration 2.1 mm/s at 40% load and 8.7 mm/s at 75% load.",
      "[B] Axial vibration is 3.2 times radial vibration at the coupling end.",
      "[C] Maintenance sheet records coupling removal; laser-alignment result is blank.",
      "[D] Bearing temperatures stay 54-57C; lubrication pressure is normal.",
    ] : [
      "[A] Supply at idle 12.3 V; during transmitter key-up it dips to 8.1 V for 180 ms.",
      "[B] Controller brownout threshold is 9.0 V; reset reason register=Brownout.",
      "[C] Firmware hash matches 42 other stable units.",
      "[D] Battery internal resistance is 310 mOhm versus fleet median 82 mOhm.",
    ],
    objective: "Build an evidence-led fault-isolation decision, a bounded test, stop conditions, and a durable prevention action.",
    solution: variant === 0
      ? "The load relationship, axial signature, and missing post-maintenance alignment evidence make coupling misalignment the leading hypothesis. Limit load, verify alignment under isolation, correct to specification, and trend vibration during a controlled return."
      : "The reset is explained by supply sag below the brownout threshold, supported by the reset register and high battery resistance. Replace/test the power source and connections, then verify key-up voltage; firmware replacement is unsupported.",
  };
}

function writingCase(topic: string, variant: number): CaseCore {
  if (topic.includes("postmortem")) return {
    title: "A postmortem confuses the triggering deploy with the root control failure",
    background: "A draft incident review says 'Engineer deployed bad code' and recommends more careful engineers. The service was unavailable for 47 minutes after a schema-incompatible release.",
    evidence: [
      "[A] 09:02 deploy v42 began; 09:04 first database-column error; 09:07 alert fired.",
      "[B] Pipeline marked rollout successful because /ready checked process liveness only.",
      "[C] Migration job was missing; no automated schema compatibility gate existed.",
      "[D] 09:31 rollback approved; 09:49 service error rate returned below 1%.",
    ],
    objective: "Rewrite the causal analysis and corrective actions so they are blameless, testable, owned, and tied to the supplied timeline.",
    solution: "The deploy triggered the incident, but missing compatibility/migration gates and weak readiness allowed impact. Separate trigger, root/control failures, contributing approval delay, and recovery. Actions need owners, dates, and proof: schema gate, transactional smoke test, rollback authority, and readiness correction.",
  };
  if (topic.includes("runbook") || topic.includes("procedure")) return {
    title: "A restart runbook lacks prerequisites, success criteria, and a stop rule",
    background: "A junior responder restarted billing-api twice because the runbook says only 'restart if errors continue'. The second restart extended impact and delayed escalation.",
    evidence: [
      "[A] Existing step 4: 'Restart the service if errors continue.'",
      "[B] No service owner, maintenance impact, exact target, or prerequisite health checks are listed.",
      "[C] Incident log: restarts at 10:12 and 10:19; database saturation remained unchanged.",
      "[D] Policy permits one controlled restart only after dependency checks and requires escalation if error rate stays above 5% after 3 minutes.",
    ],
    objective: "Produce a safe replacement runbook excerpt with prerequisites, exact action scope, observable success, rollback, and escalation.",
    solution: "The rewrite must identify audience/owner and target, require dependency and impact checks, permit one controlled restart under the stated condition, define commands/placeholders and expected output, observe error rate for three minutes, and stop/escalate above 5%. It must not encourage repeated restart loops.",
  };
  if (topic.includes("report")) return {
    title: "An executive incident report buries the decision and overstates certainty",
    background: "A five-page outage report opens with packet-level detail but never states customer impact, current risk, or the decision requested from leadership.",
    evidence: [
      "[A] Confirmed impact: checkout unavailable for 18 minutes; 1,842 failed attempts; no completed-order loss found.",
      "[B] Root cause remains probable, not confirmed: cache failover configuration differs from staging.",
      "[C] Decision needed by Friday: approve a two-hour resilience game day.",
      "[D] Draft states 'the cache configuration definitely caused the outage' without a failover reproduction.",
    ],
    objective: "Restructure the report for the named decision, preserve technical honesty, and distinguish confirmed facts from hypotheses.",
    solution: "Lead with impact, status, risk, and the requested game-day decision. Label the cache configuration as a leading hypothesis, cite missing reproduction, summarize evidence, and move packet detail to an appendix. Include owner and next validation milestone.",
  };
  if (topic.includes("knowledge")) return {
    title: "A knowledge article gives one environment's command as a universal fix",
    background: "A DNS troubleshooting article tells every reader to overwrite /etc/resolv.conf. On managed hosts the file is regenerated and the change can break VPN split DNS.",
    evidence: [
      "[A] Article: 'Fix DNS with echo nameserver 8.8.8.8 > /etc/resolv.conf'.",
      "[B] Fleet includes NetworkManager, systemd-resolved, and container-generated resolv.conf owners.",
      "[C] VPN profile requires corp.example queries to 10.90.0.53 only.",
      "[D] Support cases show the manual edit reverted on 63% of managed hosts.",
    ],
    objective: "Rewrite the article into a diagnostic decision path that identifies configuration ownership before any change.",
    solution: "Start with symptom/scope and read-only resolution tests, identify who owns resolver configuration, preserve split DNS, and provide owner-specific supported changes with validation and rollback. Remove the destructive universal overwrite.",
  };
  if (topic.includes("decision")) return {
    title: "An architecture decision record lists a choice but not the forces",
    background: "An ADR says 'Use managed PostgreSQL because it is best' but omits availability, data residency, cost, migration, and operational constraints.",
    evidence: [
      "[A] Workload: 450 writes/s peak, 2 TB data, RPO 5 minutes, RTO 30 minutes.",
      "[B] Data must remain in South Africa; current team has one database specialist.",
      "[C] Options reviewed: managed regional PostgreSQL, self-managed HA PostgreSQL, distributed SQL service.",
      "[D] Existing ADR has no rejected-option reasoning or revisit trigger.",
    ],
    objective: "Produce a bounded ADR that compares viable options against explicit forces and states consequences and a revisit trigger.",
    solution: "A defensible ADR weights residency/availability, operational capacity, recovery, cost, and migration. It records why alternatives were rejected, consequences and mitigations, validation, and a trigger such as scale/residency/service availability change; it cannot merely call one option best.",
  };
  return {
    title: variant === 0 ? "A change guide permits execution without a verified backup" : "A handoff note omits the state that the next operator needs",
    background: variant === 0
      ? "A database upgrade guide lists the upgrade command before backup verification and uses 'roll back if needed' without a restoration procedure."
      : "An overnight operator receives a handoff saying 'API still flaky, keep an eye on it' after partial mitigation.",
    evidence: variant === 0 ? [
      "[A] Step 2: run db-upgrade --major 16; step 7: verify application.",
      "[B] Backup requirement is mentioned in prerequisites but has no timestamp, restore test, or owner.",
      "[C] Upgrade is not in-place reversible; rollback requires restoring snapshot and replaying 20 minutes of logs.",
      "[D] Maintenance window is 90 minutes; restore rehearsal measured 34 minutes.",
    ] : [
      "[A] Error rate fell from 18% to 3.2% after traffic shift; normal baseline is below 0.5%.",
      "[B] Region eu-west remains drained to 20% capacity.",
      "[C] Next decision at 02:00: restore traffic only if error rate stays below 1% for 15 minutes.",
      "[D] Incident commander and database owner contacts are absent from the handoff.",
    ],
    objective: "Rewrite the artifact so another qualified person can execute or continue safely without relying on unstated context.",
    solution: variant === 0
      ? "Make backup identity/freshness and restore verification a hard gate before upgrade, record go/no-go ownership, sequence validation, and provide the actual restore/log-replay rollback with timing and stop conditions."
      : "State current impact, actions taken, exact residual metrics/capacity, next threshold and time, prohibited actions, owners, links/evidence, and escalation contacts. Replace 'keep an eye' with measurable checks.",
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value: string) {
  return normalize(value).replace(/\s+/g, "-").slice(0, 42) || "topic";
}

function stableIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, length);
}
