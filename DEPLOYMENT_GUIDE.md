# 🚀 ProxyWatch Deployment Guide

## QUICK SETUP (Copy-Paste)

### Step 1: Prepare Environment (On Linux Machine)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Squid
sudo apt install squid curl wget -y

# Verify Squid
squid -v
```

### Step 2: Create Project Directory

```bash
# Create project folder
mkdir -p ~/proxywatch/{scripts,config,logs,data}
cd ~/proxywatch
```

### Step 3: Copy Files

Copy these files from your Windows machine to the Linux VM:

**Files to copy to `~/proxywatch/`:**
- `proxywatch.sh` → Main CLI tool
- `scripts/analyzer.sh`
- `scripts/control.sh`
- `scripts/block.sh`
- `scripts/monitor.sh`

**Method 1: Using SCP (from Windows/Linux)**
```bash
# From Windows with WSL or Git Bash:
scp -r C:\Users\YourUser\proxywatch/* user@linux-vm:~/proxywatch/
```

**Method 2: Manual Copy**
Create files manually in Linux using `nano` or `vim`

### Step 4: Set Permissions

```bash
cd ~/proxywatch
chmod +x proxywatch.sh
chmod +x scripts/*.sh
```

### Step 5: Start Squid

```bash
# Start Squid service
sudo systemctl start squid

# Check status
sudo systemctl status squid

# Verify it's running
sudo netstat -tlnp | grep squid
```

You should see port `3128` listening.

---

## 🎯 FIRST TEST RUN

### Test 1: Basic Commands

```bash
# Check help
./proxywatch.sh help

# Check proxy status
./proxywatch.sh status

# View proxy logs (initially empty)
./proxywatch.sh logs
```

### Test 2: Generate Traffic

**Option A: Using curl**
```bash
# Set proxy and fetch a page
curl -x 127.0.0.1:3128 http://example.com
```

**Option B: Browser Proxy**
1. Open browser settings
2. Set HTTP Proxy: `127.0.0.1` Port: `3128`
3. Visit a website (youtube.com, google.com, etc.)

### Test 3: Analyze Traffic

After generating traffic, run:

```bash
# View latest logs
./proxywatch.sh logs

# See top users
./proxywatch.sh top-users

# See top sites
./proxywatch.sh top-sites
```

---

## 🔥 FULL FEATURE DEMO

Run these commands in sequence to demonstrate all features:

```bash
# 1. STARTUP
./proxywatch.sh start

# 2. GENERATE TRAFFIC (in another terminal)
# curl -x 127.0.0.1:3128 http://example.com
# OR use browser with proxy set

# 3. ANALYTICS
./proxywatch.sh stats
./proxywatch.sh top-users
./proxywatch.sh top-sites
./proxywatch.sh status-codes

# 4. SECURITY - BLOCK A SITE
./proxywatch.sh block facebook.com

# 5. VERIFY BLOCK
./proxywatch.sh blocked

# 6. SEARCH LOGS
./proxywatch.sh search "GET"

# 7. LIVE MONITORING
./proxywatch.sh live          # Watch live traffic
# Press Ctrl+C to stop

# 8. REAL-TIME MONITOR
./proxywatch.sh monitor       # Dashboard with auto-refresh
# Press Ctrl+C to stop

# 9. BACKUP
./proxywatch.sh backup

# 10. STOP
./proxywatch.sh stop
```

---

## 📊 COMMAND REFERENCE

### Proxy Control
```bash
./proxywatch.sh start          # Start proxy
./proxywatch.sh stop           # Stop proxy
./proxywatch.sh restart        # Restart proxy
./proxywatch.sh status         # Show status
./proxywatch.sh reload         # Reload config
```

### View Traffic
```bash
./proxywatch.sh logs           # Show last 20 entries
./proxywatch.sh live           # Watch traffic in real-time
./proxywatch.sh search "term"  # Search logs
```

### Analytics
```bash
./proxywatch.sh stats          # Summary statistics
./proxywatch.sh top-users      # Top 10 users
./proxywatch.sh top-sites      # Top 10 domains
./proxywatch.sh status-codes   # HTTP status breakdown
./proxywatch.sh traffic        # Traffic volume
```

### Security
```bash
./proxywatch.sh block example.com      # Block domain
./proxywatch.sh unblock example.com    # Unblock domain
./proxywatch.sh blocked                # List blocked sites
```

### Monitoring
```bash
./proxywatch.sh monitor        # Real-time dashboard
```

### Maintenance
```bash
./proxywatch.sh backup         # Backup config
./proxywatch.sh restore        # Restore backup
```

---

## 🛠️ TROUBLESHOOTING

### Issue: "Squid is not running"
```bash
# Check status
sudo systemctl status squid

# Start manually
sudo systemctl start squid

# Check errors
sudo tail -20 /var/log/squid/cache.log
```

### Issue: "Permission denied on scripts"
```bash
# Fix permissions
chmod +x ~/proxywatch/proxywatch.sh
chmod +x ~/proxywatch/scripts/*.sh
```

### Issue: "No logs appearing"
```bash
# Verify Squid is running
sudo systemctl status squid

# Check log file location
ls -l /var/log/squid/access.log

# Generate traffic
curl -x 127.0.0.1:3128 http://example.com

# Check logs again
tail /var/log/squid/access.log
```

### Issue: "Port 3128 already in use"
```bash
# Find what's using port 3128
sudo netstat -tlnp | grep 3128

# Kill the process
sudo kill -9 <PID>

# Or use different port in squid.conf
sudo nano /etc/squid/squid.conf
# Change: http_port 3128
# To: http_port 3129
```

### Issue: "Cannot access blocked.txt"
```bash
# Create data directory
mkdir -p ~/proxywatch/data

# Fix in scripts: update BLOCKED_FILE path
nano ~/proxywatch/scripts/block.sh
# Change to your actual home: /home/username/proxywatch/data/blocked_sites.txt
```

---

## 📈 ADVANCED SETUP (Optional)

### Auto-Start on Boot

```bash
# Create systemd service
sudo nano /etc/systemd/system/proxywatch.service
```

Paste:
```ini
[Unit]
Description=ProxyWatch - Proxy Management
After=network.target

[Service]
Type=simple
User=root
ExecStart=/home/ubuntu/proxywatch/proxywatch.sh start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable proxywatch.service
```

### Automated Monitoring

```bash
# Edit crontab
crontab -e

# Add this to run monitoring every 30 minutes
*/30 * * * * /home/ubuntu/proxywatch/proxywatch.sh stats >> /tmp/proxywatch.log 2>&1
```

### Log Rotation

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/squid

# Add:
/var/log/squid/access.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## 🎓 VIVA PRESENTATION SCRIPT

**When demonstrating to your instructor:**

1. **Start Clean**
   ```bash
   ./proxywatch.sh start
   ./proxywatch.sh status
   ```

2. **Create Sample Traffic**
   ```bash
   # In another terminal
   for i in {1..50}; do
     curl -x 127.0.0.1:3128 http://example.com --silent -o /dev/null
   done
   ```

3. **Show Analytics**
   ```bash
   ./proxywatch.sh stats      # Talk about total requests
   ./proxywatch.sh top-users  # Show client analysis
   ./proxywatch.sh top-sites  # Show domain analysis
   ```

4. **Demonstrate Security**
   ```bash
   ./proxywatch.sh block facebook.com
   # Explain: Now facebook.com will be blocked
   ./proxywatch.sh blocked
   ```

5. **Show Real-Time Monitoring**
   ```bash
   ./proxywatch.sh monitor
   # In another terminal generate traffic
   # Show live updates
   ```

6. **Advanced Commands**
   ```bash
   ./proxywatch.sh search "200"    # Show successful requests
   ./proxywatch.sh live            # Live traffic stream
   ```

7. **Backup/Disaster Recovery**
   ```bash
   ./proxywatch.sh backup
   # Explain disaster recovery plan
   ```

---

## 📝 Key Points to Mention in Viva

1. **Architecture**: Squid proxy + Bash CLI wrapper
2. **Log Analysis**: Using `awk`, `grep`, ` sort`, `uniq` for real-time data
3. **Security**: Domain-based blocking with ACL rules
4. **Automation**: Cron jobs for scheduled tasks
5. **Scalability**: Can handle thousands of requests with efficient log parsing
6. **Monitoring**: Real-time dashboards with auto-refresh
7. **Backup**: Configuration versioning and disaster recovery
8. **Linux Skills**: Systemctl, user privileges, file permissions, process management

---

## 🚀 NEXT LEVEL (Web Interface - Optional)

If you want to impress more:

```bash
# Create simple Python dashboard
pip install flask
nano app.py
```

This would add a web UI on `localhost:5000` for log viewing and analytics.

---

**STATUS**: ✅ Complete and Ready
**ESTIMATED TIME TO SETUP**: 15-20 minutes
**ESTIMATED TIME TO DEMO**: 10 minutes

Good luck! 🎯
