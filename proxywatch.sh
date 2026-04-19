#!/bin/bash

####################################################################
#  PROXYWATCH - Real-Time Traffic Monitoring Platform
#  Main CLI Tool for Proxy Server Management
#
#  Author: Student
#  Date: 2026
#
#  USAGE: ./proxywatch.sh [command] [options]
####################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SQUID_LOG="/var/log/squid/access.log"
SQUID_CONF="/etc/squid/squid.conf"
BLOCKED_FILE="$HOME/proxywatch/data/blocked_sites.txt"
CONFIG_BACKUP="$HOME/proxywatch/config/squid.conf.backup"

####################################################################
# UTILITY FUNCTIONS
####################################################################

# Print colored header
print_header() {
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}  ProxyWatch - $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
}

# Print success message
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Print error message
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Print warning message
print_warning() {
    echo -e "${YELLOW}! $1${NC}"
}

# Check if root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This command requires root privileges"
        echo "Run: sudo $0 $@"
        exit 1
    fi
}

# Check if Squid is installed
check_squid() {
    if ! command -v squid &> /dev/null; then
        print_error "Squid is not installed"
        echo "Install: sudo apt install squid -y"
        exit 1
    fi
}

####################################################################
# PROXY CONTROL COMMANDS
####################################################################

cmd_start() {
    print_header "Starting Proxy Server"
    check_root
    check_squid

    sudo systemctl start squid

    if sudo systemctl is-active --quiet squid; then
        print_success "Squid proxy started successfully"
        echo "Proxy available at: 127.0.0.1:3128"
    else
        print_error "Failed to start Squid proxy"
        sudo systemctl status squid
        exit 1
    fi
}

cmd_stop() {
    print_header "Stopping Proxy Server"
    check_root

    sudo systemctl stop squid

    if ! sudo systemctl is-active --quiet squid; then
        print_success "Squid proxy stopped successfully"
    else
        print_error "Failed to stop Squid proxy"
        exit 1
    fi
}

cmd_restart() {
    print_header "Restarting Proxy Server"
    check_root

    sudo systemctl restart squid

    if sudo systemctl is-active --quiet squid; then
        print_success "Squid proxy restarted successfully"
    else
        print_error "Failed to restart Squid proxy"
        exit 1
    fi
}

cmd_status() {
    print_header "Proxy Server Status"
    check_squid

    sudo systemctl status squid --no-pager
}

cmd_reload() {
    print_header "Reloading Proxy Configuration"
    check_root

    sudo systemctl reload squid
    print_success "Configuration reloaded"
}

####################################################################
# LOG VIEWING COMMANDS
####################################################################

cmd_logs() {
    print_header "Display Proxy Access Logs"

    if [ ! -f "$SQUID_LOG" ]; then
        print_error "Log file not found: $SQUID_LOG"
        exit 1
    fi

    # Show last 20 entries
    echo -e "${YELLOW}Latest entries (last 20):${NC}"
    tail -20 "$SQUID_LOG"
    echo ""
    echo "Total log entries: $(wc -l < $SQUID_LOG)"
}

cmd_live_logs() {
    print_header "Live Log Monitoring"
    print_warning "Press Ctrl+C to stop"
    echo ""

    sudo tail -f "$SQUID_LOG"
}

cmd_search() {
    if [ -z "$2" ]; then
        print_error "Usage: $0 search <search_term>"
        exit 1
    fi

    print_header "Searching Logs for: $2"

    grep -i "$2" "$SQUID_LOG" | tail -20

    echo ""
    echo "Matches found: $(grep -ic "$2" $SQUID_LOG)"
}

####################################################################
# ANALYTICS COMMANDS
####################################################################

cmd_top_users() {
    print_header "Top Users (by traffic)"

    if [ ! -f "$SQUID_LOG" ]; then
        print_error "Log file not found"
        exit 1
    fi

    echo -e "${YELLOW}Top 10 Users:${NC}"
    awk '{print $3}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -10 | \
        awk '{printf "%4d requests | %s\n", $1, $2}'
}

cmd_top_sites() {
    print_header "Top Sites (most visited)"

    if [ ! -f "$SQUID_LOG" ]; then
        print_error "Log file not found"
        exit 1
    fi

    echo -e "${YELLOW}Top 10 Visited Domains:${NC}"
    awk -F'[ /]' '{print $7}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -10 | \
        awk '{printf "%4d visits | %s\n", $1, $2}'
}

cmd_status_codes() {
    print_header "Response Status Codes"

    if [ ! -f "$SQUID_LOG" ]; then
        print_error "Log file not found"
        exit 1
    fi

    echo -e "${YELLOW}Status Code Distribution:${NC}"
    awk '{print $9}' "$SQUID_LOG" | sort | uniq -c | sort -rn | \
        awk '{printf "%4d | HTTP %s\n", $1, $2}'
}

cmd_traffic_size() {
    print_header "Traffic Volume Analysis"

    if [ ! -f "$SQUID_LOG" ]; then
        print_error "Log file not found"
        exit 1
    fi

    echo -e "${YELLOW}Traffic Statistics:${NC}"
    local total_bytes=$(awk '{sum+=$5} END {print sum}' "$SQUID_LOG")
    local total_mb=$((total_bytes / 1048576))

    echo "Total traffic: ${total_mb} MB"
    echo "Average request size: $(awk '{sum+=$5; count++} END {if(count>0) print int(sum/count)}' $SQUID_LOG) bytes"
}

####################################################################
# BLOCKING COMMANDS
####################################################################

cmd_block() {
    if [ -z "$2" ]; then
        print_error "Usage: $0 block <domain>"
        exit 1
    fi

    print_header "Blocking Domain: $2"
    check_root

    local domain="$2"

    # Check if already blocked
    if grep -q "dstdomain .$domain" "$SQUID_CONF"; then
        print_warning "Domain already blocked: $domain"
        return 0
    fi

    # Add block rule
    echo "" | sudo tee -a "$SQUID_CONF" > /dev/null
    echo "acl blocked_domain_${domain/./_} dstdomain .$domain" | sudo tee -a "$SQUID_CONF" > /dev/null
    echo "http_access deny blocked_domain_${domain/./_}" | sudo tee -a "$SQUID_CONF" > /dev/null

    # Save to blocked list
    mkdir -p "$HOME/proxywatch/data"
    echo "$domain" >> "$BLOCKED_FILE"

    # Reload configuration
    sudo systemctl reload squid

    print_success "Domain blocked: $domain"
}

cmd_unblock() {
    if [ -z "$2" ]; then
        print_error "Usage: $0 unblock <domain>"
        exit 1
    fi

    print_header "Unblocking Domain: $2"
    check_root

    local domain="$2"

    # Remove from blocked list
    if [ -f "$BLOCKED_FILE" ]; then
        sed -i "/$domain/d" "$BLOCKED_FILE"
    fi

    # Note: Removing from squid.conf requires more complex handling
    print_warning "Note: Manual removal from squid.conf may be needed"
    print_success "Domain removed from blocked list"
}

cmd_list_blocked() {
    print_header "Blocked Domains List"

    if [ ! -f "$BLOCKED_FILE" ]; then
        print_warning "No blocked domains found"
        return 0
    fi

    echo -e "${YELLOW}Currently Blocked:${NC}"
    cat -n "$BLOCKED_FILE"
}

####################################################################
# MONITORING COMMANDS
####################################################################

cmd_monitor() {
    print_header "Real-Time Traffic Monitor"
    print_warning "Press Ctrl+C to stop monitoring"
    echo ""

    check_squid

    while true; do
        clear
        print_header "ProxyWatch - Real-Time Monitor"
        echo -e "${YELLOW}Updated: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
        echo ""

        # Active connections
        echo -e "${BLUE}Active Users:${NC}"
        awk '{print $3}' "$SQUID_LOG" | tail -100 | sort | uniq -c | sort -rn | head -5 | \
            awk '{printf "  %s: %d requests\n", $2, $1}'

        echo ""
        echo -e "${BLUE}Recent Traffic:${NC}"
        tail -10 "$SQUID_LOG" | \
            awk '{printf "  %s -> %s (Size: %d bytes)\n", $3, $7, $5}'

        echo ""
        echo -e "${YELLOW}Status:${NC}"
        if sudo systemctl is-active --quiet squid; then
            echo -e "  Proxy: ${GREEN}RUNNING${NC}"
        else
            echo -e "  Proxy: ${RED}STOPPED${NC}"
        fi

        echo ""
        echo "Press Ctrl+C to exit, refreshing in 5 seconds..."
        sleep 5
    done
}

####################################################################
# STATISTICS COMMANDS
####################################################################

cmd_stats() {
    print_header "Proxy Statistics"

    if [ ! -f "$SQUID_LOG" ]; then
        print_error "Log file not found"
        exit 1
    fi

    local total_requests=$(wc -l < "$SQUID_LOG")
    local unique_users=$(awk '{print $3}' "$SQUID_LOG" | sort -u | wc -l)
    local unique_sites=$(awk -F'[ /]' '{print $7}' "$SQUID_LOG" | sort -u | wc -l)

    echo -e "${YELLOW}Summary Statistics:${NC}"
    echo "  Total Requests: $total_requests"
    echo "  Unique Users: $unique_users"
    echo "  Unique Domains: $unique_sites"

    echo ""
    echo -e "${YELLOW}Response Codes:${NC}"
    awk '{print $9}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -5 | \
        awk '{printf "    %s: %d\n", $2, $1}'
}

####################################################################
# BACKUP/RESTORE COMMANDS
####################################################################

cmd_backup() {
    print_header "Backup Configuration"
    check_root

    mkdir -p "$(dirname $CONFIG_BACKUP)"
    cp "$SQUID_CONF" "$CONFIG_BACKUP"

    if [ -f "$CONFIG_BACKUP" ]; then
        print_success "Configuration backed up to: $CONFIG_BACKUP"
    else
        print_error "Backup failed"
        exit 1
    fi
}

cmd_restore() {
    print_header "Restore Configuration"
    check_root

    if [ ! -f "$CONFIG_BACKUP" ]; then
        print_error "Backup file not found: $CONFIG_BACKUP"
        exit 1
    fi

    cp "$CONFIG_BACKUP" "$SQUID_CONF"
    print_success "Configuration restored"
    cmd_reload
}

####################################################################
# HELP & INFO
####################################################################

cmd_help() {
    cat << 'EOF'

╔════════════════════════════════════════════════════════════════╗
║          PROXYWATCH - Proxy Server Management CLI              ║
║                                                                ║
║  Real-Time Traffic Monitoring Platform                        ║
╚════════════════════════════════════════════════════════════════╝

PROXY CONTROL:
  start              Start Squid proxy server
  stop               Stop Squid proxy server
  restart            Restart Squid proxy server
  status             Show proxy server status
  reload             Reload proxy configuration

LOG VIEWING:
  logs               Show recent proxy logs
  live               Watch live proxy traffic
  search <term>      Search logs for specific term

ANALYTICS:
  top-users          Show top traffic users
  top-sites          Show most visited domains
  status-codes       Show HTTP status code distribution
  traffic            Show traffic volume statistics
  stats              Show summary statistics

SECURITY:
  block <domain>     Block a domain
  unblock <domain>   Unblock a domain
  blocked            List all blocked domains

MONITORING:
  monitor            Real-time traffic monitor (5s refresh)

MAINTENANCE:
  backup             Backup squid configuration
  restore            Restore from backup

HELP:
  help               Show this help message
  version            Show version information

EXAMPLES:
  ./proxywatch.sh start
  ./proxywatch.sh top-users
  ./proxywatch.sh block facebook.com
  ./proxywatch.sh monitor
  ./proxywatch.sh search "GET"

EOF
}

cmd_version() {
    echo "ProxyWatch v1.0.0"
    echo "Real-Time Traffic Monitoring Platform"
    echo "© 2026"
}

####################################################################
# MAIN ROUTING
####################################################################

main() {
    case "${1:-help}" in
        # Proxy Control
        start)           cmd_start ;;
        stop)            cmd_stop ;;
        restart)         cmd_restart ;;
        status)          cmd_status ;;
        reload)          cmd_reload ;;

        # Log Viewing
        logs)            cmd_logs ;;
        live)            cmd_live_logs ;;
        search)          cmd_search "$@" ;;

        # Analytics
        top-users)       cmd_top_users ;;
        top-sites)       cmd_top_sites ;;
        status-codes)    cmd_status_codes ;;
        traffic)         cmd_traffic_size ;;
        stats)           cmd_stats ;;

        # Security
        block)           cmd_block "$@" ;;
        unblock)         cmd_unblock "$@" ;;
        blocked)         cmd_list_blocked ;;

        # Monitoring
        monitor)         cmd_monitor ;;

        # Maintenance
        backup)          cmd_backup ;;
        restore)         cmd_restore ;;

        # Help
        help)            cmd_help ;;
        version)         cmd_version ;;

        # Unknown
        *)
            print_error "Unknown command: $1"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
