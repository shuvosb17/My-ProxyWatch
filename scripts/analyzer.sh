#!/bin/bash

####################################################################
#  ANALYZER.SH - Log Analysis Engine
#  Separate script for detailed log analysis
####################################################################

SQUID_LOG="/var/log/squid/access.log"

print_header() {
    echo "════════════════════════════════════════"
    echo "  Log Analysis - $1"
    echo "════════════════════════════════════════"
}

# Analyze by User
analyze_users() {
    print_header "User Traffic Analysis"
    echo ""
    echo "Top Users (requests):"
    awk '{print $3}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -10
}

# Analyze by Domain
analyze_domains() {
    print_header "Domain Traffic Analysis"
    echo ""
    echo "Top Domains:"
    awk -F'[ /]' '{print $7}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -10
}

# Analyze by Response Size
analyze_sizes() {
    print_header "Traffic Size Analysis"
    echo ""
    awk '{sum+=$5; print $5}' "$SQUID_LOG" | \
        awk '{sum+=$1; count++} END {printf "Total: %.2f MB | Average: %d bytes\n", sum/1048576, sum/count}'
}

# Hourly traffic pattern
analyze_hourly() {
    print_header "Hourly Traffic Pattern"
    echo ""
    awk '{print $1}' "$SQUID_LOG" | cut -d: -f1 | sort | uniq -c
}

# Export report
export_report() {
    print_header "Exporting Full Report"

    local report_file="traffic_report_$(date +%Y%m%d_%H%M%S).txt"

    {
        echo "ProxyWatch Traffic Report"
        echo "Generated: $(date)"
        echo ""
        echo "=== Summary ==="
        echo "Total Requests: $(wc -l < $SQUID_LOG)"
        echo "Unique Users: $(awk '{print $3}' $SQUID_LOG | sort -u | wc -l)"
        echo "Unique Domains: $(awk -F'[ /]' '{print $7}' $SQUID_LOG | sort -u | wc -l)"
        echo ""
        echo "=== Top Users ==="
        awk '{print $3}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -10
        echo ""
        echo "=== Top Domains ==="
        awk -F'[ /]' '{print $7}' "$SQUID_LOG" | sort | uniq -c | sort -rn | head -10
    } > "$report_file"

    echo "Report saved: $report_file"
}

# Main menu
case "${1:-menu}" in
    users)   analyze_users ;;
    domains) analyze_domains ;;
    sizes)   analyze_sizes ;;
    hourly)  analyze_hourly ;;
    export)  export_report ;;
    *)
        echo "Usage: $0 [users|domains|sizes|hourly|export]"
        ;;
esac
