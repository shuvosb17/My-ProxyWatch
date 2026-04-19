# 📚 ProxyWatch - VIVA Q&A Reference Guide

## SECTION 1: PROJECT OVERVIEW

### Q1: What is ProxyWatch?
**A:** ProxyWatch is a comprehensive Linux-based CLI tool for managing and monitoring a Squid proxy server. It provides real-time traffic analysis, security controls (domain blocking), automated monitoring, and analytics capabilities. The project integrates multiple shell scripts and Linux utilities to create a professional proxy management platform.

### Q2: Why is this project useful?
**A:**
- Organizations need proxy servers for security, bandwidth control, and web filtering
- Administrators need real-time monitoring to detect threats
- Domain blocking prevents access to malicious/inappropriate websites
- Log analysis reveals user behavior and network patterns
- Demonstrates core Linux system administration skills

### Q3: What are the main components?
**A:**
1. **Squid Proxy Server** - The core proxy service
2. **proxywatch.sh** - Main CLI tool with 15+ commands
3. **analyzer.sh** - Advanced log analysis engine
4. **control.sh** - Service management and configuration
5. **block.sh** - Domain blocking and firewall rules
6. **monitor.sh** - Real-time monitoring and alerts

### Q4: What Linux concepts does this project cover?
**A:**
- Bash scripting (functions, case statements, loops)
- System services (systemctl)
- File permissions and ownership (chmod, chown)
- Process management (ps, kill, top)
- Text processing (awk, grep, sed, sort, uniq)
- Log file analysis
- Configuration file management
- User privileges and sudo
- Network services and ports
- Regular expressions

---

## SECTION 2: TECHNICAL ARCHITECTURE

### Q5: Explain the architecture of your system
**A:**
```
┌─────────────────────────────────────────┐
│   ProxyWatch CLI (proxywatch.sh)        │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┬──────────┬─────────┐
       │                │          │         │
   ┌────┴────┐    ┌────┴─────┐  ┌─┴────┐  ┌┴─────┐
   │Analyzer │    │ Control  │  │Block │  │Monitor│
   │(Logger) │    │(Service) │  │Rules │  │Tools  │
   └────┬────┘    └────┬─────┘  └──┬───┘  └┬─────┘
        │              │          │         │
        └──────────────┼──────────┼─────────┘
                       │          │
              ┌────────┴──────┬───┴──────┐
              │               │          │
        ┌─────▼────┐    ┌────▼───┐   ┌──┴──┐
        │ Squid     │    │ System │   │ /var│
        │ Proxy     │    │ Service│   │ /log│
        │ (Port     │    │ Control│   │/squi│
        │ 3128)     │    │(systemd│   │d/   │
        └───────────┘    │        │   │     │
                         └────────┘   └─────┘
```

**Data Flow:**
1. Traffic passes through Squid Proxy
2. Logs written to `/var/log/squid/access.log`
3. Scripts parse logs using `awk`, `grep`
4. Results displayed via CLI interface
5. Config changes reload Squid

### Q6: How does the proxy server work?
**A:**
- Squid runs as a service on port 3128
- Client configures browser/app to use proxy: `127.0.0.1:3128`
- All HTTP traffic routes through Squid
- Squid logs every request with: client IP, timestamp, domain, status, bytes
- ACL (Access Control Lists) enforce blocking rules
- Our scripts analyze these logs and manage rules

### Q7: How do the scripts communicate?
**A:**
- Main tool (`proxywatch.sh`) sources helper scripts
- Data flows through shared log files (`/var/log/squid/access.log`)
- Configuration shared via `/etc/squid/squid.conf`
- Scripts use `sudo systemctl` for service control
- Real-time data via log tailing (`tail -f`)
- Variables passed via CLI arguments (`$1, $2, etc`)

---

## SECTION 3: COMMAND IMPLEMENTATION

### Q8: How do the top-users and top-sites commands work?
**A:**
```bash
# TOP-USERS (parse client IP from field 3)
awk '{print $3}' access.log      # Extract client IPs
| sort | uniq -c                 # Count unique IPs
| sort -rn | head -10            # Sort descending, show top 10

# TOP-SITES (parse domain from fields 6-7, split by /)
awk -F'[ /]' '{print $7}' access.log  # Extract domain
| sort | uniq -c                       # Count occurrences
| sort -rn | head -10                  # Sort and display
```

**Output Example:**
```
100 192.168.1.50   (100 requests from this user)
85 google.com      (85 visits to Google)
```

### Q9: Explain the blocking mechanism
**A:**
When we run `./proxywatch.sh block facebook.com`:

1. **Script Action:**
   ```bash
   echo "acl blocked_domain dstdomain .facebook.com" >> /etc/squid/squid.conf
   echo "http_access deny blocked_domain" >> /etc/squid/squid.conf
   ```

2. **Squid Now Does:**
   - Intercepts requests to `*.facebook.com`
   - Matches ACL rule
   - Denies access (HTTP 403)

3. **Result:** User gets "Access Denied" message

4. **Log Entry:** Request shows `TCP_DENIED/403`

### Q10: How does live monitoring work?
**A:**
```bash
tail -f /var/log/squid/access.log | while read line; do
    # Extract fields
    user=$(echo "$line" | awk '{print $3}')
    domain=$(echo "$line" | awk -F'[ /]' '{print $7}')

    # Display formatted output
    echo "[$user] -> [$domain]"
done
```

- `tail -f` streams new log entries as they appear
- `while read line` processes each entry
- `awk` extracts specific fields
- Displays in real-time with formatting

---

## SECTION 4: BASH SCRIPTING TECHNIQUES

### Q11: How do you handle color output in your scripts?
**A:**
```bash
RED='\033[0;31m'         # Color code for red
GREEN='\033[0;32m'       # Color code for green
YELLOW='\033[1;33m'      # Color code for yellow
NC='\033[0m'             # Reset to normal color

# Usage:
echo -e "${RED}Error: Something failed${NC}"
echo -e "${GREEN}✓ Success${NC}"
```

Uses ANSI escape codes for terminal colors.

### Q12: How do you handle command-line arguments?
**A:**
```bash
case "${1:-help}" in      # $1 is first argument, default to "help"
    start)   cmd_start ;;  # If argument is "start", run cmd_start
    stop)    cmd_stop ;;
    *)       cmd_help ;;   # Anything else shows help
esac
```

Also pass arguments to functions:
```bash
cmd_block "$@"            # Pass all arguments
cmd_search "$2"           # Pass specific argument (domain)
```

### Q13: How do you check for root privileges?
**A:**
```bash
check_root() {
    if [[ $EUID -ne 0 ]]; then  # EUID = Effective User ID
        echo "Requires root"      # 0 = root, non-zero = regular user
        exit 1                    # Exit with error code
    fi
}
```

`$EUID` is 0 only when running as root.

### Q14: Explain function definition in your scripts
**A:**
```bash
# Define function
function_name() {
    echo "First parameter: $1"
    echo "Second parameter: $2"
    local variable="stays local"
    return 0  # Return status
}

# Call function
function_name "value1" "value2"

# Store return value/output
result=$(function_name "test")
```

Functions group code, improve readability, reduce duplication.

---

## SECTION 5: AWK & TEXT PROCESSING

### Q15: Explain how awk parses the Squid log format
**A:**
Squid log format:
```
TIME IP METHOD URL STATUS SIZE
1234 192.168.1.1 GET http://example.com 200 5000
```

AWK Field Breaking:
```bash
awk '{print $3}'              # $3 = Client IP
awk '{print $5}'              # $5 = Response status
awk '{print $6}'              # $6 = Response size
awk -F'[ /]' '{print $7}'     # $7 = Domain (using / as delimiter)
```

By default AWK splits on whitespace (space, tab). We can change delimiter with `-F`.

### Q16: How do you aggregate data with awk?
**A:**
```bash
# Count traffic per user
awk '{bytes[$3]+=$5} END {for(u in bytes) print u, bytes[u]}' access.log

# Field $3 = user IP, $5 = bytes
# Creates array: bytes["192.168.1.1"] = 50000
# In END block, loops through and prints totals
```

Uses associative arrays (like hash maps) to aggregate.

### Q17: Complex awk examples from your project
**A:**
```bash
# Calculate average response size
awk '{sum+=$5; count++} END {print sum/count}' access.log

# Show top HTTP status codes
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# Find all traffic over 1MB
awk '$5 > 1048576 {print $0}' access.log
```

---

## SECTION 6: SYSTEM ADMINISTRATION

### Q18: How does systemctl manage services?
**A:**
```bash
sudo systemctl start squid              # Start service
sudo systemctl stop squid               # Stop service
sudo systemctl restart squid            # Restart (stop then start)
sudo systemctl reload squid             # Reload config (graceful restart)
sudo systemctl status squid             # Show status
sudo systemctl is-active --quiet squid  # Check if running (returns 0/1)
sudo systemctl enable squid             # Auto-start on boot
```

Systemctl manages services in `/etc/systemd/system/` through `systemd` daemon.

### Q19: How do you reload Squid configuration without downtime?
**A:**
```bash
# Full restart (downtime)
sudo systemctl restart squid

# Graceful reload (no downtime)
sudo systemctl reload squid

# Validate before reloading
squid -k check  # Test configuration syntax

# If valid (return 0), then reload
sudo systemctl reload squid
```

Reload applies config changes while maintaining active connections.

### Q20: How do you handle file permissions in your project?
**A:**
```bash
chmod +x proxywatch.sh        # Make script executable (755)
chmod 644 blocked_sites.txt   # Log file readable (644)
chmod 600 config_backup.conf  # Sensitive file secure (600)

# Breakdown:
# 7 (rwx) = read + write + execute
# 6 (rw-) = read + write
# 5 (r-x) = read + execute
# 4 (r--) = read only
# 0 (---) = no permissions
```

---

## SECTION 7: REAL-WORLD SCENARIOS

### Q21: A user is being blocked from a website. How do you troubleshoot?
**A:**
1. **Check if site is blocked:**
   ```bash
   ./proxywatch.sh blocked  # List blocked domains
   grep "dstdomain .example.com" /etc/squid/squid.conf
   ```

2. **Check logs for denials:**
   ```bash
   ./proxywatch.sh search "example.com"
   grep "TCP_DENIED" /var/log/squid/access.log | grep "example.com"
   ```

3. **Check Squid status:**
   ```bash
   ./proxywatch.sh status
   sudo tail -20 /var/log/squid/cache.log  # Error logs
   ```

4. **Solutions:**
   - If accidentally blocked: `./proxywatch.sh unblock example.com`
   - If Squid crashed: `./proxywatch.sh restart`
   - If config corrupted: `./proxywatch.sh restore` (restore from backup)

### Q22: How do you prevent a legitimate domain from being blocked?
**A:**
1. **Before blocking, verify:**
   ```bash
   # Search for this domain in logs first
   ./proxywatch.sh search "example.com"
   ```

2. **Create whitelist in production:**
   ```bash
   # Add to squid.conf BEFORE blocking rules
   acl whitelist dstdomain .example.com
   http_access allow whitelist
   http_access deny blocked_sites
   ```

3. **Use block to create list, not individual rules:**
   At scale, use blocklists (thousands of domains) instead of manual blocking.

### Q23: Your proxy is using too much bandwidth. How do you investigate?
**A:**
1. **Find top users:**
   ```bash
   ./proxywatch.sh top-users     # See which clients use most data
   ```

2. **Find top domains:**
   ```bash
   ./proxywatch.sh top-sites     # See which sites use bandwidth
   ```

3. **Find large transfers:**
   ```bash
   awk '$5 > 104857600 {print}' /var/log/squid/access.log  # >100MB
   ```

4. **Actions:**
   - Block the bandwidth-heavy domain
   - Set quotas in Squid config
   - Schedule bandwidth-heavy activities off-peak

---

## SECTION 8: ADVANCED CONCEPTS

### Q24: How would you scale this to handle enterprise traffic?
**A:**
1. **Performance optimization:**
   - Use database instead of log files for faster queries
   - Implement caching layer (Redis)
   - Archive old logs

2. **High availability:**
   - Run Squid in cluster mode
   - Load balance between multiple proxies
   - Failover to backup proxy if primary fails

3. **Enhanced monitoring:**
   - Web dashboard (Flask/Django)
   - Real-time alerts (email/Slack)
   - Metrics collection (Prometheus)
   - Visualization (Grafana)

4. **Security:**
   - PAM authentication integration
   - SSL certificate validation
   - Rate limiting per user
   - DDoS protection

### Q25: How do you back up and restore configurations?
**A:**
```bash
# Backup
./proxywatch.sh backup
# Copies /etc/squid/squid.conf to ~/proxywatch/config/squid.conf.backup

# Corrupted config? Restore:
./proxywatch.sh restore
# Copies backup back to /etc/squid/squid.conf
```

Good for disaster recovery when config is accidentally modified.

### Q26: How do you automate routine tasks with cron?
**A:**
```bash
# Edit crontab
crontab -e

# Add these:
0 * * * * /home/user/proxywatch/proxywatch.sh stats >> /tmp/proxy.log
*/30 * * * * /home/user/proxywatch/proxywatch.sh backup

# Cron format: minute hour day month weekday command
# 0 * = every hour at minute 0
# */30 = every 30 minutes
# 0 0 * * * = every day at midnight
```

Automates backups, monitoring, log rotation.

---

## SECTION 9: PROJECT IMPROVEMENTS

### Q27: What features could you add?
**A:**
1. **Web Dashboard** - Flask/Django for browser UI
2. **Database** - SQLite/MySQL for persistent storage
3. **User Authentication** - LDAP/Active Directory integration
4. **Alerts** - Email/Slack notifications on thresholds
5. **Bandwidth Throttling** - Limit traffic per user
6. **Content Filtering** - Block by keyword/regex
7. **Compliance Reports** - Generate audit reports
8. **Mobile App** - Monitor via phone
9. **API** - RESTful interface for programmatic access
10. **Machine Learning** - Anomaly detection

### Q28: How would you test this project?
**A:**
```bash
# Unit testing
# Test individual scripts in isolation
./scripts/analyzer.sh users
./scripts/control.sh status

# Integration testing
# Test complete workflow
./proxywatch.sh start
# Generate traffic
./proxywatch.sh stats

# Load testing
# Simulate many requests
for i in {1..1000}; do
    curl -x 127.0.0.1:3128 http://example.com &
done

# Security testing
# Verify blocking works
curl -x 127.0.0.1:3128 http://facebook.com  # Should be denied
```

---

## SECTION 10: VIVA PRESENTATION TIPS

### Q29: How would you explain this project to a non-technical person?
**A:**
"ProxyWatch is like a security guard for internet traffic. When employees access the internet, their traffic goes through Squid proxy. ProxyWatch helps the administrator:
1. See who's accessing what (analytics)
2. Block inappropriate websites (security)
3. Monitor suspicious activity (alerts)
4. Manage network resources (logging)

It's used in enterprises, schools, and organizations to protect networks."

### Q30: What was the most challenging part of this project?
**A:**
- Parsing complex log formats with awk (lots of field delimiters)
- Handling special characters in domain names for blocking rules
- Managing Squid configuration syntax correctly
- Ensuring proper error handling and user feedback
- Making scripts secure (avoiding command injection)

**Solution:** Thorough testing, research Squid documentation, test edge cases.

---

## QUICK REFERENCE TABLE

| Concept | Command/Code | Purpose |
|---------|--------------|---------|
| Extract field | `awk '{print $3}'` | Get 3rd column |
| Count uniques | `sort &#124; uniq -c` | Frequency analysis |
| Show top N | `sort -rn &#124; head -10` | Top 10 items |
| Format output | `printf "%s: %d\n"` | Pretty printing |
| Check root | `if [[ $EUID -ne 0 ]]` | Root check |
| Start service | `systemctl start squid` | Service control |
| Watch logs | `tail -f access.log` | Real-time view |
| Search logs | `grep "search_term"` | Find entries |
| Array in awk | `arr[$1] += $2` | Aggregate data |
| Block domain | `echo "acl rule..."` | Add rule to conf |

---

## FINAL TIPS

✅ **Confident Answer**: "I designed this to handle X by using Y"

✅ **Specific Examples**: Show actual command output when explaining

✅ **Admit Limitations**: "With current design, large-scale would need..."

✅ **Show thinking**: "I used awk because it's efficient for log parsing..."

❌ **Don't**: Say "I don't know" - instead "That's interesting, I would research..."

❌ **Don't**: Over-complicate answers - keep it simple and structured

❌ **Don't**: Memorize - understand the concepts behind each part

---

**Good luck with your viva! 🎓**
