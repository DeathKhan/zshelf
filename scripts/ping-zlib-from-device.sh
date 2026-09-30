#!/bin/sh
# Run on the reMarkable (e.g. ssh root@192.168.0.3) to test connectivity to z-lib.fm

echo "=== /etc/resolv.conf (DNS servers) ==="
cat /etc/resolv.conf

echo ""
echo "=== Resolving z-lib.fm (getent) ==="
getent hosts z-lib.fm 2>&1 || nslookup z-lib.fm 2>&1

echo ""
echo "=== Ping z-lib.fm (3 packets) ==="
ping -c 3 -W 2 z-lib.fm 2>&1

echo ""
echo "=== Try HTTPS with curl (if available) ==="
curl -sI --connect-timeout 5 https://z-lib.fm/ 2>&1 | head -5
