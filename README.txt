Kliko Calendar shows your waste collection schedule for the next 7 days, based on your address. Works for all addresses in the Netherlands.

Add your address via Devices to see which containers (GFT, restafval, papier, PMD) are collected today and tomorrow. Use the widget on your Homey dashboard for a quick overview, and set up Flows to receive a notification on collection days.

Adding an address
──────────────────
1. Go to Devices → Add device → Kliko Calendar
2. Enter your postal code and house number
3. Optionally add a house number suffix (e.g. A or B)

Multiple addresses
───────────────────
You can add multiple addresses — each as its own device in Homey with separate notifications and automations. Useful if you want to track multiple locations.

Example flow: daily collection reminders
──────────────────────────────────────────
Morning (8:00 AM):
  When: Time is 8:00 AM
  And:  Collection today is Yes → [device]
  Then: Send a notification → "Collected today: [Collection types today]"

Evening (8:00 PM):
  When: Time is 8:00 PM
  And:  Collection tomorrow is Yes → [device]
  Then: Send a notification → "Collected tomorrow: [Collection types tomorrow]"
