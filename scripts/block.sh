#!/bin/bash

####################################################################
#  BLOCK.SH - Website Blocking Module
#  Add/remove domain blocking rules
####################################################################

SQUID_CONF="/etc/squid/squid.conf"
BLOCKED_LIST="/home/ubuntu/proxywatch/data/blocked_sites.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}Requires root privileges${NC}"
        exit 1
    fi
}

# Add blocking rule
block_domain() {
    local domain="$1"

    if [ -z "$domain" ]; then
        echo -e "${RED}Usage: $0 add <domain>${NC}"
        exit 1
    fi

    check_root

    echo -e "${YELLOW}Blocking: $domain${NC}"

    # Check if already blocked
    if grep -q "dstdomain .$domain" "$SQUID_CONF"; then
        echo -e "${YELLOW}Already blocked: $domain${NC}"
        return 0
    fi

    # Create safe rule name
    local rule_name="block_${domain//./_}"

    # Add to Squid config
    {
        echo ""
        echo "# Blocked domain: $domain - $(date)"
        echo "acl $rule_name dstdomain .$domain"
        echo "http_access deny $rule_name"
    } | sudo tee -a "$SQUID_CONF" > /dev/null

    # Track in blocked list
    mkdir -p "$(dirname $BLOCKED_LIST)"
    echo "$domain" >> "$BLOCKED_LIST"

    # Reload Squid
    sudo systemctl reload squid

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Domain blocked: $domain${NC}"
    else
        echo -e "${RED}✗ Failed to block domain${NC}"
        exit 1
    fi
}

# Remove blocking rule (simplified)
unblock_domain() {
    local domain="$1"

    if [ -z "$domain" ]; then
        echo -e "${RED}Usage: $0 remove <domain>${NC}"
        exit 1
    fi

    check_root

    echo -e "${YELLOW}Unblocking: $domain${NC}"

    # For full unblocking, would need to edit squid.conf
    # This simplified version just removes from tracking list
    if [ -f "$BLOCKED_LIST" ]; then
        sed -i "/$domain/d" "$BLOCKED_LIST"
        echo -e "${GREEN}✓ Removed from tracking${NC}"
    fi

    echo -e "${YELLOW}Note: Manual removal from squid.conf may be needed${NC}"
}

# Bulk import
import_blocklist() {
    local file="$1"

    if [ ! -f "$file" ]; then
        echo -e "${RED}File not found: $file${NC}"
        exit 1
    fi

    check_root

    echo -e "${YELLOW}Importing blocklist from: $file${NC}"

    local count=0
    while IFS= read -r domain; do
        [ -z "$domain" ] && continue
        domain=$(echo "$domain" | xargs) # trim whitespace

        if ! grep -q "dstdomain .$domain" "$SQUID_CONF"; then
            local rule_name="block_${domain//./_}"
            echo "acl $rule_name dstdomain .$domain" | sudo tee -a "$SQUID_CONF" > /dev/null
            echo "http_access deny $rule_name" | sudo tee -a "$SQUID_CONF" > /dev/null
            ((count++))
        fi
    done < "$file"

    sudo systemctl reload squid

    echo -e "${GREEN}✓ Added $count domains${NC}"
}

# List all blocked domains
list_blocked() {
    echo "════════════════════════════════════════"
    echo "  Blocked Domains"
    echo "════════════════════════════════════════"
    echo ""

    if [ ! -f "$BLOCKED_LIST" ]; then
        echo "No blocked domains"
        return 0
    fi

    cat -n "$BLOCKED_LIST"
    echo ""
    echo "Total: $(wc -l < $BLOCKED_LIST) domains"
}

# Export blocklist
export_blocklist() {
    local output="${1:-blocklist_export.txt}"

    echo -e "${YELLOW}Exporting to: $output${NC}"

    grep "dstdomain\." "$SQUID_CONF" | grep -o '\.\w.*' | sed 's/^.//' > "$output"

    echo -e "${GREEN}✓ Exported $(wc -l < $output) domains${NC}"
}

# Main router
case "${1:-help}" in
    add)        block_domain "$2" ;;
    remove)     unblock_domain "$2" ;;
    import)     import_blocklist "$2" ;;
    list)       list_blocked ;;
    export)     export_blocklist "$2" ;;
    *)
        echo "Usage: $0 [add|remove|import|list|export]"
        echo ""
        echo "Examples:"
        echo "  $0 add facebook.com"
        echo "  $0 remove facebook.com"
        echo "  $0 list"
        echo "  $0 import blocklist.txt"
        ;;
esac
