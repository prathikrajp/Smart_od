#!/usr/bin/env python3
"""
Regenerate MAC_address.csv with proper floor assignments:
- Labs (CIT-Guest, named campus locations): Ground Floor  
- Classrooms (CIT-WiFi, named like "ECE-3 Classroom AP"): 1st/2nd/3rd floors (cycling)
"""
import re
import csv

with open('/home/sabareesh/Desktop/smartod/public/MAC_address.csv', 'r') as f:
    raw_content = f.read()

# Re-read the ORIGINAL from the script's first backup -- but we already overwrote.
# Let's re-read from scratch using what we wrote + re-derive.
# Actually the script above already wrote a clean CSV. Let's re-read it and fix floors.

rows = []
with open('/home/sabareesh/Desktop/smartod/public/MAC_address.csv', 'r', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

print(f"Read {len(rows)} rows")

CLASSROOM_FLOORS = ['1st Floor', '2nd Floor', '3rd Floor']
floor_index = 0

output_rows = [['className', 'lat', 'lng', 'floor', 'bssid', 'ssid', 'apLocation']]

for row in rows:
    class_name = row.get('className', '').strip()
    ssid = row.get('ssid', '').strip()
    bssid = row.get('bssid', '').strip()
    ap_loc = row.get('apLocation', '').strip()
    lat = row.get('lat', '').strip()
    lng = row.get('lng', '').strip()
    
    if ssid == 'CIT-Guest' or 'Classroom AP' not in ap_loc:
        # Campus/Lab location - Ground Floor
        floor = 'Ground Floor'
    else:
        # Classroom - assign 1st/2nd/3rd cyclically
        floor = CLASSROOM_FLOORS[floor_index % 3]
        floor_index += 1
    
    output_rows.append([class_name, lat, lng, floor, bssid, ssid, ap_loc])

with open('/home/sabareesh/Desktop/smartod/public/MAC_address.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(output_rows)

print(f"Written {len(output_rows)-1} data rows + 1 header")

# Verify
print("\n--- Sample rows ---")
with open('/home/sabareesh/Desktop/smartod/public/MAC_address.csv', 'r') as f:
    for i, line in enumerate(f):
        if i == 0 or 'ECE-3' in line or 'ECE-1,' in line or '10 labs' in line:
            print(line.rstrip())
