#!/bin/bash
# Test send: FL charity scramble Email 1 to Evan as a club manager
# Usage: ./test-send-evan.sh YOUR_MARKETING_PIN

PIN="${1:-YOUR_PIN_HERE}"

curl -s -X POST "https://betwaggle.com/api/admin/outreach/send" \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "'"$PIN"'",
    "state": "FL",
    "template": "cold-sequence-charity-scramble.html",
    "subject": "Quick idea for your next scramble",
    "from": "Evan at Waggle <evan@betwaggle.com>",
    "leads": [
      {
        "name": "Ratlinks Golf Club",
        "club": "Ratlinks Golf Club",
        "city": "Westchester",
        "state": "FL",
        "contact_email": "evan.ratner@gmail.com",
        "pro_name": "Evan Ratner",
        "ref_code": "EVAN2026"
      }
    ]
  }' | python3 -m json.tool

echo ""
echo "Check evan.ratner@gmail.com for the test email!"
