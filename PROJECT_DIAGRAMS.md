# ProxyWatch - Architecture & Flow Diagrams

## 1️⃣ SYSTEM ARCHITECTURE DIAGRAM

```
╔════════════════════════════════════════════════════════════════════════╗
║                    PROXYWATCH SYSTEM ARCHITECTURE                      ║
╚════════════════════════════════════════════════════════════════════════╝

                         ┌──────────────────────┐
                         │  USER / ADMIN CLI    │
                         │  (Terminal Input)    │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │   proxywatch.sh (MAIN TOOL)   │
                    │   - Case routing              │
                    │   - Command dispatching       │
                    │   - Error handling            │
                    │   - Color output              │
                    └────────┬──────┬──────┬────╯
                             │      │      │
         ┌───────────────────┼──────┼──────┼─────────────────┐
         │                   │      │      │                 │
    ┌────▼─────┐    ┌───────▼──┐ ┌─▼──┐ ┌─▼─────┐    ┌─────▼────┐
    │ CONTROL  │    │ ANALYZER │ │LOGS│ │MONITOR│    │SECURITY  │
    │ Module   │    │ Module   │ │View│ │Module │    │Module    │
    │          │    │          │ │Cmd │ │      │    │          │
    └────┬─────┘    └───────┬──┘ └─┬──┘ └──┬───┘    └─────┬────┘
         │                  │      │       │              │
    ┌────▼──────────┐      │      │       │              │
    │  systemctl    │      │      │       │              │
    │  - start      │      │      │       │              │
    │  - stop ──────┼──────┼──────┼───────┼──────────────┼─┐
    │  - restart    │      │      │       │              │ │
    │  - reload     │      │      │       │              │ │
    └───────────────┘      │      │       │              │ │
                           │      │       │              │ │
                    ┌──────▼──────▼───────▼──────────────▼─▼─────┐
                    │     SQUID PROXY SERVER                      │
                    │     ┌─────────────────┐                     │
                    │     │ Config File     │                     │
                    │     │ /etc/squid/     │ ◄─── Config Edit   │
                    │     │ squid.conf      │                     │
                    │     ├─────────────────┤                     │
                    │     │ ACL Rules       │ ◄─── Block/Unblock │
                    │     │ (Domain blocks) │                     │
                    │     ├─────────────────┤                     │
                    │     │ HTTP Port 3128  │ ◄─── Client Traffic│
                    │     └─────────────────┘                     │
                    │                                              │
                    │     ┌─────────────────────────────────┐     │
                    │     │   ACCESS LOG                    │     │
                    │     │   /var/log/squid/access.log     │     │
                    │     │                                 │     │
                    │     │  Format: TIME IP METHOD URL     │     │
                    │     │          STATUS SIZE            │     │
                    │     └────┬────────────────────────────┘     │
                    └──────────┼──────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  DATA PROCESSING    │
                    │  - awk parsing      │
                    │  - grep filtering   │
                    │  - sort/uniq count  │
                    │  - aggregation      │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
    ┌───▼────┐            ┌───▼────┐            ┌───▼────┐
    │ANALYTICS          │ LOGS/    │            │LIVE    │
    │Output             │ SEARCHES │            │MONITOR │
    │                   │ Output   │            │Display │
    │- Top Users        │          │            │        │
    │- Top Sites        │- Filtered│            │- Real  │
    │- Status Codes     │  entries │            │ time   │
    │- Traffic Stats    │- Search  │            │ stream │
    │                   │ results  │            │        │
    └───────────────────┴──────────┴────────────┴────────┘
```

---

## 2️⃣ COMMAND ROUTING FLOW

```
╔════════════════════════════════════════════════════════════════════════╗
║              COMMAND EXECUTION FLOW                                     ║
╚════════════════════════════════════════════════════════════════════════╝

                    USER INPUT
                        │
           ./proxywatch.sh [command] [args]
                        │
          ┌─────────────┴─────────────┐
          │   Parse Arguments          │
          │   $1 = command             │
          │   $2, $3... = parameters   │
          └──────────┬────────────────┘
                     │
         ┌───────────▼───────────┐
         │  Case Statement       │
         │  Match Command        │
         └───┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┘
             │ │ │ │ │ │ │ │ │ │
   ┌─────────┼─┼┐┌─┼─┼─┼─┼─┼─┼─┼─────────┐
   │         ├─┼┼─┼─┼─┼─┼─┼─┼─┼─┤         │
   │    ┌────┴─┼┼─┼─┼─┼─┼─┼─┼─┼─┴────┐   │
   │    │      └─┼─┼─┼─┼─┼─┼─┼───────┼─  │
   │    │        └─┼─┼─┼─┼─┼───────┤ │   │
   │    │          └─┼─┼─┼───────┤ │ │   │
   │    │            └─┼───────┘ │ │ │   │
   │    │              └─┘       │ │ │   │
   │    │                        │ │ │   │

   v    v v v v v v v v v v
 START STOP LOGS TOP-USERS TOP-SITES STATS BLOCK MONITOR...

   │    │ │ │ │ │ │ │ │ │ │
   │    │ │ │ │ │ │ │ │ │ └─► cmd_status
   │    │ │ │ │ │ │ │ │ └──► cmd_status_codes
   │    │ │ │ │ │ │ │ └─────► cmd_monitor
   │    │ │ │ │ │ │ └────────► cmd_block
   │    │ │ │ │ │ └───────────► cmd_stats
   │    │ │ │ │ └──────────────► cmd_top_sites
   │    │ │ │ └───────────────► cmd_top_users
   │    │ │ └────────────────► cmd_logs
   │    │ └─────────────────► cmd_stop
   │    └──────────────────► cmd_start
   │
   └───► cmd_help (default)

                    │
         ┌──────────▼──────────┐
         │ Execute Command     │
         │ Function            │
         └──────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    v               v               v
┌─────────┐   ┌──────────┐   ┌──────────┐
│CHECK    │   │EXECUTE   │   │ERROR     │
│PRIVS    │   │COMMAND   │   │HANDLING  │
│(Root)   │   │LOGIC     │   │& FEEDBACK│
└────┬────┘   └──────┬───┘   └────┬─────┘
     │               │             │
     └───────────────┼─────────────┘
                     │
         ┌───────────▼───────────┐
         │ Format & Display      │
         │ Output (Colors)       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │ Return to User        │
         │ Exit with status      │
         └───────────────────────┘
```

---

## 3️⃣ LOG ANALYSIS PIPELINE

```
╔════════════════════════════════════════════════════════════════════════╗
║              LOG ANALYSIS DATA PIPELINE                                ║
╚════════════════════════════════════════════════════════════════════════╝

    /var/log/squid/access.log
    ┌──────────────────────────────────────────────────┐
    │ 1234 192.168.1.50 GET http://google.com 200 5000│
    │ 1235 192.168.1.45 GET http://youtube.com 200 8000
    │ 1236 192.168.1.50 GET http://facebook.com 403 0 │
    │ 1237 192.168.1.33 GET http://google.com 200 4000│
    │ 1238 192.168.1.45 GET http://reddit.com 200 6000│
    └──────────────────────────────────────────────────┘
                     │
     ┌───────────────┴───────────────┐
     │                               │
     v                               v
┌──────────────────┐        ┌──────────────────┐
│ AWK - Extract    │        │ GREP - Filter    │
│ Fields           │        │ Match Patterns   │
│                  │        │                  │
│ awk '{print $3}' │        │ grep "200"       │
│ (Client IP)      │        │ (Success only)   │
│                  │        │                  │
│ awk '{print $5}' │        │ grep "facebook"  │
│ (Bytes)          │        │ (Find domain)    │
└────────┬─────────┘        └────────┬─────────┘
         │                          │
         └──────────────┬───────────┘
                        │
         ┌──────────────▼──────────────┐
         │ SORT - Organize             │
         │ sort [options]              │
         │                             │
         │ sort -n (numeric)           │
         │ sort -r (reverse)           │
         └────────────┬────────────────┘
                      │
         ┌────────────▼─────────────┐
         │ UNIQ - Count            │
         │ uniq -c                 │
         │                         │
         │ 3 192.168.1.50          │
         │ 2 192.168.1.45          │
         │ 1 192.168.1.33          │
         └────────────┬────────────┘
                      │
         ┌────────────▼──────────┐
         │ FINAL SORT            │
         │ sort -rn              │
         │                       │
         │ 3 192.168.1.50        │
         │ 2 192.168.1.45        │
         │ 1 192.168.1.33        │
         └────────────┬──────────┘
                      │
         ┌────────────▼──────────┐
         │ HEAD - Limit          │
         │ head -10              │
         │ (Show top 10)         │
         └────────────┬──────────┘
                      │
         ┌────────────▼──────────────┐
         │ FORMAT - Pretty Print     │
         │ awk '{printf format}'     │
         │                           │
         │ "3 requests | Client IP"   │
         └────────────┬──────────────┘
                      │
              FINAL OUTPUT
```

**Example Pipeline Command:**
```bash
awk '{print $3}' | sort | uniq -c | sort -rn | head -10 | awk '{printf "%d users | %s\n", $1, $2}'
```

---

## 4️⃣ SECURITY BLOCKING FLOW

```
╔════════════════════════════════════════════════════════════════════════╗
║              DOMAIN BLOCKING WORKFLOW                                   ║
╚════════════════════════════════════════════════════════════════════════╝

  USER COMMAND
  ./proxywatch.sh block facebook.com
         │
         v
  ┌──────────────────────┐
  │ Validate domain      │
  │ Check if already     │
  │ blocked              │
  └──────────┬───────────┘
             │
         ┌───▼──────────────┐
         │ grep squid.conf  │
         │ "facebook.com"   │
         └───┬──────────────┘
             │
      ┌──────┴──────┐
      │             │
      v             v
   FOUND        NOT FOUND
   (Skip)        (Continue)
      │             │
      │        ┌────▼────────────────────┐
      │        │ Create ACL rule         │
      │        │                         │
      │        │ acl block_facebook_com  │
      │        │ dstdomain .facebook.com │
      │        └────┬────────────────────┘
      │             │
      │        ┌────▼────────────────────┐
      │        │ Add denial rule         │
      │        │                         │
      │        │ http_access deny        │
      │        │ block_facebook_com      │
      │        └────┬────────────────────┘
      │             │
      │        ┌────▼──────────────────┐
      │        │ Append to squid.conf  │
      │        │ /etc/squid/squid.conf │
      │        └────┬─────────────────┘
      │             │
      │        ┌────▼──────────────────┐
      │        │ Save to blocklist     │
      │        │ blocked_sites.txt     │
      │        └────┬─────────────────┘
      │             │
      └─────┬───────┘
            │
      ┌─────▼────────────────┐
      │ Reload Squid         │
      │ systemctl reload     │
      │ squid                │
      └─────┬────────────────┘
            │
      ┌─────▼──────────────┐
      │ Verify Success     │
      │ Check systemctl    │
      │ status             │
      └─────┬──────────────┘
            │
      ┌─────▼──────────────┐
      │ Display Result     │
      │ "Domain blocked"   │
      │ (Green success)    │
      └────────────────────┘

RESULT: Next request to facebook.com gets HTTP 403 DENIED


  Browser Request          Squid Proxy              User Sees
   "facebook.com"     ────► Check ACLs      ────► "Access Denied"
                            │
                            v
                        Rule Match
                        │
                        v
                    TCP_DENIED/403
                    (Logged)
```

---

## 5️⃣ REAL-TIME MONITORING FLOW

```
╔════════════════════════════════════════════════════════════════════════╗
║              LIVE MONITORING & STREAMING                                ║
╚════════════════════════════════════════════════════════════════════════╝

  ./proxywatch.sh monitor
         │
         v
  ┌──────────────────────┐
  │ Clear screen         │
  │ Print header         │
  └──────────┬───────────┘
             │
  ┌──────────▼──────────┐
  │ while true; do       │
  │ (infinite loop)      │
  └──────────┬───────────┘
             │
  ┌──────────▼──────────────────┐
  │ Display Current Status       │
  │ - Header (time)              │
  │ - Active users (from logs)   │
  │ - Recent traffic             │
  │ - Proxy status               │
  └──────────┬──────────────────┘
             │
  ┌──────────▼──────────────────┐
  │ Parse Last 100 Log Entries   │
  │                              │
  │ awk '{print $3}' |           │
  │ sort | uniq -c | sort -rn    │
  │ head -10                     │
  └──────────┬──────────────────┘
             │
  ┌──────────▼──────────────────┐
  │ Format Output with Colors    │
  │                              │
  │ User: 192.168.1.50           │
  │ Requests: 100                │
  │ Status: RUNNING (GREEN)      │
  └──────────┬──────────────────┘
             │
  ┌──────────▼──────────────────┐
  │ Display to Terminal          │
  │ (Formatted table view)       │
  └──────────┬──────────────────┘
             │
  ┌──────────▼──────────────────┐
  │ Wait 5 seconds               │
  │ sleep 5                      │
  └──────────┬──────────────────┘
             │
  ┌──────────▼──────────────────┐
  │ Loop back to refresh         │
  │ (ctrl+c to exit)             │
  └──────────────────────────────┘

LIVE OUTPUT EXAMPLE:
┌────────────────────────────────┐
│ ProxyWatch - Real-Time Monitor │
│ Updated: 11:32:45              │
│                                │
│ Active Users:                  │
│   192.168.1.50: 345 requests   │
│   192.168.1.45: 234 requests   │
│   192.168.1.33: 156 requests   │
│                                │
│ Recent Traffic:                │
│   [192.168.1.50] → google.com  │
│   [192.168.1.45] → youtube.com │
│                                │
│ Status: RUNNING (Green)        │
│                                │
│ Refreshing in 5 seconds...     │
└────────────────────────────────┘
```

---

## 6️⃣ COMPLETE SYSTEM WORKFLOW

```
╔════════════════════════════════════════════════════════════════════════╗
║              COMPLETE PROXYWATCH WORKFLOW                               ║
╚════════════════════════════════════════════════════════════════════════╝

                         INITIALIZATION
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
         STARTUP          ┌─────────────────────▼──────┐
            │             │                             │
         START            │  Check Squid              │
         PROXY      ┌─────▼─────┐                     │
            │       │ Running?  │                     │
            │       └─────┬─────┘                     │
            │             │                           │
            │      ┌──────┴──────┐                    │
            │      │             │                    │
            │      v             v                    │
            │    YES          NO                      │
            │      │           │                      │
            │      │      [Start Service]             │
            │      │      systemctl start             │
            │      │           │                      │
            └──────┼───────────┘                      │
                   │                                  │
        ┌──────────▼──────────┐         ┌─────────────▼–────────┐
        │ SERVICE RUNNING     │         │ SERVICES READY        │
        └──────────┬──────────┘         └──────────┬────────────┘
                   │◄────────────────────────────────┘
                   │
        ┌──────────▼──────────────────────────────┐
        │ USER COMMANDS AVAILABLE                 │
        └──────────┬──────────────────────────────┘
                   │
        ┌──────────┴──────────────────────────────┐
        │                                          │
        v                                          v
    ┌─────────────────┐                  ┌──────────────────┐
    │ TRAFFIC FLOWS   │                  │ USER OPERATES    │
    │ THROUGH PROXY   │                  │ CLI COMMANDS     │
    │                 │                  │                  │
    │ Clients ──►     │                  │ ./proxywatch.sh  │
    │ Browser proxy   │                  │ [command]        │
    │ 127.0.0.1:3128  │                  │                  │
    │       │         │                  └────────┬─────────┘
    │       v         │                           │
    │ [Squid Port]    │                      ┌────▼─────────────┐
    │       │         │                      │                  │
    │       v         │                      v                  v
    │ Logs written    │              ANALYTICS   SECURITY
    │ /var/log/squid/ │              COMMANDS    COMMANDS
    │ access.log      │                  │         │
    └────────┬────────┘                  │         │
             │                           │         │
    ┌────────▼────────────┐              │         │
    │ REAL-TIME DATA      │              │         │
    │ Available for       │              │         │
    │ Analysis            │              │         │
    └────────┬────────────┘              │         │
             │                           │         │
        ┌────┴──────────────────────────┴────────┴──┐
        │  CLI TOOLS PROCESS & DISPLAY DATA          │
        │  - Parse logs with awk/grep                │
        │  - Format output with colors               │
        │  - Display results                         │
        └────────────────┬──────────────────────────┘
                         │
        ┌────────────────▼──────────────────┐
        │ USER SEES RESULTS                 │
        │ [Colored terminal output]         │
        │                                   │
        │ "Top Users: 192.168.1.50"        │
        │ "Status: Running"                 │
        │ "Domain: Blocked"                 │
        └────────────────┬──────────────────┘
                         │
        ┌────────────────▼──────────────────┐
        │ DECISIONS BASED ON DATA            │
        │ - Block more sites                 │
        │ - Monitor specific user            │
        │ - Check status codes               │
        │ - Backup configuration             │
        └────────────────┬──────────────────┘
                         │
        ┌────────────────▼──────────────────┐
        │ MODIFY CONFIGURATION               │
        │ (if needed)                        │
        │ - Add ACL rules                    │
        │ - Reload squid                     │
        │ - Verify changes                   │
        └────────────────────────────────────┘
```

---

## 7️⃣ SCRIPT MODULE INTERACTION

```
╔════════════════════════════════════════════════════════════════════════╗
║              MODULE INTERACTION & DATA FLOW                             ║
╚════════════════════════════════════════════════════════════════════════╝

          ┌───────────────────────────────────────┐
          │  PROXYWATCH.SH (Main Orchestrator)    │
          │                                       │
          │  ┌─────────────────────────────────┐ │
          │  │ Parse command                   │ │
          │  │ Route to appropriate module     │ │
          │  │ Handle errors                   │ │
          │  │ Format output                   │ │
          │  └────────────┬────────────────────┘ │
          └───────────────┼─────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         v                v                v
    ┌─────────┐    ┌──────────┐    ┌─────────┐
    │CONTROL  │    │ANALYZER  │    │MONITOR  │
    │.SH      │    │.SH       │    │.SH      │
    │         │    │          │    │         │
    │• Start  │    │• Users   │    │• Monitor│
    │• Stop   │    │• Sites   │    │• Live   │
    │• Status │    │• Formats │    │• Alerts │
    │• Reload │    │• Reports │    │• Stream │
    └────┬────┘    └────┬─────┘    └────┬────┘
         │              │              │
         │              │              │
    ┌────▼──────────────┼──────────────▼────┐
    │                   │                    │
    │    SHARED RESOURCES (All modules)     │
    │                                       │
    │  ┌─────────────────────────────────┐ │
    │  │ /var/log/squid/access.log       │ │
    │  │ (PRIMARY DATA SOURCE)           │ │
    │  └──┬──────────────────────────────┘ │
    │     │                                 │
    │  ┌──▼──────────────────────────────┐ │
    │  │ /etc/squid/squid.conf           │ │
    │  │ (CONFIGURATION)                 │ │
    │  └──┬──────────────────────────────┘ │
    │     │                                 │
    │  ┌──▼──────────────────────────────┐ │
    │  │ ~/proxywatch/data/              │ │
    │  │ blocked_sites.txt               │ │
    │  │ (BLOCKED DOMAINS LIST)          │ │
    │  └─────────────────────────────────┘ │
    │                                       │
    │  ┌─────────────────────────────────┐ │
    │  │ systemctl service               │ │
    │  │ (SQUID DAEMON)                  │ │
    │  └─────────────────────────────────┘ │
    └───────────────────────────────────────┘

DATA FLOW:
Logs ──► Filter (grep) ──► Parse (awk) ──► Aggregate (uniq) ──► Sort/Limit ──► Display

          ↓         ↓                ↓
    [ANALYZER]  [MONITOR]       [DISPLAY]
          ↓         ↓                ↓
   [STATISTICS]  [LIVE]        [USER OUTPUT]
```

---

## 8️⃣ DEPLOYMENT TO PRODUCTION FLOW

```
╔════════════════════════════════════════════════════════════════════════╗
║              DEPLOYMENT WORKFLOW                                        ║
╚════════════════════════════════════════════════════════════════════════╝

STEP 1: WINDOWS MACHINE
┌─────────────────────────────────┐
│ Prepare files on Windows        │
│ - proxywatch.sh                 │
│ - scripts/*.sh                  │
│ - *.md documentation            │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Transfer to Linux VM            │
│ (SCP, USB, or manual copy)      │
└────────────┬────────────────────┘
             │

STEP 2: LINUX VM
             v
┌─────────────────────────────────┐
│ Create directory structure       │
│ mkdir -p ~/proxywatch/        │
│ mkdir scripts config logs data  │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Copy files to correct location  │
│ ~/proxywatch/proxywatch.sh      │
│ ~/proxywatch/scripts/*.sh       │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Set executable permissions      │
│ chmod +x *.sh                   │
│ chmod +x scripts/*.sh           │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Install Squid                   │
│ sudo apt install squid          │
│ squid -v (verify)               │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Start services                  │
│ sudo systemctl start squid      │
│ ./proxywatch.sh status          │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ Test all commands               │
│ ./proxywatch.sh help            │
│ ./proxywatch.sh top-users       │
│ ./proxywatch.sh stats           │
└────────────┬────────────────────┘
             │
             v
┌─────────────────────────────────┐
│ ✅ PRODUCTION READY             │
│ Ready for demo/presentation     │
└─────────────────────────────────┘
```

---

## 📋 QUICK REFERENCE MAP

```
USER COMMAND
     │
     v
PROXYWATCH.SH
  (Router)
     │
  ┌──┴──────────────────────────────────┐
  │                                      │
  v                                      v
START/STOP/           ANALYTICS/      SECURITY/
CONTROL               MONITOR         BLOCKING
  │                     │                │
  ├─ start              ├─ stats         ├─ block
  ├─ stop               ├─ top-users     ├─ unblock
  ├─ restart            ├─ top-sites     └─ blocked
  ├─ status             ├─ logs
  └─ reload             ├─ live
                        └─ monitor

                          ↓
                    SQUID PROXY
                          ↓
                    LOGS & DATA
                          ↓
                    AWK/GREP PARSE
                          ↓
                    FORMAT OUTPUT
                          ↓
                    DISPLAY TO USER
```

---

**All diagrams show the complete project structure and flow! 🎯**
