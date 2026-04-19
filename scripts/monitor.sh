#!/bin/bash

####################################################################
#  MONITOR.SH - Real-Time Monitoring Module
#  Advanced monitoring and alerting
####################################################################

SQUID_LOG="/var/log/squid/access.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Real-time user monitor
monitor_users() {
    echo -e "${BLUE}Real-Time User Monitor${NC}"
    echo "Press Ctrl+C to stop"
    echo ""

    while true; do
        clear
        echo -e "${BLUE}=== Active Users (Last 100 entries) ===${NC}"
        echo "Updated: $(date '+%H:%M:%S')"
        echo ""

        tail -100 "$SQUID_LOG" | awk '{print $3}' | sort | uniq -c | sort -rn | head -10 | \
            awk '{printf "  %-20s %5d requests\n", $2, $1}'

        sleep 3
    done
}

# Monitor suspicious activity
monitor_suspicious() {
    echo -e "${BLUE}Monitoring Suspicious Activity${NC}"
    echo "Looking for anomalies..."
    echo ""

    # Check for high volume requests
    local user_requests=$(awk '{print $3}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -1)
    read -r count user <<< "$user_requests"

    if [ "$count" -gt 100 ]; then
        echo -e "${RED}⚠ High activity: $user with $count requests${NC}"
    fi

    # Check for failed requests
    local errors=$(grep " 5[0-9][0-9] " "$SQUID_LOG" | wc -l)
    if [ "$errors" -gt 10 ]; then
        echo -e "${RED}⚠ $errors server errors detected${NC}"
    fi

    # Check for large transfers
    local large_transfers=$(awk '$5 > 104857600 {print}' "$SQUID_LOG" | wc -l)
    if [ "$large_transfers" -gt 0 ]; then
        echo -e "${YELLOW}! $large_transfers large transfers (>100MB)${NC}"
    fi

    echo -e "${GREEN}Monitoring complete${NC}"
}

# Live traffic stream
live_traffic() {
    echo -e "${BLUE}Live Traffic Stream${NC}"
    echo "Press Ctrl+C to stop"
    echo ""

    tail -f "$SQUID_LOG" | while read line; do
        user=$(echo "$line" | awk '{print $3}')
        domain=$(echo "$line" | awk -F'[ /]' '{print $7}')
        size=$(echo "$line" | awk '{print $5}')
        status=$(echo "$line" | awk '{print $9}')

        # Color code by status
        if [[ $status == 200 ]]; then
            status_color="${GREEN}$status${NC}"
        elif [[ $status == 30* ]]; then
            status_color="${BLUE}$status${NC}"
        else
            status_color="${RED}$status${NC}"
        fi

        printf "[%s] %s -> %-30s (%s bytes) %b\n" \
            "$(date '+%H:%M:%S')" "$user" "$domain" "$size" "$status_color"
    done
}

# Bandwidth usage
monitor_bandwidth() {
    echo -e "${BLUE}Bandwidth Monitor${NC}"
    echo "Calculating from logs..."
    echo ""

    local total_bytes=0
    local old_bytes=0

    while true; do
        clear
        echo -e "${BLUE}=== Bandwidth Usage ===${NC}"
        echo "Updated: $(date '+%H:%M:%S')"
        echo ""

        total_bytes=$(awk '{sum+=$5} END {print sum}' "$SQUID_LOG")
        local total_mb=$((total_bytes / 1048576))

        # Recent traffic (last 100 entries)
        local recent_bytes=$(tail -100 "$SQUID_LOG" | awk '{sum+=$5} END {print sum}')
        local recent_mb=$((recent_bytes / 1048576))

        echo "Total: ${total_mb} MB"
        echo "Recent (last 100): ${recent_mb} MB"
        echo ""

        echo -e "${YELLOW}Top Bandwidth Users:${NC}"
        tail -1000 "$SQUID_LOG" | awk '{bytes[$3]+=$5} END {for(user in bytes) printf "  %-20s %7d MB\n", user, bytes[user]/1048576}' | sort -k2 -rn | head -5

        sleep 5
    done
}

# Generate alerts
check_alerts() {
    echo -e "${BLUE}Checking for Alerts${NC}"
    echo ""

    local alert_count=0

    # Alert 1: Quota exceeded
    local high_users=$(awk '{print $3}' "$SQUID_LOG" | sort | uniq -c | awk '$1 > 500 {print $2}' | wc -l)
    if [ "$high_users" -gt 0 ]; then
        echo -e "${RED}[ALERT] $high_users users exceeded quota${NC}"
        ((alert_count++))
    fi

    # Alert 2: Blocked attempts
    local blocked=$(grep "TCP_DENIED" "$SQUID_LOG" | wc -l)
    if [ "$blocked" -gt 50 ]; then
        echo -e "${RED}[ALERT] $blocked blocked requests${NC}"
        ((alert_count++))
    fi

    # Alert 3: Errors
    local errors=$(grep " 5[0-9][0-9] " "$SQUID_LOG" | wc -l)
    if [ "$errors" -gt 20 ]; then
        echo -e "${YELLOW}[WARNING] $errors server errors${NC}"
        ((alert_count++))
    fi

    if [ "$alert_count" -eq 0 ]; then
        echo -e "${GREEN}✓ No critical alerts${NC}"
    fi
}

# Summary dashboard
dashboard() {
    while true; do
        clear
        echo -e "${BLUE}${YELLOW}════════════════════════════════════════${NC}"
        echo -e "${YELLOW}         ProxyWatch Dashboard${NC}"
        echo -e "${BLUE}${YELLOW}════════════════════════════════════════${NC}"
        echo ""
        echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
        echo ""

        # Service status
        echo -e "${BLUE}Service:${NC}"
        if sudo systemctl is-active --quiet squid; then
            echo -e "  ${GREEN}✓ Running${NC}"
        else
            echo -e "  ${RED}✗ Stopped${NC}"
        fi

        # Quick stats
        echo ""
        echo -e "${BLUE}Quick Stats:${NC}"
        local requests=$(wc -l < "$SQUID_LOG")
        local users=$(awk '{print $3}' "$SQUID_LOG" | sort -u | wc -l)
        local domains=$(awk -F'[ /]' '{print $7}' "$SQUID_LOG" | sort -u | wc -l)

        printf "  Requests: %d | Users: %d | Domains: %d\n" "$requests" "$users" "$domains"

        # Top user
        echo ""
        echo -e "${BLUE}Top User:${NC}"
        awk '{print $3}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -1 | \
            awk '{printf "  %s (%d requests)\n", $2, $1}'

        # Top domain
        echo ""
        echo -e "${BLUE}Top Domain:${NC}"
        awk -F'[ /]' '{print $7}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -1 | \
            awk '{printf "  %s (%d visits)\n", $2, $1}'

        echo ""
        echo -e "${YELLOW}Refreshing in 10 seconds... (Ctrl+C to exit)${NC}"
        sleep 10
    done
}

# Main router
case "${1:-help}" in
    users)        monitor_users ;;
    suspicious)   monitor_suspicious ;;
    live)         live_traffic ;;
    bandwidth)    monitor_bandwidth ;;
    alerts)       check_alerts ;;
    dashboard)    dashboard ;;
    *)
        echo "Usage: $0 [users|suspicious|live|bandwidth|alerts|dashboard]"
        echo ""
        echo "Commands:"
        echo "  users         - Real-time user activity"
        echo "  suspicious    - Check for suspicious activity"
        echo "  live          - Live traffic stream"
        echo "  bandwidth     - Monitor bandwidth usage"
        echo "  alerts        - Check for alerts"
        echo "  dashboard     - Summary dashboard"
        ;;
esac
