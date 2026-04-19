#!/bin/bash

####################################################################
#  CONTROL.SH - Proxy Service Control Module
#  Advanced service management and configuration
####################################################################

SQUID_CONF="/etc/squid/squid.conf"
SQUID_CACHE="/var/spool/squid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}This script requires root privileges${NC}"
        exit 1
    fi
}

# Start service with checks
start_proxy() {
    echo -e "${YELLOW}Starting Squid proxy...${NC}"

    # Initialize cache if needed
    if [ ! -d "$SQUID_CACHE" ] || [ -z "$(ls -A $SQUID_CACHE)" ]; then
        echo "Initializing cache..."
        sudo squid -z -N
    fi

    sudo systemctl start squid

    sleep 2

    if sudo systemctl is-active --quiet squid; then
        echo -e "${GREEN}✓ Squid started successfully${NC}"
        echo "Proxy available: 127.0.0.1:3128"
    else
        echo -e "${RED}✗ Failed to start Squid${NC}"
        sudo systemctl status squid
        exit 1
    fi
}

# Stop service gracefully
stop_proxy() {
    echo -e "${YELLOW}Stopping Squid proxy...${NC}"

    sudo systemctl stop squid

    sleep 1

    if ! sudo systemctl is-active --quiet squid; then
        echo -e "${GREEN}✓ Squid stopped${NC}"
    else
        echo -e "${RED}✗ Squid still running${NC}"
        exit 1
    fi
}

# Restart service
restart_proxy() {
    echo -e "${YELLOW}Restarting Squid proxy...${NC}"

    sudo systemctl restart squid

    sleep 2

    if sudo systemctl is-active --quiet squid; then
        echo -e "${GREEN}✓ Squid restarted${NC}"
    else
        echo -e "${RED}✗ Restart failed${NC}"
        exit 1
    fi
}

# Show detailed status
show_status() {
    echo "════════════════════════════════════════"
    echo "  Squid Proxy Status"
    echo "════════════════════════════════════════"
    echo ""

    # Service status
    if sudo systemctl is-active --quiet squid; then
        echo -e "Service Status: ${GREEN}RUNNING${NC}"
    else
        echo -e "Service Status: ${RED}STOPPED${NC}"
    fi

    # Process count
    local proc_count=$(ps aux | grep -c "[s]quid")
    echo "Processes: $proc_count"

    # Uptime
    local uptime=$(systemctl show squid --property=ActiveEnterTimestamp | cut -d= -f2)
    echo "Started: $uptime"

    # Port info
    echo "Port: 3128"
    echo ""

    # Memory usage
    echo -e "${YELLOW}Resource Usage:${NC}"
    ps aux | grep squid | grep -v grep | awk '{printf "  Memory: %s MB (%.1f%%)\n", int($6/1024), $3}'
}

# Reload configuration
reload_config() {
    echo -e "${YELLOW}Reloading configuration...${NC}"

    # Validate configuration first
    sudo squid -k check

    if [ $? -eq 0 ]; then
        sudo systemctl reload squid
        echo -e "${GREEN}✓ Configuration reloaded${NC}"
    else
        echo -e "${RED}✗ Configuration has errors${NC}"
        exit 1
    fi
}

# Check configuration
check_config() {
    echo -e "${YELLOW}Checking Squid configuration...${NC}"
    echo ""

    sudo squid -k check || {
        echo -e "${RED}Configuration has errors${NC}"
        exit 1
    }

    echo -e "${GREEN}✓ Configuration is valid${NC}"
}

# Show log access rules
show_rules() {
    echo "════════════════════════════════════════"
    echo "  Current Access Rules"
    echo "════════════════════════════════════════"
    echo ""

    grep "^acl\|^http_access" "$SQUID_CONF" | head -20
}

# Main router
case "${1:-help}" in
    start)       check_root; start_proxy ;;
    stop)        check_root; stop_proxy ;;
    restart)     check_root; restart_proxy ;;
    reload)      check_root; reload_config ;;
    status)      show_status ;;
    validate)    check_config ;;
    rules)       show_rules ;;
    *)
        echo "Usage: $0 [start|stop|restart|reload|status|validate|rules]"
        ;;
esac
